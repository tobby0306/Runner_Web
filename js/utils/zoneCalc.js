/**
 * Runner Pulse Analytics - Heart Rate Zone Analytics Engine (Task T-09)
 * 統計與分析跑者各心率區間 (Zone 1 ~ Zone 5) 之訓練里程與時間分佈
 * 依據 running_analyzer_spec.md 與訓練區間頁籤動態生理準則
 */

import { APP_CONFIG } from '../config.js';

/**
 * 依跑者乳酸門檻心率 (LTHR) 與最大心率 (MaxHR) 動態計算五大心率區間之閥值 (bpm)
 * 演算法基準：
 * - Zone 1: < round(LTHR * 0.80)
 * - Zone 2: round(LTHR * 0.80) ~ round(LTHR * 0.89)
 * - Zone 3: round(LTHR * 0.89) + 1 ~ round(LTHR * 0.95) - 1
 * - Zone 4: round(LTHR * 0.95) ~ LTHR
 * - Zone 5: (LTHR + 1) ~ MaxHR
 * @param {number} lthr 
 * @param {number} maxHr 
 * @returns {object}
 */
export function computeZoneThresholds(lthr = 170, maxHr = 192) {
  const safeLthr = Number(lthr) && lthr > 0 ? Number(lthr) : (APP_CONFIG.ATHLETE.lthr || 170);
  const safeMaxHr = Number(maxHr) && maxHr > safeLthr ? Number(maxHr) : (APP_CONFIG.ATHLETE.maxHR || 192);

  const z1Min = Math.round(safeLthr * 0.65);
  const z1Max = Math.round(safeLthr * 0.80) - 1;
  const z2Min = Math.round(safeLthr * 0.80);
  const z2Max = Math.round(safeLthr * 0.89);
  const z3Min = Math.round(safeLthr * 0.89) + 1;
  const z3Max = Math.round(safeLthr * 0.95) - 1;
  const z4Min = Math.round(safeLthr * 0.95);
  const z4Max = safeLthr;
  const z5Min = safeLthr + 1;
  const z5Max = safeMaxHr;

  return {
    lthr: safeLthr,
    maxHr: safeMaxHr,
    z1Min, z1Max,
    z2Min, z2Max,
    z3Min, z3Max,
    z4Min, z4Max,
    z5Min, z5Max
  };
}

/**
 * 依跑者生理設定動態產出五大區間規格清單 (ZONE_DEFINITIONS)
 * @param {{ lthr?: number, maxHr?: number, maxHR?: number }} [profile]
 * @returns {Array<object>}
 */
export function getDynamicZoneDefinitions(profile = null) {
  const lthr = profile?.lthr || APP_CONFIG.ATHLETE.lthr || 170;
  const maxHr = profile?.maxHr || profile?.maxHR || APP_CONFIG.ATHLETE.maxHR || 192;
  const t = computeZoneThresholds(lthr, maxHr);

  return [
    {
      key: 'zone1',
      label: 'Zone 1 恢復跑',
      shortName: 'Z1 恢復',
      color: '#38BDF8',
      bgColor: 'rgba(56, 189, 248, 0.2)',
      hrMin: t.z1Min,
      hrMax: t.z1Max,
      hrRange: `${t.z1Min}–${t.z1Max} bpm`,
      pctLTHR: '65%–80%',
      purpose: '主動修復、乳酸清除、微血管增生'
    },
    {
      key: 'zone2',
      label: 'Zone 2 輕鬆跑 (E)',
      shortName: 'Z2 輕鬆',
      color: '#10B981',
      bgColor: 'rgba(16, 185, 129, 0.2)',
      hrMin: t.z2Min,
      hrMax: t.z2Max,
      hrRange: `${t.z2Min}–${t.z2Max} bpm`,
      pctLTHR: '80%–89%',
      purpose: '有氧基底、粒線體生長、累積週里程'
    },
    {
      key: 'zone3',
      label: 'Zone 3 馬拉松 (M)',
      shortName: 'Z3 馬拉松',
      color: '#F59E0B',
      bgColor: 'rgba(245, 158, 11, 0.2)',
      hrMin: t.z3Min,
      hrMax: t.z3Max,
      hrRange: `${t.z3Min}–${t.z3Max} bpm`,
      pctLTHR: '89%–95%',
      purpose: '模擬馬拉松巡航賽速、提升脂肪利用率'
    },
    {
      key: 'zone4',
      label: 'Zone 4 門檻跑 (T)',
      shortName: 'Z4 門檻',
      color: '#FF6B4A',
      bgColor: 'rgba(255, 107, 74, 0.2)',
      hrMin: t.z4Min,
      hrMax: t.z4Max,
      hrRange: `${t.z4Min}–${t.z4Max} bpm`,
      pctLTHR: '95%–100%',
      purpose: '提升乳酸代謝與排除效率 (乳酸門檻)'
    },
    {
      key: 'zone5',
      label: 'Zone 5 最大攝氧 (I/R)',
      shortName: 'Z5 攝氧/無氧',
      color: '#EF4444',
      bgColor: 'rgba(239, 68, 68, 0.2)',
      hrMin: t.z5Min,
      hrMax: t.z5Max,
      hrRange: `≥ ${t.z5Min} bpm`,
      pctLTHR: '> 100%',
      purpose: '刺激最大攝氧量 (VO2max) 與心臟搏出量'
    }
  ];
}

