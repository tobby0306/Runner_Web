/**
 * Runner Pulse Analytics - Open-Meteo Weather Service (Task T-WX-02)
 * 自動根據訓練日期、時間與練跑地點抓取真實歷史氣溫與相對濕度
 * 支援 LocalStorage 長效快取與單筆手動覆寫 (Manual Override)
 */

import { storageService } from './storageService.js';

export const TAIWAN_CITIES = [
  { id: 'taipei', name: '台北市', lat: 25.0330, lon: 121.5654 },
  { id: 'new_taipei', name: '新北市', lat: 25.0120, lon: 121.4657 },
  { id: 'taoyuan', name: '桃園市', lat: 24.9936, lon: 121.3010 },
  { id: 'hsinchu', name: '新竹市', lat: 24.8138, lon: 120.9675 },
  { id: 'taichung', name: '台中市', lat: 24.1477, lon: 120.6736 },
  { id: 'tainan', name: '台南市', lat: 22.9997, lon: 120.2270 },
  { id: 'kaohsiung', name: '高雄市', lat: 22.6273, lon: 120.3014 },
  { id: 'yilan', name: '宜蘭縣', lat: 24.7021, lon: 121.7378 },
  { id: 'hualien', name: '花蓮縣', lat: 23.9872, lon: 121.6016 }
];

const LOCATION_KEY = 'weather_location_v1';
const OVERRIDES_KEY = 'weather_overrides_v1';
const HISTORICAL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 歷史天氣快取 30 天
const RECENT_TTL_MS = 60 * 60 * 1000; // 近 2 天天氣快取 1 小時

class WeatherService {
  constructor() {
    this.pendingRequests = new Map();
  }

