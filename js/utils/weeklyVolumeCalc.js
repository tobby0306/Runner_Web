/**
 * Runner Pulse Analytics - Weekly Volume & Workout Types Calculator (Task T-10)
 * 負責週跑量推移聚合 (Weekly Mileage Aggregation) 與 7 大訓練強度分類統計 (Workout Type Breakdown)
 * 遵循 Jack Daniels 80/20 訓練法則 (80% 有氧基底 + 20% 質量課)
 */

import { APP_CONFIG } from '../config.js';
import { parseDuration, formatDuration, formatPace } from './formatters.js';

/**
 * 7 大訓練強度視覺化與屬性設定表
 */
export const WORKOUT_TYPE_CONFIG = {
  EASY: {
    key: 'EASY',
    code: 'E',
    label: 'E 輕鬆跑',
    shortLabel: 'EASY',
    color: '#10B981', // 翡翠綠 (Zone 2)
    badgeClass: 'badge-easy',
    isQuality: false,
    desc: '累積有氧底子、活化微血管、消除疲勞'
  },
  MARATHON: {
    key: 'MARATHON',
    code: 'M',
    label: 'M 馬拉松速',
    shortLabel: 'MP',
    color: '#00F2FE', // 電競青 (Zone 3)
    badgeClass: 'badge-marathon',
    isQuality: false,
    desc: '馬拉松目標賽速適應、脂肪供能效率'
  },
  THRESHOLD: {
    key: 'THRESHOLD',
    code: 'T',
    label: 'T 乳酸門檻',
    shortLabel: 'T 跑',
    color: '#FF6B4A', // 衝擊橘 (Zone 4)
    badgeClass: 'badge-threshold',
    isQuality: true,
    desc: '延緩乳酸堆積、提高乳酸清除效率'
  },
  INTERVAL: {
    key: 'INTERVAL',
    code: 'I',
    label: 'I 最大攝氧',
    shortLabel: 'VO2Max',
    color: '#A855F7', // 炫光紫 (Zone 5a)
    badgeClass: 'badge-interval',
    isQuality: true,
    desc: '刺激心肺極限、拉高最大攝氧量'
  },
  REPETITION: {
    key: 'REPETITION',
    code: 'R',
    label: 'R 速度重複',
    shortLabel: 'Rep',
    color: '#EC4899', // 霓虹粉 (Zone 5b)
    badgeClass: 'badge-repetition',
    isQuality: true,
    desc: '神經肌肉傳導、提升跑步經濟性'
  },
  RACE: {
    key: 'RACE',
    code: 'RACE',
    label: 'Race 競賽',
    shortLabel: 'RACE',
    color: '#EAB308', // 榮耀金
    badgeClass: 'badge-race',
    isQuality: true,
    desc: '全馬/半馬正式賽事全力發揮'
  },
  TEST: {
    key: 'TEST',
    code: 'TEST',
    label: 'Test 測驗',
    shortLabel: 'TEST',
    color: '#F59E0B', // 琥珀橘
    badgeClass: 'badge-test',
    isQuality: true,
    desc: '5K 測驗判定最新 VDOT 跑力'
  },
  GENERAL: {
    key: 'GENERAL',
    code: 'GEN',
    label: '一般訓練',
    shortLabel: 'GEN',
    color: '#64748B', // 岩石灰
    badgeClass: 'badge-general',
    isQuality: false,
    desc: '休閒或一般未歸類活動'
  }
};

/**
 * 取得給定日期所在週的星期一 00:00:00 (ISO-8601 週起始日)
 * @param {Date|string|number} d 
 * @returns {Date}
 */
export function getMondayOfWeek(d) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return new Date();
  const day = date.getDay();
  // 週日為 0，轉成 -6 天；週一為 1，轉成 0 天
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(date);
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * 將日期物件格式化為 MM/DD 簡短字串
 * @param {Date} date 
 * @returns {string}
 */
function formatShortDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}

/**
 * 依照週次聚合訓練量與強度分佈 (Weekly Mileage & Workout Types)
 * 支援補齊跨週 0 km 週期，還原完整訓練與減量週期
 * 
 * @param {Array<object>} activities 
 * @param {string} range '8weeks' | '12weeks' | '2026' | 'all'
 * @returns {object} { weeks: Array, summary: object }
 */