// 預設向後相容導出常數 (以預設基準計算)
export const ZONE_DEFINITIONS = getDynamicZoneDefinitions();

/**
 * 依心率值判定所屬 Zone 區間 (支援動態 profile 傳入)
 * @param {number} hr 
 * @param {{ lthr?: number, maxHr?: number, maxHR?: number }} [profile]
 * @returns {string} 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5'
 */
export function classifyHeartRateZone(hr, profile = null) {
  if (!hr || hr <= 0) return 'zone1';
  const lthr = profile?.lthr || APP_CONFIG.ATHLETE.lthr || 170;
  const maxHr = profile?.maxHr || profile?.maxHR || APP_CONFIG.ATHLETE.maxHR || 192;
  const t = computeZoneThresholds(lthr, maxHr);

  if (hr <= t.z1Max) return 'zone1';
  if (hr <= t.z2Max) return 'zone2';
  if (hr <= t.z3Max) return 'zone3';
  if (hr <= t.z4Max) return 'zone4';
  return 'zone5';
}

/**
 * 統計活動集合的心率區間分佈 (支援 Lap Splits 細分或活動均心率，並套用動態 profile)
 * @param {Array<object>} activities 
 * @param {{ lthr?: number, maxHr?: number, maxHR?: number }} [profile]
 * @returns {object}
 */
export function calculateHeartRateDistribution(activities = [], profile = null) {
  const dynamicDefinitions = getDynamicZoneDefinitions(profile);
  const zoneStats = {
    zone1: { km: 0, seconds: 0, count: 0 },
    zone2: { km: 0, seconds: 0, count: 0 },
    zone3: { km: 0, seconds: 0, count: 0 },
    zone4: { km: 0, seconds: 0, count: 0 },
    zone5: { km: 0, seconds: 0, count: 0 }
  };

  let totalAnalyzedKm = 0;
  let totalAnalyzedSec = 0;

  for (const act of activities) {
    const splits = act.lapSplits || [];
    const dist = act.distanceKm || 0;
    const sec = act.durationTotalSec || 0;

    // 若有每公里分段心率資料，精準按公里加權
    if (splits.length > 0) {
      for (const s of splits) {
        if (s.hr > 0) {
          const zKey = classifyHeartRateZone(s.hr, profile);
          zoneStats[zKey].km += 1.0;
          zoneStats[zKey].seconds += (s.paceSec || (sec / Math.max(1, dist)));
          zoneStats[zKey].count += 1;
          totalAnalyzedKm += 1.0;
          totalAnalyzedSec += (s.paceSec || (sec / Math.max(1, dist)));
        }
      }
    } else if (act.hrAvg > 0 && dist > 0) {
      // 無分段時以全程平均心率分配該活動全部里程與時間
      const zKey = classifyHeartRateZone(act.hrAvg, profile);
      zoneStats[zKey].km += dist;
      zoneStats[zKey].seconds += sec;
      zoneStats[zKey].count += 1;
      totalAnalyzedKm += dist;
      totalAnalyzedSec += sec;
    }
  }

  // 若完全無有效心率，提供基準備用分佈
  if (totalAnalyzedKm === 0) {
    totalAnalyzedKm = 100;
    zoneStats.zone1.km = 12;
    zoneStats.zone2.km = 68;
    zoneStats.zone3.km = 10;
    zoneStats.zone4.km = 7;
    zoneStats.zone5.km = 3;
  }

  const breakdown = dynamicDefinitions.map(def => {
    const stat = zoneStats[def.key] || { km: 0, seconds: 0, count: 0 };
    const pct = totalAnalyzedKm > 0 ? (stat.km / totalAnalyzedKm) * 100 : 0;
    return {
      ...def,
      km: Math.round(stat.km * 10) / 10,
      hours: Math.round((stat.seconds / 3600) * 10) / 10,
      percent: Math.round(pct * 10) / 10,
      count: stat.count
    };
  });

  const z1Pct = breakdown.find(b => b.key === 'zone1')?.percent || 0;
  const z2Pct = breakdown.find(b => b.key === 'zone2')?.percent || 0;
  const z4Pct = breakdown.find(b => b.key === 'zone4')?.percent || 0;
  const z5Pct = breakdown.find(b => b.key === 'zone5')?.percent || 0;

  const aerobicBasePercent = Math.round((z1Pct + z2Pct) * 10) / 10;
  const highIntensityPercent = Math.round((z4Pct + z5Pct) * 10) / 10;
  const isPolarized = aerobicBasePercent >= 75; // 符合 80/20 金字塔基底原則

  return {
    breakdown,
    totalAnalyzedKm: Math.round(totalAnalyzedKm * 10) / 10,
    aerobicBasePercent,
    highIntensityPercent,
    isPolarized,
    dominantZone: breakdown.reduce((prev, cur) => cur.km > prev.km ? cur : prev, breakdown[0]),
    activityCount: activities.length
  };
}

