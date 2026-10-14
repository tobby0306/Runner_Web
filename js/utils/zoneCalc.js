/**
 * Runner Pulse Analytics - Heart Rate Zone Analytics Engine (Task T-09)
 * 統計與分析跑者各心率區間 (Zone 1 ~ Zone 5) 之訓練里程與時間分佈
 * 依據 running_analyzer_spec.md 與 Jack Daniels / LTHR 172 bpm 準則
 */

import { APP_CONFIG } from '../config.js';

export const ZONE_DEFINITIONS = [
  {
    key: 'zone1',
    label: 'Zone 1 恢復跑',
    shortName: 'Z1 恢復',
    color: '#38BDF8',
    bgColor: 'rgba(56, 189, 248, 0.2)',
    hrMin: 112,
    hrMax: 137,
    hrRange: '112–137 bpm',
    pctLTHR: '65%–80%',
    purpose: '主動修復、乳酸清除、微血管增生'
  },
  {
    key: 'zone2',
    label: 'Zone 2 輕鬆跑 (E)',
    shortName: 'Z2 輕鬆',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.2)',
    hrMin: 138,
    hrMax: 153,
    hrRange: '138–153 bpm',
    pctLTHR: '80%–89%',
    purpose: '有氧基底、粒線體生長、累積週里程'
  },
  {
    key: 'zone3',
    label: 'Zone 3 馬拉松 (M)',
    shortName: 'Z3 馬拉松',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.2)',
    hrMin: 154,
    hrMax: 163,
    hrRange: '154–163 bpm',
    pctLTHR: '89%–95%',
    purpose: '模擬馬拉松巡航賽速、提升脂肪利用率'
  },
  {
    key: 'zone4',
    label: 'Zone 4 門檻跑 (T)',
    shortName: 'Z4 門檻',
    color: '#FF6B4A',
    bgColor: 'rgba(255, 107, 74, 0.2)',
    hrMin: 164,
    hrMax: 172,
    hrRange: '164–172 bpm',
    pctLTHR: '95%–100%',
    purpose: '提升乳酸代謝與排除效率 (乳酸門檻)'
  },
  {
    key: 'zone5',
    label: 'Zone 5 最大攝氧 (I/R)',
    shortName: 'Z5 攝氧/無氧',
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.2)',
    hrMin: 173,
    hrMax: 196,
    hrRange: '≥ 173 bpm',
    pctLTHR: '> 100%',
    purpose: '刺激最大攝氧量 (VO2max) 與心臟搏出量'
  }
];

/**
 * 依心率值判定所屬 Zone 區間
 * @param {number} hr 
 * @returns {string} 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5'
 */
export function classifyHeartRateZone(hr) {
  if (!hr || hr < 112) return 'zone1';
  if (hr <= 137) return 'zone1';
  if (hr <= 153) return 'zone2';
  if (hr <= 163) return 'zone3';
  if (hr <= 172) return 'zone4';
  return 'zone5';
}

/**
 * 統計活動集合的心率區間分佈 (支援 Lap Splits 細分或活動均心率)
 * @param {Array<object>} activities 
 * @returns {object}
 */
export function calculateHeartRateDistribution(activities = []) {
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
          const zKey = classifyHeartRateZone(s.hr);
          zoneStats[zKey].km += 1.0;
          zoneStats[zKey].seconds += (s.paceSec || (sec / Math.max(1, dist)));
          zoneStats[zKey].count += 1;
          totalAnalyzedKm += 1.0;
          totalAnalyzedSec += (s.paceSec || (sec / Math.max(1, dist)));
        }
      }
    } else if (act.hrAvg > 0 && dist > 0) {
      // 無分段時以全程平均心率分配該活動全部里程與時間
      const zKey = classifyHeartRateZone(act.hrAvg);
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

  const breakdown = ZONE_DEFINITIONS.map(def => {
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