export function aggregateWeeklyVolume(activities = [], range = '12weeks') {
  if (!activities || activities.length === 0) {
    return {
      weeks: [],
      summary: {
        totalDistance: 0,
        totalHours: 0,
        avgWeeklyDistance: 0,
        maxWeeklyDistance: 0,
        aerobicKm: 0,
        qualityKm: 0,
        aerobicPercent: 0,
        qualityPercent: 0,
        weeksCount: 0
      }
    };
  }

  // 1. 篩選與過濾活動
  const validActs = activities.filter(a => {
    const rawDate = a.activityDate || a.activityDateRaw;
    if (!rawDate) return false;
    const t = new Date(rawDate).getTime();
    return !isNaN(t) && (a.distanceKm || 0) > 0;
  });

  if (validActs.length === 0) {
    return { weeks: [], summary: { totalDistance: 0, weeksCount: 0 } };
  }

  // 排序：從最舊到最新，方便時間軸計算
  const sortedActs = [...validActs].sort((a, b) => {
    return new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime();
  });

  // 2. 確定時間邊界
  const latestDate = new Date(sortedActs[sortedActs.length - 1].activityDate);
  const endMonday = getMondayOfWeek(latestDate);

  let startMonday;
  if (range === '8weeks') {
    startMonday = new Date(endMonday);
    startMonday.setDate(startMonday.getDate() - (7 * 7)); // 往前 7 週 = 共 8 週
  } else if (range === '12weeks') {
    startMonday = new Date(endMonday);
    startMonday.setDate(startMonday.getDate() - (11 * 7)); // 往前 11 週 = 共 12 週
  } else if (range === '2026') {
    startMonday = getMondayOfWeek(new Date('2026-01-01T00:00:00'));
  } else {
    // all: 以第一筆紀錄所在週開始
    startMonday = getMondayOfWeek(sortedActs[0].activityDate);
  }

  // 3. 生成所有自然週 (連續時間軸，避免漏週)
  const weekMap = new Map();
  const currentCursor = new Date(startMonday);

  while (currentCursor <= endMonday) {
    const mondayTime = currentCursor.getTime();
    const sunday = new Date(currentCursor);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const label = `${formatShortDate(currentCursor)}~${formatShortDate(sunday)}`;
    const weekYear = currentCursor.getFullYear();

    weekMap.set(mondayTime, {
      mondayDate: new Date(currentCursor),
      sundayDate: sunday,
      mondayTime,
      label,
      weekYear,
      totalDistance: 0,
      totalDurationSec: 0,
      totalLoad: 0,
      activityCount: 0,
      qualityDistance: 0,
      aerobicDistance: 0,
      byType: {
        EASY: 0,
        MARATHON: 0,
        THRESHOLD: 0,
        INTERVAL: 0,
        REPETITION: 0,
        RACE: 0,
        TEST: 0,
        GENERAL: 0
      }
    });

    currentCursor.setDate(currentCursor.getDate() + 7);
  }

  // 4. 將每筆活動聚合進對應的週次
  sortedActs.forEach(act => {
    const actDate = new Date(act.activityDate);
    if (actDate < startMonday || actDate > new Date(endMonday.getTime() + 7 * 86400000)) return;

    const actMonday = getMondayOfWeek(actDate).getTime();
    const weekEntry = weekMap.get(actMonday);
    if (!weekEntry) return;

    const dist = parseFloat(act.distanceKm) || 0;
    const durSec = typeof act.durationTotalSec === 'number' && act.durationTotalSec > 0
      ? act.durationTotalSec
      : parseDuration(act.durationTotal || act.durationMoving || '0:00');
    const load = parseFloat(act.trainingLoad) || 0;
    const type = act.workoutType || 'EASY';

    weekEntry.totalDistance += dist;
    weekEntry.totalDurationSec += durSec;
    weekEntry.totalLoad += load;
    weekEntry.activityCount += 1;

    if (weekEntry.byType[type] !== undefined) {
      weekEntry.byType[type] += dist;
    } else {
      weekEntry.byType.GENERAL += dist;
    }

    const typeConfig = WORKOUT_TYPE_CONFIG[type] || WORKOUT_TYPE_CONFIG.GENERAL;
    if (typeConfig.isQuality) {
      weekEntry.qualityDistance += dist;
    } else {
      weekEntry.aerobicDistance += dist;
    }
  });

  // 5. 轉換為陣列並計算各項均值
  const weeks = Array.from(weekMap.values()).map(w => {
    // 數值修約為小數點後 2 位
    w.totalDistance = Math.round(w.totalDistance * 100) / 100;
    w.totalDurationHours = Math.round((w.totalDurationSec / 3600) * 10) / 10;
    w.qualityDistance = Math.round(w.qualityDistance * 100) / 100;
    w.aerobicDistance = Math.round(w.aerobicDistance * 100) / 100;
    for (const key of Object.keys(w.byType)) {
      w.byType[key] = Math.round(w.byType[key] * 100) / 100;
    }
    return w;
  });

  // 6. 計算選定期間之整體統計數據
  const totalDistance = Math.round(weeks.reduce((acc, cur) => acc + cur.totalDistance, 0) * 10) / 10;
  const totalDurationSec = weeks.reduce((acc, cur) => acc + cur.totalDurationSec, 0);
  const totalHours = Math.round((totalDurationSec / 3600) * 10) / 10;
  const weeksCount = weeks.length || 1;
  const avgWeeklyDistance = Math.round((totalDistance / weeksCount) * 10) / 10;
  const maxWeeklyDistance = Math.max(...weeks.map(w => w.totalDistance), 0);
  
  const totalAerobicKm = Math.round(weeks.reduce((acc, cur) => acc + cur.aerobicDistance, 0) * 10) / 10;
  const totalQualityKm = Math.round(weeks.reduce((acc, cur) => acc + cur.qualityDistance, 0) * 10) / 10;
  const aerobicPercent = totalDistance > 0 ? Math.round((totalAerobicKm / totalDistance) * 100) : 100;
  const qualityPercent = totalDistance > 0 ? (100 - aerobicPercent) : 0;

  return {
    weeks,
    summary: {
      totalDistance,
      totalHours,
      weeksCount,
      avgWeeklyDistance,
      maxWeeklyDistance,
      aerobicKm: totalAerobicKm,
      qualityKm: totalQualityKm,
      aerobicPercent,
      qualityPercent
    }
  };
}