/**
 * 依年份或年月過濾活動 (例如 '2026' 或 '2026-10')
 * @param {Array<object>} activities 
 * @param {string} period 
 * @returns {Array<object>}
 */
export function filterActivitiesByPeriod(activities = [], period = '2026') {
  if (!period || period === 'ALL') return activities;
  return activities.filter(act => {
    const dStr = act.activityDate ? String(act.activityDate) : (act.activityDateRaw || '');
    return dStr.startsWith(period);
  });
}

/**
 * 自動萃取資料中最近兩筆有記錄之月份 (供月度對比)
 * @param {Array<object>} activities 
 * @returns {{ currentMonth: string, previousMonth: string, allMonths: string[] }}
 */
export function getLatestTwoMonths(activities = []) {
  const monthMap = new Map();
  activities.forEach(act => {
    const dStr = act.activityDate ? String(act.activityDate) : (act.activityDateRaw || '');
    if (dStr.length >= 7) {
      const ym = dStr.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) {
        monthMap.set(ym, (monthMap.get(ym) || 0) + 1);
      }
    }
  });

  const sortedMonths = Array.from(monthMap.keys()).sort().reverse();
  const currentMonth = sortedMonths[0] || '2026-10';
  const previousMonth = sortedMonths[1] || '2026-09';

  return {
    currentMonth,
    previousMonth,
    allMonths: sortedMonths
  };
}

/**
 * 依跑者生理設定動態產出首頁五大心率/配速區間基準卡數據 (Task T-EXT-03)
 * 若傳入 Google Sheets「訓練區間」實際解析之 sheetZones 且跑者 VDOT 與訓練區間 A1 相同，優先直接呈現試算表配速與心率目標
 * @param {{ lthr?: number, maxHr?: number, maxHR?: number, vdot?: number }} [profile]
 * @param {Array<object>} [sheetZones]
 * @param {object} [zonesMeta]
 * @returns {Array<object>}
 */
