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
