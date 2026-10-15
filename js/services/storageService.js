/**
 * Runner Pulse Analytics - Storage Service
 * 提供具有 TTL (Time-To-Live) 快取機制與安全例外防護的本地儲存服務
 */

import { APP_CONFIG } from '../config.js';

class StorageService {
  constructor() {
    this.prefix = APP_CONFIG.CACHE.PREFIX;
    this.memoryCache = new Map();
  }

  /**
   * 取得帶前綴的 key
   */
  _getKey(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * 寫入快取資料，附帶過期時間戳記
   * @param {string} key 
   * @param {*} data 
   * @param {number} ttlMs 快取有效毫秒數
   */
  set(key, data, ttlMs = APP_CONFIG.CACHE.TTL_MS) {
    const payload = {
      timestamp: Date.now(),
      expiry: Date.now() + ttlMs,
      data
    };

    try {
      localStorage.setItem(this._getKey(key), JSON.stringify(payload));
    } catch (e) {
      console.warn('[StorageService] LocalStorage 存取受限或容量不足，切換為記憶體暫存:', e);
      this.memoryCache.set(this._getKey(key), payload);
    }
  }

  /**
   * 讀取快取資料（若過期或不存在則回傳 null）
   * @param {string} key 
   * @returns {*}
   */
  get(key) {
    const fullKey = this._getKey(key);
    let payload = null;

    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        payload = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[StorageService] LocalStorage 讀取失敗:', e);
      payload = this.memoryCache.get(fullKey) || null;
    }

    if (!payload) return null;

    // 檢查是否逾期 (TTL 驗證)
    if (Date.now() > payload.expiry) {
      this.remove(key);
      return null;
    }

    return payload.data;
  }

  /**
   * 取得該快取的儲存時間戳記
   * @param {string} key 
   * @returns {number|null}
   */
  getTimestamp(key) {
    try {
      const raw = localStorage.getItem(this._getKey(key));
      if (raw) {
        const payload = JSON.parse(raw);
        return payload.timestamp || null;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * 移除特定快取
   * @param {string} key 
   */
  remove(key) {
    const fullKey = this._getKey(key);
    try {
      localStorage.removeItem(fullKey);
    } catch {
      // ignore
    }
    this.memoryCache.delete(fullKey);
  }

  /**
   * 取得跑者個人生理設定 (VDOT, LTHR, Max HR)
   * 若無自訂則回傳 APP_CONFIG.ATHLETE 預設值
   * @returns {{ name: string, vdot: number, lthr: number, maxHr: number }}
   */
  getRunnerProfile() {
    const defaultProfile = {
      name: APP_CONFIG.ATHLETE.name || 'Tobby',
      vdot: Number(APP_CONFIG.ATHLETE.baselineVDOT || 36.0),
      lthr: Number(APP_CONFIG.ATHLETE.lthr || 172),
      maxHr: Number(APP_CONFIG.ATHLETE.maxHR || 196)
    };

    const fullKey = this._getKey('runner_profile');
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            name: parsed.name ? String(parsed.name).trim() : defaultProfile.name,
            vdot: typeof parsed.vdot === 'number' && !isNaN(parsed.vdot) ? parsed.vdot : defaultProfile.vdot,
            lthr: typeof parsed.lthr === 'number' && !isNaN(parsed.lthr) ? parsed.lthr : defaultProfile.lthr,
            maxHr: typeof parsed.maxHr === 'number' && !isNaN(parsed.maxHr) ? parsed.maxHr : defaultProfile.maxHr
          };
        }
      }
    } catch (e) {
      console.warn('[StorageService] 讀取跑者設定失敗，回傳預設值:', e);
    }
    return defaultProfile;
  }

  /**
   * 儲存跑者個人生理設定
   * @param {{ name?: string, vdot?: number, lthr?: number, maxHr?: number }} profile 
   * @returns {boolean}
   */
  saveRunnerProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    const fullKey = this._getKey('runner_profile');
    try {
      const current = this.getRunnerProfile();
      const updated = {
        name: profile.name !== undefined ? String(profile.name).trim() : current.name,
        vdot: profile.vdot !== undefined ? Math.round(Number(profile.vdot) * 10) / 10 : current.vdot,
        lthr: profile.lthr !== undefined ? Math.round(Number(profile.lthr)) : current.lthr,
        maxHr: profile.maxHr !== undefined ? Math.round(Number(profile.maxHr)) : current.maxHr,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(fullKey, JSON.stringify(updated));
      return true;
    } catch (e) {
      console.error('[StorageService] 儲存跑者設定失敗:', e);
      return false;
    }
  }

  /**
   * 重設跑者個人生理設定為預設值
   */
  resetRunnerProfile() {
    const fullKey = this._getKey('runner_profile');
    try {
      localStorage.removeItem(fullKey);
    } catch {
      // ignore
    }
    return this.getRunnerProfile();
  }

  /**
   * 清除專案所有快取
   */
  clearAll() {
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(this.prefix)) {
          localStorage.removeItem(k);
        }
      });
    } catch {
      // ignore
    }
    this.memoryCache.clear();
  }
}

export const storageService = new StorageService();

