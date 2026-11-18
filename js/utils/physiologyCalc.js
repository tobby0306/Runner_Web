/**
 * Runner Pulse Analytics - Deep Physiology Insights Engine
 * 1. ACWR 急慢性訓練負荷比 (Acute:Chronic Workload Ratio) 疲勞紅綠燈
 * 2. 有氧解耦率 (Aerobic Decoupling / Pa:HR Drift) 心率漂移分析
 */

import { getActivityTimestamp } from './activityParser.js';
import { formatDate } from './formatters.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 取得單筆活動的訓練負荷分數 (優先使用 TRIMP/訓練點數，缺少時以 時間×RPE 推估)
 * @param {object} log
 * @returns {number}
 */
export function getActivityLoad(log) {
  if (!log) return 0;
  if (typeof log.trainingLoad === 'number' && log.trainingLoad > 0) {
    return log.trainingLoad;
  }
  const durMin = (log.durationTotalSec || 0) / 60;
  if (durMin > 0) {
    const rpe = (typeof log.rpe === 'number' && log.rpe > 0) ? log.rpe : 3;
    return Math.round(durMin * (rpe / 10) * 10) / 10;
  }
  return 0;
}

/**
 * 計算 ACWR 急慢性訓練負荷比 (7天急性負荷 vs 28天慢性週均負荷)
 * @param {Array<object>} logs
 * @param {Date} [referenceDate=new Date()]
 * @returns {{
 *   ratio: number,
 *   acuteLoad: number,
 *   chronicLoad: number,
 *   anchorDateStr: string,
 *   isStaleFallback: boolean,
 *   status: { label: string, level: string, color: string, icon: string, advice: string },
 *   weeklyLoads: Array<{ label: string, load: number }>
 * }}
 */
export function calculateACWR(logs = [], referenceDate = new Date()) {
  const validLogs = (logs || []).filter(l => getActivityTimestamp(l) > 0);
  const todayEnd = new Date(referenceDate);
  todayEnd.setHours(23, 59, 59, 999);

  // 若最近 28 天內皆無紀錄，自動以最新一筆活動日期作為基準 (相容模擬資料或休季檢視)
  let anchorEnd = todayEnd;
  let isStaleFallback = false;

  if (validLogs.length > 0) {
    const latestTs = Math.max(...validLogs.map(l => getActivityTimestamp(l)));
    if (todayEnd.getTime() - latestTs > 28 * MS_PER_DAY) {
      anchorEnd = new Date(latestTs);
      anchorEnd.setHours(23, 59, 59, 999);
      isStaleFallback = true;
    }
  }

  const anchorMs = anchorEnd.getTime();
  const acuteStartMs = anchorMs - 7 * MS_PER_DAY;
  const chronicStartMs = anchorMs - 28 * MS_PER_DAY;

  let acuteLoad = 0;
  let chronicTotal = 0;
  const weekBuckets = [0, 0, 0, 0]; // [W-3, W-2, W-1, 本週7天]

  validLogs.forEach(log => {
    const ts = getActivityTimestamp(log);
    if (ts > anchorMs || ts <= chronicStartMs) return;

    const load = getActivityLoad(log);
    chronicTotal += load;
    if (ts > acuteStartMs) {
      acuteLoad += load;
    }

    const daysAgo = Math.floor((anchorMs - ts) / MS_PER_DAY);
    const bucketIdx = 3 - Math.min(3, Math.floor(daysAgo / 7));
    weekBuckets[bucketIdx] += load;
  });

  acuteLoad = Math.round(acuteLoad);
  const chronicLoad = Math.round((chronicTotal / 4) * 10) / 10;
  const ratio = chronicLoad > 0
    ? Math.round((acuteLoad / chronicLoad) * 100) / 100
    : (acuteLoad > 0 ? 1.5 : 0);

  let status;
  if (chronicLoad === 0 && acuteLoad === 0) {
    status = {
      label: '無近期負荷資料',
      level: 'none',
      color: '#94a3b8',
      icon: '⚪',
      advice: '近 28 天無訓練紀錄，建議從 Zone 1–2 輕鬆跑開始逐步恢復跑量。'
    };
  } else if (ratio < 0.8) {
    status = {
      label: '減量 / 負荷偏低',
      level: 'underload',
      color: '#38bdf8',
      icon: '🔵',
      advice: '近期負荷低於 4 週平均，若是賽前減量期屬正常；若在備戰期可適度增加有氧里程。'
    };
  } else if (ratio <= 1.3) {
    status = {
      label: '最佳甜蜜區 (綠燈)',
      level: 'optimal',
      color: '#10b981',
      icon: '🟢',
      advice: '急慢性負荷平衡極佳！體能穩定成長且受傷風險低，可安心依課表推進。'
    };
  } else if (ratio <= 1.5) {
    status = {
      label: '負荷警戒區 (黃燈)',
      level: 'caution',
      color: '#f59e0b',
      icon: '🟡',
      advice: '本週負荷上升較快，請留意雙腳疲勞與晨脈變化，避免連續安排高強度質量課。'
    };
  } else {
    status = {
      label: '過勞高風險 (紅燈)',
      level: 'danger',
      color: '#ef4444',
      icon: '🔴',
      advice: '急性負荷遠高於身體適應水準（>1.5），受傷風險偏高，強烈建議安排恢復跑或休跑 1–2 天！'
    };
  }

  return {
    ratio,
    acuteLoad,
    chronicLoad,
    anchorDateStr: formatDate(anchorEnd),
    isStaleFallback,
    status,
    weeklyLoads: [
      { label: '3週前', load: Math.round(weekBuckets[0]) },
      { label: '2週前', load: Math.round(weekBuckets[1]) },
      { label: '上週', load: Math.round(weekBuckets[2]) },
      { label: '近7天', load: Math.round(weekBuckets[3]) }
    ]
  };
}