export function computeZoneBenchmarkCards(profile = null, sheetZones = [], zonesMeta = null) {
  const lthr = profile?.lthr || APP_CONFIG.ATHLETE.lthr || 170;
  const maxHr = profile?.maxHr || profile?.maxHR || APP_CONFIG.ATHLETE.maxHR || 192;
  const vdot = Number(profile?.vdot) || APP_CONFIG.ATHLETE.baselineVDOT || 39.0;

  const t = computeZoneThresholds(lthr, maxHr);

  // Jack Daniels VDOT 5K & 全馬配速回歸模型
  const safeVdot = Math.max(20, Math.min(85, vdot));
  const time5kSec = 1575.0 * Math.pow(36.0 / safeVdot, 1.06);
  const p5 = time5kSec / 5.0; // 5K 配速 (秒/km)
  const timeFullSec = time5kSec * 2.085 * 2.22 * 2.14;
  const pM = timeFullSec / 42.195; // 馬拉松配速 (秒/km)

  const z1PaceSec = Math.round(p5 * 1.365);
  const z2PaceFastSec = Math.round(p5 * 1.222);
  const z2PaceSlowSec = Math.round(p5 * 1.362);
  const z3PaceSec = Math.round(pM);
  const z4PaceSec = Math.round(p5 * 1.045);
  const z5PaceSec = Math.round(p5 * 0.965);

  const fmtPaceOnly = (sec) => {
    const min = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${min}:${String(s).padStart(2, '0')}`;
  };

  // 若 VDOT 與訓練區間 A1 一致，優先使用試算表上的配速與心率字串
  const useSheetExact = Array.isArray(sheetZones) && sheetZones.length >= 5 &&
    (!zonesMeta || Math.abs(vdot - Number(zonesMeta.vdot)) < 0.05);

  const findSheetZone = (tag) => {
    if (!useSheetExact) return null;
    return sheetZones.find(z => z.zone && z.zone.toLowerCase() === tag.toLowerCase()) || null;
  };

  const formatSheetPace = (sz, fallbackStr) => {
    if (!sz || !sz.paceGuide) return fallbackStr;
    const raw = String(sz.paceGuide).trim();
    return raw.includes('/km') ? raw : `${raw} /km`;
  };

  const formatSheetHr = (sz, fallbackStr) => {
    if (!sz || !sz.hrTarget || sz.hrTarget.includes('不看')) return fallbackStr;
    return String(sz.hrTarget).replace(/\s*bpm/gi, '').trim();
  };

  const sz1 = findSheetZone('Zone 1');
  const sz2 = findSheetZone('Zone 2');
  const sz3 = findSheetZone('Zone 3');
  const sz4 = findSheetZone('Zone 4');
  const sz5 = findSheetZone('Zone 5a') || findSheetZone('Zone 5');

  return [
    {
      zone: 'Zone 1',
      key: 'zone1',
      title: 'Zone 1 恢復跑',
      shortName: 'Z1 恢復跑',
      isFeatured: false,
      pctLTHR: sz1?.pctLTHR || '65%–80%',
      hrMin: t.z1Min,
      hrMax: t.z1Max,
      hrDisplay: formatSheetHr(sz1, `${t.z1Min} – ${t.z1Max}`),
      paceDisplay: formatSheetPace(sz1, `> ${fmtPaceOnly(z1PaceSec)} /km`),
      purpose: '主動修復・乳酸排除',
      color: '#38BDF8',
      filterType: 'EASY'
    },
    {
      zone: 'Zone 2',
      key: 'zone2',
      title: 'Zone 2 輕鬆跑 (E) ★',
      shortName: 'Zone 2 輕鬆跑 (E)',
      isFeatured: true,
      pctLTHR: sz2?.pctLTHR || '80%–89%',
      hrMin: t.z2Min,
      hrMax: t.z2Max,
      hrDisplay: formatSheetHr(sz2, `${t.z2Min} – ${t.z2Max}`),
      paceDisplay: formatSheetPace(sz2, `${fmtPaceOnly(z2PaceFastSec)} – ${fmtPaceOnly(z2PaceSlowSec)} /km`),
      purpose: '核心有氧・微血管增生',
      color: '#10B981',
      filterType: 'EASY'
    },
    {
      zone: 'Zone 3',
      key: 'zone3',
      title: 'Zone 3 馬拉松 (M)',
      shortName: 'Zone 3 馬拉松 (M)',
      isFeatured: false,
      pctLTHR: sz3?.pctLTHR || '89%–95%',
      hrMin: t.z3Min,
      hrMax: t.z3Max,
      hrDisplay: formatSheetHr(sz3, `${t.z3Min} – ${t.z3Max}`),
      paceDisplay: formatSheetPace(sz3, `${fmtPaceOnly(z3PaceSec)} /km`),
      purpose: '馬拉松巡航・脂肪利用',
      color: '#F59E0B',
      filterType: 'MARATHON'
    },
    {
      zone: 'Zone 4',
      key: 'zone4',
      title: 'Zone 4 門檻跑 (T)',
      shortName: 'Zone 4 門檻跑 (T)',
      isFeatured: false,
      pctLTHR: sz4?.pctLTHR || '95%–100%',
      hrMin: t.z4Min,
      hrMax: t.z4Max,
      hrDisplay: formatSheetHr(sz4, `${t.z4Min} – ${t.z4Max}`),
      paceDisplay: formatSheetPace(sz4, `${fmtPaceOnly(z4PaceSec)} /km`),
      purpose: '乳酸門檻・提升耐乳酸',
      color: '#FF6B4A',
      filterType: 'THRESHOLD'
    },
    {
      zone: 'Zone 5',
      key: 'zone5',
      title: 'Zone 5 最大攝氧 (I)',
      shortName: 'Zone 5 最大攝氧 (I)',
      isFeatured: false,
      pctLTHR: sz5?.pctLTHR || '> 100%',
      hrMin: t.z5Min,
      hrMax: t.z5Max,
      hrDisplay: formatSheetHr(sz5, `≥ ${t.z5Min}`),
      paceDisplay: formatSheetPace(sz5, `< ${fmtPaceOnly(z5PaceSec)} /km`),
      purpose: '心肺極限・刺激 VO2Max',
      color: '#EF4444',
      filterType: 'INTERVAL'
    }
  ];
}