  /**
   * 取得預設練跑地點設定
   * @returns {{ cityId: string, name: string, lat: number, lon: number }}
   */
  getLocationSetting() {
    const saved = storageService.get(LOCATION_KEY);
    if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') {
      return saved;
    }
    const def = TAIWAN_CITIES[0];
    return { cityId: def.id, name: def.name, lat: def.lat, lon: def.lon };
  }

  /**
   * 儲存預設練跑地點設定
   * @param {{ cityId: string, name: string, lat: number, lon: number }} loc
   */
  saveLocationSetting(loc) {
    if (!loc || isNaN(loc.lat) || isNaN(loc.lon)) return false;
    storageService.set(LOCATION_KEY, {
      cityId: loc.cityId || 'custom',
      name: String(loc.name || '自訂座標').trim(),
      lat: Math.round(Number(loc.lat) * 10000) / 10000,
      lon: Math.round(Number(loc.lon) * 10000) / 10000
    }, HISTORICAL_TTL_MS * 12);
    return true;
  }

  /**
   * 讀取所有手動天氣覆寫紀錄
   * @returns {Record<string, { tempC: number, humidityPct: number, updatedAt: number }>}
   */
  getAllOverrides() {
    return storageService.get(OVERRIDES_KEY) || {};
  }

  /**
   * 取得單筆活動的手動覆寫天氣
   * @param {string} activityId
   */
  getOverride(activityId) {
    if (!activityId) return null;
    const all = this.getAllOverrides();
    return all[String(activityId)] || null;
  }

  /**
   * 儲存單筆活動的手動天氣覆寫
   * @param {string} activityId
   * @param {number} tempC
   * @param {number} humidityPct
   */
  saveOverride(activityId, tempC, humidityPct) {
    if (!activityId || isNaN(tempC) || isNaN(humidityPct)) return false;
    const all = this.getAllOverrides();
    all[String(activityId)] = {
      tempC: Math.round(Number(tempC) * 10) / 10,
      humidityPct: Math.min(100, Math.max(1, Math.round(Number(humidityPct)))),
      updatedAt: Date.now()
    };
    storageService.set(OVERRIDES_KEY, all, HISTORICAL_TTL_MS * 12);
    return true;
  }

  /**
   * 清除單筆活動的手動天氣覆寫（還原回自動抓取）
   * @param {string} activityId
   */
  clearOverride(activityId) {
    if (!activityId) return;
    const all = this.getAllOverrides();
    if (all[String(activityId)]) {
      delete all[String(activityId)];
      storageService.set(OVERRIDES_KEY, all, HISTORICAL_TTL_MS * 12);
    }
  }

  /**
   * 解析活動日期時間為本地 YYYY-MM-DD 與小時 (0-23)
   * @param {Date|string} dateInput
   * @returns {{ dateStr: string, hour: number, daysAgo: number }|null}
   */
  _parseLocalDateHour(dateInput) {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = d.getHours();
    const dateStr = `${year}-${month}-${day}`;

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const targetMidnight = new Date(year, d.getMonth(), d.getDate());
    const daysAgo = Math.round((todayMidnight - targetMidnight) / (24 * 60 * 60 * 1000));

    return { dateStr, hour, daysAgo };
  }

  /**
   * 從 Open-Meteo 取得指定日期 24 小時天氣資料並快取
   * @param {string} dateStr YYYY-MM-DD
   * @param {number} daysAgo
   * @param {{ lat: number, lon: number, name: string }} loc
   * @returns {Promise<{ temps: number[], humidities: number[] }|null>}
   */
  async _fetchDailyHourlyData(dateStr, daysAgo, loc) {
    const cacheKey = `wx_day_${loc.lat.toFixed(2)}_${loc.lon.toFixed(2)}_${dateStr}`;
    const cached = storageService.get(cacheKey);
    if (cached && Array.isArray(cached.temps) && Array.isArray(cached.humidities)) {
      return cached;
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const promise = (async () => {
      try {
        // 未來日期無法查歷史天氣
        if (daysAgo < 0) return null;

        // Open-Meteo archive API 通常涵蓋至 5 天前；近 5 天使用 forecast API (含 past_days/date)
        const baseUrl = daysAgo <= 5
          ? 'https://api.open-meteo.com/v1/forecast'
          : 'https://archive-api.open-meteo.com/v1/archive';

        const url = `${baseUrl}?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,relative_humidity_2m&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
        const res = await fetch(url);
        if (!res.ok) return null;

        const json = await res.json();
        const temps = json?.hourly?.temperature_2m;
        const humidities = json?.hourly?.relative_humidity_2m;
        if (!Array.isArray(temps) || !Array.isArray(humidities) || temps.length === 0) {
          return null;
        }

        const payload = { temps, humidities };
        const ttl = daysAgo <= 2 ? RECENT_TTL_MS : HISTORICAL_TTL_MS;
        storageService.set(cacheKey, payload, ttl);
        return payload;
      } catch (err) {
        console.warn(`[WeatherService] 取得 ${dateStr} 天氣失敗:`, err);
        return null;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, promise);
    return promise;
  }

  /**
   * 取得單筆活動的氣溫與濕度（優先使用手動覆寫，否則自動從 Open-Meteo 取得）
   * @param {Date|string} activityDate
   * @param {string} [activityId]
   * @returns {Promise<{ tempC: number, humidityPct: number, source: 'manual'|'auto', locationName: string }|null>}
   */
  async getWeatherForActivity(activityDate, activityId = '') {
    const loc = this.getLocationSetting();

    // 1. 優先回傳使用者手動覆寫數值
    if (activityId) {
      const override = this.getOverride(activityId);
      if (override) {
        return {
          tempC: override.tempC,
          humidityPct: override.humidityPct,
          source: 'manual',
          locationName: loc.name
        };
      }
    }

    // 2. 解析時間並查詢 Open-Meteo
    const parsed = this._parseLocalDateHour(activityDate);
    if (!parsed) return null;

    const daily = await this._fetchDailyHourlyData(parsed.dateStr, parsed.daysAgo, loc);
    if (!daily) return null;

    const idx = Math.min(daily.temps.length - 1, Math.max(0, parsed.hour));
    const tempC = daily.temps[idx];
    const humidityPct = daily.humidities[idx];
    if (tempC == null || humidityPct == null) return null;

    return {
      tempC: Math.round(Number(tempC) * 10) / 10,
      humidityPct: Math.round(Number(humidityPct)),
      source: 'auto',
      locationName: loc.name
    };
  }

  /**
   * 批次取得多筆活動天氣（控制並發數避免請求過載）
   * @param {Array<object>} activities
   * @param {number} [concurrency=3]
   * @returns {Promise<Map<string, object>>}
   */
  async batchGetWeatherForActivities(activities = [], concurrency = 3) {
    const resultMap = new Map();
    const queue = [...activities];

    const worker = async () => {
      while (queue.length > 0) {
        const act = queue.shift();
        if (!act || !act.activityId) continue;
        const wx = await this.getWeatherForActivity(act.activityDate || act.activityDateRaw, act.activityId);
        if (wx) {
          resultMap.set(String(act.activityId), wx);
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
    await Promise.all(workers);
    return resultMap;
  }
}

export const weatherService = new WeatherService();