/**
 * 計算單筆活動的有氧解耦率 (Aerobic Decoupling / Pa:HR Drift)
 * 比較前半段與後半段的「速度 / 心率」效率比變化
 * @param {object} activity
 * @returns {{
 *   valid: boolean,
 *   reason?: string,
 *   decouplingPct?: number,
 *   efFirst?: number,
 *   efSecond?: number,
 *   hrFirst?: number,
 *   hrSecond?: number,
 *   splitCount?: number,
 *   status?: { label: string, level: string, color: string, icon: string, advice: string }
 * }}
 */
export function calculateAerobicDecoupling(activity) {
  const splits = (activity?.lapSplits || []).filter(
    s => !s.isTimeBased && s.paceSec > 0 && s.hr > 0
  );

  if (splits.length < 4) {
    return { valid: false, reason: '需至少 4 公里完整分段與心率才可評估有氧解耦' };
  }

  const half = Math.floor(splits.length / 2);
  const firstHalf = splits.slice(0, half);
  const secondHalf = splits.slice(half);

  // 速度 (m/min) = 1000 / (paceSec / 60) = 60000 / paceSec
  const calcHalfStats = (arr) => {
    const avgPaceSec = arr.reduce((sum, s) => sum + s.paceSec, 0) / arr.length;
    const avgHr = arr.reduce((sum, s) => sum + s.hr, 0) / arr.length;
    const speedMPerMin = 60000 / avgPaceSec;
    const ef = speedMPerMin / avgHr;
    return { ef, avgHr: Math.round(avgHr), avgPaceSec };
  };

  const s1 = calcHalfStats(firstHalf);
  const s2 = calcHalfStats(secondHalf);
  if (s1.ef <= 0) {
    return { valid: false, reason: '效率因子異常' };
  }

  const decouplingPct = Math.round(((s1.ef - s2.ef) / s1.ef) * 1000) / 10;

  let status;
  if (decouplingPct <= 5.0) {
    status = {
      label: '有氧基底穩固',
      level: 'solid',
      color: '#10b981',
      icon: '🟢',
      advice: '後半程心率與配速幾乎無漂移（≤ 5%），代表此距離下的有氧耐力非常紮實！'
    };
  } else if (decouplingPct <= 10.0) {
    status = {
      label: '輕微心率漂移',
      level: 'mild',
      color: '#f59e0b',
      icon: '🟡',
      advice: '後半程出現 5–10% 心率漂移，屬正常長距離疲勞反應，若天氣炎熱可多留意補水。'
    };
  } else {
    status = {
      label: '顯著有氧解耦',
      level: 'high',
      color: '#ef4444',
      icon: '🔴',
      advice: '後半程心率明顯飆升或配速衰退（> 10%），建議多累積 Zone 2 輕鬆跑來打穩有氧基底。'
    };
  }

  return {
    valid: true,
    decouplingPct,
    efFirst: Math.round(s1.ef * 100) / 100,
    efSecond: Math.round(s2.ef * 100) / 100,
    hrFirst: s1.avgHr,
    hrSecond: s2.avgHr,
    splitCount: splits.length,
    status
  };
}

/**
 * 從歷史日誌萃取長距離有氧跑的解耦率趨勢 (供心率區間分析頁繪圖)
 * 篩選條件：至少 6 公里有效分段之 E / M / 一般有氧跑
 * @param {Array<object>} logs
 * @param {number} [limit=16]
 * @returns {Array<object>}
 */
export function extractDecouplingTrend(logs = [], limit = 16) {
  const aerobicTypes = new Set(['EASY', 'MARATHON', 'GENERAL', 'RACE']);
  const candidates = (logs || [])
    .filter(l => aerobicTypes.has(l.workoutType || 'EASY'))
    .map(l => {
      const res = calculateAerobicDecoupling(l);
      if (!res.valid || res.splitCount < 6) return null;
      return {
        date: formatDate(l.activityDate),
        ts: getActivityTimestamp(l),
        activityId: l.activityId,
        activityName: l.activityName,
        distanceKm: l.distanceKm,
        decouplingPct: res.decouplingPct,
        status: res.status
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);

  return candidates.slice(-limit);
}