/**
 * 計算特定範圍內的 7 大訓練強度全局分佈 (Workout Types Breakdown)
 * @param {Array<object>} activities 
 * @param {number|null} year 篩選年度 (如 2026)，null 表示全部
 * @returns {object} { breakdown: Array, totalDistance: number, qualitySummary: object }
 */
export function calculateWorkoutTypeBreakdown(activities = [], year = null) {
  let filtered = activities || [];
  if (year) {
    filtered = filtered.filter(a => {
      const raw = a.activityDate || a.activityDateRaw;
      if (!raw) return false;
      const d = new Date(raw);
      return !isNaN(d.getTime()) && d.getFullYear() === year;
    });
  }

  const typeMap = {};
  for (const key of Object.keys(WORKOUT_TYPE_CONFIG)) {
    typeMap[key] = {
      ...WORKOUT_TYPE_CONFIG[key],
      km: 0,
      count: 0,
      durationSec: 0,
      paceSecondsSum: 0
    };
  }

  let totalDistance = 0;
  let totalDurationSec = 0;

  filtered.forEach(act => {
    const dist = parseFloat(act.distanceKm) || 0;
    if (dist <= 0) return;

    const durSec = typeof act.durationTotalSec === 'number' && act.durationTotalSec > 0
      ? act.durationTotalSec
      : parseDuration(act.durationTotal || act.durationMoving || '0:00');

    const type = act.workoutType || 'EASY';
    const entry = typeMap[type] || typeMap.GENERAL;

    entry.km += dist;
    entry.count += 1;
    entry.durationSec += durSec;

    totalDistance += dist;
    totalDurationSec += durSec;
  });

  totalDistance = Math.round(totalDistance * 10) / 10;

  // 轉換為排序陣列 (依跑量由大到小)
  const breakdown = Object.values(typeMap)
    .filter(item => item.count > 0 || item.km > 0)
    .map(item => {
      const km = Math.round(item.km * 10) / 10;
      const percent = totalDistance > 0 ? Math.round((km / totalDistance) * 100) : 0;
      const hours = Math.round((item.durationSec / 3600) * 10) / 10;
      
      // 平均配速 (秒/km)
      const avgPaceSec = item.km > 0 ? Math.round(item.durationSec / item.km) : 0;
      const avgPaceStr = avgPaceSec > 0 ? formatPace(avgPaceSec) : '-';

      return {
        ...item,
        km,
        percent,
        hours,
        avgPaceStr
      };
    })
    .sort((a, b) => b.km - a.km);

  // 計算 80/20 訓練分佈比
  const qualityKm = breakdown
    .filter(b => b.isQuality)
    .reduce((sum, b) => sum + b.km, 0);
  const qualityKmRounded = Math.round(qualityKm * 10) / 10;
  const aerobicKmRounded = Math.round((totalDistance - qualityKmRounded) * 10) / 10;
  const aerobicPercent = totalDistance > 0 ? Math.round((aerobicKmRounded / totalDistance) * 100) : 100;
  const qualityPercent = totalDistance > 0 ? 100 - aerobicPercent : 0;

  return {
    breakdown,
    totalDistance,
    totalHours: Math.round((totalDurationSec / 3600) * 10) / 10,
    qualitySummary: {
      aerobicKm: aerobicKmRounded,
      qualityKm: qualityKmRounded,
      aerobicPercent,
      qualityPercent
    }
  };
}
