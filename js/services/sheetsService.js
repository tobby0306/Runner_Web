/**
 * Runner Pulse Analytics - Google Sheets Service
 * 負責 Google Sheets CSV 資料擷取、平行平行批次處理、快取與平滑降級 (整合 Task T-02 & T-03)
 */

import { APP_CONFIG } from '../config.js';
import { parseCSV } from '../utils/csvParser.js';
import { storageService } from './storageService.js';
import { MOCK_DATA } from '../mock/mockData.js';
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
          csvText = await proxyResp.text();
        }
      } catch {
        // 若無後端 proxy，靜默略過並嘗試策略 2
      }
    }

    // 策略 2: 直連 Google Sheets 公開 CSV Export URL
    if (!csvText) {
      const directUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidStr}`;
      const response = await fetch(directUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/csv' }
      });

      if (!response.ok) {
        throw new Error(`Google Sheets CSV 擷取失敗 [HTTP ${response.status}] (GID: ${gidStr})`);
      }
      csvText = await response.text();
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
    if (!rawRows || rawRows.length < 4) return MOCK_DATA.trainingZones;
    const zones = [];
    
    // 依據試算表實際結構: Row 2 為標題，Row 3~8 為 Zone 1 ~ 5b
    for (let i = 3; i < Math.min(rawRows.length, 9); i++) {
      const row = rawRows[i];
      if (!row || row.length < 3 || !row[0]) continue;
      const zoneName = row[0].trim();
      const paceGuide = row[1] ? row[1].trim() : '';
      const hrTarget = row[2] ? row[2].trim() : '';
      const purpose = row[3] ? row[3].trim() : '';

      zones.push({
        zone: zoneName.split(' ')[0] || `Zone ${i-2}`,
        name: zoneName,
        paceGuide,
        hrTarget,
        pctLTHR: zoneName.includes('Zone 1') ? '65%–80%' : 
                 zoneName.includes('Zone 2') ? '80%–89%' : 
                 zoneName.includes('Zone 3') ? '89%–95%' : 
                 zoneName.includes('Zone 4') ? '95%–100%' : '>100%',
        purpose
      });
    }

    return zones.length > 0 ? zones : MOCK_DATA.trainingZones;
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
