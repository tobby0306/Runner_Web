/**
 * Runner Pulse Analytics - Activity Parser (Task T-03 完整修復版)
 * 負責將 Google Sheets CSV 轉換為結構化 Activity 物件，支援：
 * 1. 嚴格依日期最新到最舊倒序排列 (由新到舊 / Newest First)
 * 2. 完整 Jack Daniels 7 大分類體系 (E, M, T, I, R, RACE, TEST)
 * 3. 每公里分段配速強度自動對標 (Lap Splits Pace Zone Classification)
 */

import { APP_CONFIG } from '../config.js';
import { parseDuration, parsePace, formatPace, getActivityYear } from './formatters.js';

/**
 * 分段正規表達式：支援距離制 (1k, 1.25k, 2.8k) 與時間制 (3min, 5min, 15min) 及純數字
 * 格式範例：
 * - 1k(7:32, 110bpm)
 * - 15min(6:43, 128bpm)-平均步頻183平均步幅0.8
 * - 3min(5:34, 149bpm)-平均步頻187平均步幅0.96 *break 1min
 */
const LAP_SPLIT_REGEX = /([0-9]+(?:\.[0-9]+)?(?:min|k|km)?|[0-9]+)\s*\(\s*(\d+:\d+)\s*,\s*(?:Max\d+bpm,\s*Avg)?(\d+(?:\.\d+)?)\s*bpm\s*\)([^\|\n\"]*)/gi;

/**
 * 安全解析活動之毫秒時間戳記 (供高精度倒序排序)
 * @param {object} act 
 * @returns {number}
 */
export function getActivityTimestamp(act) {
  if (!act) return 0;
  if (typeof act.timestamp === 'number' && act.timestamp > 0) return act.timestamp;
  const raw = act.activityDate || act.activityDateRaw;
  if (!raw) return 0;
  const d = new Date(raw);
  const t = d.getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * 依配速秒數判定該公里落入哪一個 Jack Daniels 強度區間 (基準: VDOT 36)
 * @param {number} paceSec 每公里秒數
 * @returns {{ code: string, label: string, badgeClass: string }}
 */
export function classifyPaceZone(paceSec) {
  if (!paceSec || paceSec <= 0) {
    return { code: 'E', label: 'E 輕鬆', badgeClass: 'badge-easy' };
  }

  // 基準 VDOT 36 配速區間對照：
  // Zone 1 & 2 (E 輕鬆跑): > 6:25/km (> 385秒)
  // Zone 3 (M 馬拉松配速): 6:01 ~ 6:24/km (361 ~ 384秒)
  // Zone 4 (T 乳酸門檻): 5:15 ~ 6:00/km (315 ~ 360秒, 基準 5:29)
  // Zone 5a (I 最大攝氧): 4:55 ~ 5:14/km (295 ~ 314秒, 基準 5:04)
  // Zone 5b (R 速度重複): < 4:55/km (< 295秒, 基準 4:48)
  if (paceSec >= 385) {
    return { code: 'E', label: 'E 輕鬆配速', badgeClass: 'badge-easy' };
  } else if (paceSec >= 361) {
    return { code: 'M', label: 'M 馬拉松速', badgeClass: 'badge-marathon' };
  } else if (paceSec >= 315) {
    return { code: 'T', label: 'T 門檻配速', badgeClass: 'badge-threshold' };
  } else if (paceSec >= 295) {
    return { code: 'I', label: 'I 攝氧配速', badgeClass: 'badge-interval' };
  } else {
    return { code: 'R', label: 'R 速度衝刺', badgeClass: 'badge-repetition' };
  }
}

/**
 * 解析分段原始文字為結構化陣列，支援「時間制 (3min, 5min, 15min)」與「距離制 (1k, 2k)」
 * 同時抽取步頻、步幅與休息時間 (*break 1min)
 * @param {string} rawSplitsText 
 * @returns {Array<object>}
 */
export function parseLapSplits(rawSplitsText) {
  if (!rawSplitsText || typeof rawSplitsText !== 'string') return [];

  const splits = [];
  const regex = new RegExp(LAP_SPLIT_REGEX.source, 'gi');
  let match;
  let index = 0;

  while ((match = regex.exec(rawSplitsText)) !== null) {
    const rawPrefix = match[1].trim();
    const paceStr = match[2];
    const hrVal = parseFloat(match[3]);
    const paceSec = parsePace(paceStr);
    const extraNote = match[4] ? match[4].trim() : '';

    const isTimeBased = /min/i.test(rawPrefix);
    let label = rawPrefix;
    if (!/min|k/i.test(label)) {
      label = `${label}k`;
    }

    // 抽取額外步頻與休息間歇資訊
    let cadence = null;
    let stride = null;
    let breakNote = null;

    if (extraNote) {
      const cadMatch = extraNote.match(/步頻\s*(\d+)/);
      if (cadMatch) cadence = parseInt(cadMatch[1], 10);

      const strideMatch = extraNote.match(/步幅\s*([0-9\.]+)/);
      if (strideMatch) stride = parseFloat(strideMatch[1]);

      const breakMatch = extraNote.match(/(\*?break\s*[0-9a-zA-Z\s]+)/i);
      if (breakMatch) breakNote = breakMatch[1].replace(/^\*/, '').trim();
    }

    splits.push({
      lap: index + 1,
      rawPrefix,
      label,
      isTimeBased,
      pace: paceStr,
      paceSec,
      hr: isNaN(hrVal) ? 0 : Math.round(hrVal),
      paceZone: classifyPaceZone(paceSec),
      cadence,
      stride,
      breakNote,
      extraNote
    });
    index++;
  }

  return splits;
}

/**
 * 依活動名稱精準判定訓練類型 (Jack Daniels 7 大分類體系)
 * @param {string} name 
 * @returns {string}
 */
export function classifyWorkoutType(name) {
  if (!name || typeof name !== 'string') return APP_CONFIG.WORKOUT_TYPES.EASY;
  const trimmed = name.trim();

  // 1. R: 速度重複跑 / 衝刺 (例如 200m R x 8，優先於括號內提到的 5K 測驗)
  if (/^R\s|200m\s*R|\bR\s*[×x]|\bRepetition\b|衝刺/i.test(trimmed)) {
    return APP_CONFIG.WORKOUT_TYPES.REPETITION;
  }

  // 2. 測驗跑 (5K-Test, 跑力測驗)
  if (/5K\s*-?\s*Test|跑力測驗|5K\s*測驗|5K-Test|\bTest\b/i.test(trimmed)) {
    return APP_CONFIG.WORKOUT_TYPES.TEST;
  }

  // 3. 比賽賽事 (台北馬、萬金石、東京馬、自主馬、半馬)
  if (/馬|Marathon|半馬|Half|萬金石|台北馬|自主馬|東京馬/i.test(trimmed)) {
    return APP_CONFIG.WORKOUT_TYPES.RACE;
  }

  // 4. T: 乳酸門檻跑 / 節奏跑 (3min T x 6, 1km T x 4)
  if (/^T\s|1km\s*T|3min\s*T|5min\s*T|\bT\s*[×x]|\bT\s*-|\bThreshold\b|門檻|Tempo/i.test(trimmed)) {
    return APP_CONFIG.WORKOUT_TYPES.THRESHOLD;
  }

  // 5. I: 最大攝氧量間歇
  if (/^I\s|\bInterval\b|最大攝氧|\bI\s*[×x]/i.test(trimmed)) {
    return APP_CONFIG.WORKOUT_TYPES.INTERVAL;
  }

  // 6. M: 馬拉松配速跑
  if (/^M\s|\bM配速\b|\bMP\b|\bMarathon\s*Pace\b/i.test(trimmed)) {
    return APP_CONFIG.WORKOUT_TYPES.MARATHON;
  }

  // 7. E: 輕鬆跑 (E-50min, E-90min, 輕鬆跑, Garmin 慢跑名稱)
  return APP_CONFIG.WORKOUT_TYPES.EASY;
}

/**
 * 將單一原始 CSV 資料列轉換為結構化 Activity 物件
 * @param {string[]} cols 
 * @param {number} rowIndex 原始列索引
 * @returns {object|null}
 */
export function mapRowToActivity(cols, rowIndex = 0) {
  if (!cols || !Array.isArray(cols) || cols.length < 3) return null;

  const activityId = cols[0] ? cols[0].trim() : '';
  const activityDateRaw = cols[1] ? cols[1].trim() : '';
  const activityName = cols[2] ? cols[2].trim() : '';

  if (!activityId || /test01/i.test(activityId) || /test01/i.test(activityName)) {
    return null;
  }

  let activityDate = activityDateRaw;
  let timestamp = 0;
  let activityYear = null;
  if (activityDateRaw) {
    const d = new Date(activityDateRaw);
    if (!isNaN(d.getTime())) {
      timestamp = d.getTime();
      activityYear = d.getFullYear();
    }
  }

  const durationTotalStr = cols[3] ? cols[3].trim() : '0:00:00';
  const durationMovingStr = cols[4] ? cols[4].trim() : durationTotalStr;
  const durationTotalSec = parseDuration(durationTotalStr);
  const durationMovingSec = parseDuration(durationMovingStr);

  const rpe = cols[5] && !isNaN(parseInt(cols[5], 10)) ? parseInt(cols[5], 10) : null;
  const trainingLoad = cols[6] && !isNaN(parseFloat(cols[6])) ? parseFloat(cols[6]) : 0;
  const distanceKm = cols[7] && !isNaN(parseFloat(cols[7])) ? parseFloat(cols[7]) : 0;

  const paceAvgStr = cols[8] ? cols[8].trim() : '-:--';
  const paceAvgSec = parsePace(paceAvgStr);

  const hrAvg = cols[9] && !isNaN(parseFloat(cols[9])) ? parseFloat(cols[9]) : null;
  const hrMax = cols[10] && !isNaN(parseFloat(cols[10])) ? parseFloat(cols[10]) : null;
  const cadenceAvg = cols[11] && !isNaN(parseFloat(cols[11])) ? parseFloat(cols[11]) : null;
  const strideLengthM = cols[12] && !isNaN(parseFloat(cols[12])) ? parseFloat(cols[12]) : null;
  const elevationGain = cols[13] && !isNaN(parseFloat(cols[13])) ? Math.round(parseFloat(cols[13])) : 0;

  const lapSplitsRaw = cols[14] ? cols[14].trim() : '';
  const lapSplits = parseLapSplits(lapSplitsRaw);

  const notes = cols[15] ? cols[15].trim() : '';
  const workoutType = classifyWorkoutType(activityName);

  if (distanceKm <= 0 && !activityName) return null;

  return {
    activityId,
    activityDate,
    activityDateRaw,
    activityYear,
    timestamp,
    rowIndex,
    activityName,
    workoutType,
    durationTotal: durationTotalStr,
    durationTotalSec,
    durationMoving: durationMovingStr,
    durationMovingSec,
    rpe,
    trainingLoad,
    distanceKm,
    paceAvg: paceAvgStr,
    paceAvgSec,
    hrAvg,
    hrMax,
    cadenceAvg,
    strideLengthM,
    elevationGain,
    lapSplitsRaw,
    lapSplits,
    notes
  };
}

/**
 * 批次解析 CSV 二維陣列並強制「由新到舊 (最後一筆往前)」排序
 * @param {string[][]} rawRows 
 * @returns {Array<object>}
 */
export function parseActivities(rawRows) {
  if (!rawRows || !Array.isArray(rawRows) || rawRows.length < 2) return [];

  const dataRows = rawRows.slice(1);
  const activities = [];

  for (let i = 0; i < dataRows.length; i++) {
    const act = mapRowToActivity(dataRows[i], i + 1);
    if (act) {
      activities.push(act);
    }
  }

  // 強制嚴格由新到舊倒序排列 (最新 2026-10-12 排第 1 筆)
  return activities.sort((a, b) => {
    const tA = getActivityTimestamp(a);
    const tB = getActivityTimestamp(b);
    if (tB !== tA) {
      return tB - tA;
    }
    return (b.rowIndex || 0) - (a.rowIndex || 0);
  });
}
