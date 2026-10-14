/**
 * Runner Pulse Analytics - System Configuration
 * 依據 running_analyzer_spec.md 規格書設定
 */

export const APP_CONFIG = {
  // Google Sheets ID
  SPREADSHEET_ID: '1DahiYbLvl4zR6-5EABCSwTATCtkP7N3IywSxWo5JKas',

  // 頁籤 GID 對照表 (依據規格書 Section 12 & 13)
  TABS: {
    LOGS: {
      key: 'logs',
      gid: '0',
      name: '訓練日誌',
      rangeDescription: '所有 Garmin 訓練歷史與每公里分段'
    },
    ZONES: {
      key: 'zones',
      gid: '1124408140',
      name: '訓練區間',
      rangeDescription: 'VDOT 36 配速與心率區間表 (Max HR: 196, LTHR: 172)'
    },
    SCHEDULE: {
      key: 'schedule',
      gid: '196879307',
      name: '課表',
      rangeDescription: 'W1-W7 倒數計時週目標'
    }
  },

  // 快取設定 (變更版本前綴 runner_pulse_v6_ 以精確辨識目標賽事測驗)
  CACHE: {
    PREFIX: 'runner_pulse_v6_',
    TTL_MS: 60 * 60 * 1000, // 1 hour
    KEYS: {
      LOGS: 'logs_data',
      ZONES: 'zones_data',
      SCHEDULE: 'schedule_data',
      METADATA: 'sync_metadata'
    }
  },

  // 跑者預設設定 (規格書 1.2 頁籤 2 基準)
  ATHLETE: {
    name: 'Tobby',
    baselineVDOT: 36.0,
    maxHR: 196,
    lthr: 172,
    lastTestDate: '2026-03-14',
    targetTestDate: '2026-10-24'
  },

  // 訓練類型枚舉 (Jack Daniels E, M, T, I, R + RACE, TEST)
  WORKOUT_TYPES: {
    EASY: 'EASY',             // E 輕鬆跑
    MARATHON: 'MARATHON',     // M 馬拉松配速跑
    THRESHOLD: 'THRESHOLD',   // T 乳酸門檻跑
    INTERVAL: 'INTERVAL',     // I 最大攝氧量間歇
    REPETITION: 'REPETITION', // R 速度重複跑
    RACE: 'RACE',             // 比賽賽事
    TEST: 'TEST',             // 跑力測驗
    GENERAL: 'GENERAL'        // 一般慢跑
  }
};
