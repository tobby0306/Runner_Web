/**
 * Runner Pulse Analytics - Formatters & Parser Helpers
 */

/**
 * 將秒數轉為格式化時間字串 (HH:MM:SS 或 MM:SS)
 * @param {number} totalSeconds
 * @param {boolean} forceHours 是否強制顯示小時
 * @returns {string}
 */
export function formatDuration(totalSeconds, forceHours = false) {
  if (isNaN(totalSeconds) || totalSeconds === null) return '--:--';
  const sec = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  if (h > 0 || forceHours) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * 將時間字串 (HH:MM:SS 或 MM:SS) 解析為總秒數
 * @param {string} timeStr 範例: '1:30:04' 或 '45:20'
 * @returns {number}
 */
export function parseDuration(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

/**
 * 將每公里配速 (秒/km) 格式化為 M:SS/km
 * @param {number} secPerKm 
 * @returns {string}
 */
export function formatPace(secPerKm) {
  if (!secPerKm || isNaN(secPerKm) || secPerKm <= 0) return '-:--';
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}/km`;
}

/**
 * 將配速字串 (例如 "7:05" 或 "7:05/km") 解析為每公里秒數
 * @param {string} paceStr 
 * @returns {number}
 */
export function parsePace(paceStr) {
  if (!paceStr || typeof paceStr !== 'string') return 0;
  const clean = paceStr.replace(/\/km/i, '').trim();
  const parts = clean.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * 安全解析日期之西元年份 (相容 Date 物件、ISO 字串與 LocalStorage 反序列化字串)
 * @param {Date|string|number} dateInput 
 * @returns {number|null}
 */
export function getActivityYear(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear();
    return isNaN(y) ? null : y;
  }
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

/**
 * 格式化日期為 YYYY-MM-DD
 * @param {Date|string} dateInput 
 * @returns {string}
 */
export function formatDate(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
