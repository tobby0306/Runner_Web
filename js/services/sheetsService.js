/**
 * Runner Pulse Analytics - Google Sheets Service
 * 負責 Google Sheets CSV 資料擷取、平行平行批次處理、快取與平滑降級 (整合 Task T-02 & T-03)
 */

import { APP_CONFIG } from '../config.js?v=2.2.2';
import { parseCSV } from '../utils/csvParser.js?v=2.2.2';
import { storageService } from './storageService.js?v=2.2.2';
import { MOCK_DATA } from '../mock/mockData.js?v=2.2.2';
import { parseActivities, classifyWorkoutType, getActivityTimestamp } from '../utils/activityParser.js';

export const DataSourceStatus = {
  LOADING: 'LOADING',
  LIVE: 'LIVE',         // 直接連線 Google Sheets 即時取得
  CACHED: 'CACHED',     // 命中本地 LocalStorage 快取 (未過期)
  MOCK: 'MOCK',         // 網路或 CORS 受限時平滑降級為 Mock 資料
  ERROR: 'ERROR'
};

class SheetsService {
  constructor() {
    this.sheetId = APP_CONFIG.SPREADSHEET_ID;
    this.publishedId = APP_CONFIG.PUBLISHED_ID;
    this.tabs = APP_CONFIG.TABS;
    this.currentStatus = DataSourceStatus.LOADING;
    this.lastSyncTime = null;
  }

  /**
   * T-02 規範函式：依 sheetId 與 gid 取得 CSV 並解析為二維陣列 (string[][])
   * 優先嘗試同源 API Proxy (/api/sheets?gid=...)，若不可用則直連 Google Docs Export
   * @param {string} sheetId 
   * @param {string|number} gid 
   * @returns {Promise<string[][]>}
   */
  async fetchSheetData(sheetId = this.sheetId, gid = '0') {
    const gidStr = String(gid);
    let csvText = '';

    // 優先策略 1: 若處於本機開發環境 (localhost / 127.0.0.1)，嘗試本機 Proxy 端點
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalhost) {
      try {
        const proxyUrl = `/api/sheets?gid=${gidStr}`;
        const proxyResp = await fetch(proxyUrl, {
          method: 'GET',
          headers: { 'Accept': 'text/csv' }
        });
        if (proxyResp.ok) {
          const txt = await proxyResp.text();
          if (txt && !txt.includes('"error":') && txt.length > 50) {
            csvText = txt;
          }
        }
      } catch {
        // 若無後端 proxy 或 502，靜默略過並嘗試下一策略
      }
    }

    // 策略 2: 直連 Google Sheets「發布到網路」官方公開端點 (/d/e/{publishedId}/pub?output=csv&gid=...)
    // 此端點 Google 官方原生支援 CORS (Access-Control-Allow-Origin: *)，無須任何代理伺服器
    if (!csvText && this.publishedId) {
      const pubUrl = `https://docs.google.com/spreadsheets/d/e/${this.publishedId}/pub?output=csv&gid=${gidStr}`;
      try {
        const resp = await fetch(pubUrl, { method: 'GET' });
        if (resp.ok) {
          const txt = await resp.text();
          if (txt && !txt.includes('<!DOCTYPE html>') && !txt.includes('ServiceLogin') && txt.length > 50) {
            csvText = txt;
          }
        }
      } catch {
        // 靜默嘗試下一管道
      }
    }

    // 策略 3: 直連原始 sheetId 之 pub?output=csv 端點
    if (!csvText) {
      const pubUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv&gid=${gidStr}`;
      try {
        const resp = await fetch(pubUrl, { method: 'GET' });
        if (resp.ok) {
          const txt = await resp.text();
          if (txt && !txt.includes('<!DOCTYPE html>') && !txt.includes('ServiceLogin') && txt.length > 50) {
            csvText = txt;
          }
        }
      } catch {
        // 靜默嘗試下一管道
      }
    }

    // 策略 3: 直連 Google Sheets 公開 CSV Export URL
    if (!csvText) {
      try {
        const directUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidStr}`;
        const response = await fetch(directUrl, {
          method: 'GET',
          headers: { 'Accept': 'text/csv' }
        });
        if (response.ok) {
          const txt = await response.text();
          if (txt && !txt.includes('<!DOCTYPE html>') && !txt.includes('ServiceLogin') && txt.length > 50) {
            csvText = txt;
          }
        }
      } catch {
        // 靜默嘗試下一管道
      }
    }

    // 策略 4: Google Visualization API (GViz CSV)
    if (!csvText) {
      try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gidStr}`;
        const resp = await fetch(gvizUrl, { method: 'GET' });
        if (resp.ok) {
          const txt = await resp.text();
          if (txt && !txt.includes('<!DOCTYPE html>') && txt.length > 50) {
            csvText = txt;
          }
        }
      } catch {
        // 靜默嘗試下一管道
      }
    }

    // 策略 5: 公用 CORS 轉發代理 (若試算表已設為「任何知道連結的人皆可檢視」但尚未執行發布到網路)
    if (!csvText) {
      const targetExport = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidStr}`;
      const proxyList = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetExport)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(targetExport)}`
      ];

      for (const pUrl of proxyList) {
        try {
          const resp = await fetch(pUrl, { method: 'GET' });
          if (resp.ok) {
            const txt = await resp.text();
            if (txt && !txt.includes('<!DOCTYPE html>') && !txt.includes('ServiceLogin') && txt.length > 50) {
              csvText = txt;
              break;
            }
          }
        } catch {
          // 靜默嘗試下一個代理
        }
      }
    }

    if (!csvText) {
      throw new Error(`無法連線 Google Sheets 資料來源 (GID: ${gidStr})`);
    }

    const rows = parseCSV(csvText);
    return rows;
  }

  async fetchSheetCSV(sheetId, gid) {
    return this.fetchSheetData(sheetId, gid);
  }

  /**
   * 暴露訓練類型自動判定函式 (符合規格書 5.1 商業邏輯)
   */
  classifyWorkoutType(name) {
    return classifyWorkoutType(name);
  }

  /**
   * T-02 規範函式：並行取得 3 個頁籤並透過 T-03 解析層轉換
   * @param {boolean} forceRefresh 是否強制略過快取
   * @returns {Promise<{ logs: any[], zones: any[], schedule: any[], status: string, lastSync: Date, rawCounts: object }>}
   */
  async batchFetchAllTabs(forceRefresh = false) {
    this.currentStatus = DataSourceStatus.LOADING;

    // 1. 檢查快取 (若非強制重整)
    if (!forceRefresh) {
      const cachedLogs = storageService.get(APP_CONFIG.CACHE.KEYS.LOGS);
      const cachedZones = storageService.get(APP_CONFIG.CACHE.KEYS.ZONES);
      const cachedSchedule = storageService.get(APP_CONFIG.CACHE.KEYS.SCHEDULE);

      if (cachedLogs && cachedZones && cachedSchedule) {
        this.currentStatus = DataSourceStatus.CACHED;
        this.lastSyncTime = new Date(storageService.getTimestamp(APP_CONFIG.CACHE.KEYS.LOGS) || Date.now());
        
        // 確保快取讀出之資料一律更新分類並嚴格倒序排列
        cachedLogs.forEach(l => {
          l.workoutType = classifyWorkoutType(l.activityName);
        });
        cachedLogs.sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));

        console.log('[T-02:batchFetchAllTabs] 命中本地快取 (Local Cache Hit):', {
          訓練日誌筆數: cachedLogs.length,
          訓練區間筆數: cachedZones.length,
          課表項目數: cachedSchedule.length,
          快取同步時間: this.lastSyncTime.toLocaleString()
        });
        return {
          logs: cachedLogs,
          zones: cachedZones,
          schedule: cachedSchedule,
          status: this.currentStatus,
          lastSync: this.lastSyncTime,
          rawCounts: {
            logs: cachedLogs.length,
            zones: cachedZones.length,
            schedule: cachedSchedule.length
          }
        };
      }
    }

    // 2. 嘗試並行連線取得 3 個頁籤之二維陣列 (Promise.all)
    try {
      console.log('[T-02:batchFetchAllTabs] 開始並行讀取 Google Sheets 3 個頁籤...');
      const [logsRaw, zonesRaw, scheduleRaw] = await Promise.all([
        this.fetchSheetData(this.sheetId, this.tabs.LOGS.gid),
        this.fetchSheetData(this.sheetId, this.tabs.ZONES.gid),
        this.fetchSheetData(this.sheetId, this.tabs.SCHEDULE.gid)
      ]);

      console.log('[T-02:batchFetchAllTabs] ✅ 原始 rows 數量統計 (Raw Rows Count):', {
        '頁籤 1 - 訓練日誌 (gid=0)': `${logsRaw.length} rows`,
        '頁籤 2 - 訓練區間 (gid=1124408140)': `${zonesRaw.length} rows`,
        '頁籤 3 - 課表 (gid=196879307)': `${scheduleRaw.length} rows`
      });

      // T-03: 透過解析層轉換資料列
      const parsedLogs = parseActivities(logsRaw);
      const parsedZones = this._transformRawZones(zonesRaw);
      const parsedSchedule = this._transformRawSchedule(scheduleRaw);

      // 儲存至本地快取 (TTL 1 小時)
      storageService.set(APP_CONFIG.CACHE.KEYS.LOGS, parsedLogs);
      storageService.set(APP_CONFIG.CACHE.KEYS.ZONES, parsedZones);
      storageService.set(APP_CONFIG.CACHE.KEYS.SCHEDULE, parsedSchedule);

      this.currentStatus = DataSourceStatus.LIVE;
      this.lastSyncTime = new Date();

      return {
        logs: parsedLogs,
        zones: parsedZones,
        schedule: parsedSchedule,
        status: this.currentStatus,
        lastSync: this.lastSyncTime,
        rawCounts: {
          logs: logsRaw.length,
          zones: zonesRaw.length,
          schedule: scheduleRaw.length
        }
      };
    } catch (networkError) {
      console.warn('[T-02:batchFetchAllTabs] 網路或來源存取異常，啟動安全容錯機制:', networkError.message);

      // Fallback 1: 讀取過期快取
      const staleLogs = storageService.get(APP_CONFIG.CACHE.KEYS.LOGS);
      if (staleLogs) {
        this.currentStatus = DataSourceStatus.CACHED;
        this.lastSyncTime = new Date(storageService.getTimestamp(APP_CONFIG.CACHE.KEYS.LOGS) || Date.now());
        return {
          logs: staleLogs,
          zones: storageService.get(APP_CONFIG.CACHE.KEYS.ZONES) || MOCK_DATA.trainingZones,
          schedule: storageService.get(APP_CONFIG.CACHE.KEYS.SCHEDULE) || MOCK_DATA.schedule,
          status: this.currentStatus,
          lastSync: this.lastSyncTime,
          rawCounts: { logs: staleLogs.length, zones: 6, schedule: 6 }
        };
      }

      // Fallback 2: 平滑降級至規格書標準 Mock Data (經過 T-03 相同結構洗禮)
      this.currentStatus = DataSourceStatus.MOCK;
      this.lastSyncTime = new Date();

      const normalizedMock = MOCK_DATA.trainingLogs.map(l => ({
        ...l,
        workoutType: classifyWorkoutType(l.activityName),
        lapSplits: l.lapSplitsRaw ? [
          { lap: 1, pace: "7:32", paceSec: 452, hr: 110 },
          { lap: 2, pace: "7:17", paceSec: 437, hr: 118 }
        ] : []
      }));

      return {
        logs: normalizedMock,
        zones: MOCK_DATA.trainingZones,
        schedule: MOCK_DATA.schedule,
        status: this.currentStatus,
        lastSync: this.lastSyncTime,
        rawCounts: {
          logs: MOCK_DATA.trainingLogs.length,
          zones: MOCK_DATA.trainingZones.length,
          schedule: MOCK_DATA.schedule.length
        }
      };
    }
  }

  _transformRawZones(rawRows) {
    if (!rawRows || !Array.isArray(rawRows) || rawRows.length < 2) return MOCK_DATA.trainingZones;
    const defaults = MOCK_DATA.trainingZones;

    // 1. 動態掃描所有列，完全不預設列索引 (徹底根除 Zone 1 因索引偏移被略過之問題)
    const table2Map = {};
    const table1Rows = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length < 2 || !row[0]) continue;
      const cell0 = String(row[0]).trim();
      const zMatch = cell0.match(/^Zone\s*([0-9]+[a-z]?)/i);
      if (!zMatch) continue;

      const zoneKey = `Zone ${zMatch[1]}`;
      const cell1 = String(row[1] || '').trim();

      // 判斷屬於 Table 2 (實戰心率區間表) 還是 Table 1 (配速與訓練區間表)
      // Table 2 的欄位 1 為 % LTHR 百分比 (包含 % 符號)
      if (cell1.includes('%')) {
        let rpeText = '';
        let tacticsText = '';
        for (let colIdx = 1; colIdx < row.length; colIdx++) {
          const val = String(row[colIdx] || '').trim();
          if (val.toUpperCase().includes('RPE')) {
            rpeText = val;
          } else if (val.length > 8 && !val.includes('%') && !val.includes('bpm')) {
            tacticsText = val;
          }
        }
        table2Map[zoneKey] = {
          pctLTHR: cell1,
          hrTarget: row[2] ? String(row[2]).trim() : '',
          tactics: tacticsText,
          rpe: rpeText
        };
      } else {
        // Table 1 (包含配速指引、主要目的等)
        table1Rows.push({
          rawZone: cell0,
          zoneKey: zoneKey,
          paceGuide: cell1,
          hrTarget: row[2] ? String(row[2]).trim() : '',
          purpose: row[3] ? String(row[3]).trim() : ''
        });
      }
    }

    const zones = [];
    let seenZone5Count = 0;

    for (const item of table1Rows) {
      let zoneTag = item.zoneKey;
      if (zoneTag.toLowerCase() === 'zone 5') {
        seenZone5Count++;
        zoneTag = seenZone5Count > 1 ? 'Zone 5b' : 'Zone 5a';
      }

      const defaultMeta = defaults.find(d => d.zone === zoneTag || d.name.includes(zoneTag)) || {};
      const t2 = table2Map[zoneTag.replace(/[ab]$/i, '')] || table2Map[zoneTag] || {};

      zones.push({
        zone: zoneTag,
        name: item.rawZone,
        paceGuide: item.paceGuide || defaultMeta.paceGuide || '',
        hrTarget: item.hrTarget || t2.hrTarget || defaultMeta.hrTarget || '',
        pctLTHR: t2.pctLTHR || defaultMeta.pctLTHR || (
          zoneTag === 'Zone 1' ? '65%–80%' : 
          zoneTag === 'Zone 2' ? '80%–89%' : 
          zoneTag === 'Zone 3' ? '89%–95%' : 
          zoneTag === 'Zone 4' ? '95%–100%' : '> 100%'
        ),
        pctMaxHR: defaultMeta.pctMaxHR || '',
        rpe: t2.rpe || defaultMeta.rpe || '',
        tactics: t2.tactics || defaultMeta.tactics || '',
        purpose: item.purpose || defaultMeta.purpose || ''
      });
    }

    // 關鍵防禦機制：確保 Zone 1 絕對存在，避免任何試算表缺漏或格式例外
    if (!zones.some(z => z.zone.toLowerCase().includes('zone 1'))) {
      const defaultZ1 = defaults.find(d => d.zone === 'Zone 1');
      const t2Z1 = table2Map['Zone 1'] || {};
      if (defaultZ1) {
        zones.unshift({
          ...defaultZ1,
          pctLTHR: t2Z1.pctLTHR || defaultZ1.pctLTHR,
          rpe: t2Z1.rpe || defaultZ1.rpe,
          tactics: t2Z1.tactics || defaultZ1.tactics
        });
      }
    }

    // 確保整體區間數量充足，否則回退至完整標準 MOCK_DATA
    return zones.length >= 5 ? zones : MOCK_DATA.trainingZones;
  }

  _transformRawSchedule(rawRows) {
    if (!rawRows || rawRows.length < 2) return MOCK_DATA.schedule;
    const items = [];
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length < 4 || !row[0]) continue;
      items.push({
        week: row[0] ? row[0].trim() : '',
        date: row[1] ? row[1].trim() : '',
        day: row[2] ? row[2].trim() : '',
        name: row[3] ? row[3].trim() : '',
        tags: row[4] ? row[4].trim() : 'E',
        estKm: parseFloat(row[5]) || 0,
        actKm: row[6] && row[6].trim() !== '' ? parseFloat(row[6]) : null,
        notes: row[7] ? row[7].trim() : ''
      });
    }
    return items.length > 0 ? items : MOCK_DATA.schedule;
  }
}

export const sheetsService = new SheetsService();
