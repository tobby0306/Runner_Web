/**
 * Runner Pulse Analytics - Career Honours & Time Machine Engine
 * 1. 生涯總計 (環台圈數、台北101/玉山爬升)
 * 2. 4 大距離 (5K / 10K / 半馬 / 全馬) 金銀銅頒獎台 (含每公里分段滑動視窗 Split PR 偵測)
 * 3. 單場之最極限紀錄牆 (最快1K、最長距離、最長時間、最高爬升、最高負荷、單月王、連續訓練週數)
 * 4. GitHub 風格年度跑步熱力圖 (2020 ~ 2026)
 * 5. 歷年的這週時光機對比
 */

import { formatDate, formatDuration, formatPace, getActivityYear } from './formatters.js';
import { getActivityTimestamp } from './activityParser.js';
import { getActivityLoad } from './physiologyCalc.js';

const TAIWAN_COAST_KM = 1100; // 台灣環島約 1,100 km
const TAIPEI_101_M = 508;     // 台北 101 高度 508 m
const YUSHAN_M = 3952;        // 玉山主峰 3,952 m

/**
 * 1. 計算生涯累積總計
 * @param {Array<object>} logs
 */
export function calculateLifetimeTotals(logs = []) {
  let totalKm = 0;
  let totalSec = 0;
  let totalElevM = 0;
  let totalRuns = 0;

  (logs || []).forEach(l => {
    totalKm += l.distanceKm || 0;
    totalSec += l.durationTotalSec || 0;
    totalElevM += l.elevationGain || 0;
    totalRuns += 1;
  });

  const totalHours = Math.round((totalSec / 3600) * 10) / 10;
  const taiwanLoops = Math.round((totalKm / TAIWAN_COAST_KM) * 100) / 100;
  const taipei101Count = Math.round((totalElevM / TAIPEI_101_M) * 10) / 10;
  const yushanCount = Math.round((totalElevM / YUSHAN_M) * 10) / 10;

  return {
    totalKm: Math.round(totalKm * 10) / 10,
    totalSec,
    totalHours,
    totalElevM: Math.round(totalElevM),
    totalRuns,
    taiwanLoops,
    taipei101Count,
    yushanCount
  };
}

/**
 * 使用滑動視窗從完整每公里分段中尋找連續 N 公里的最快時間
 * @param {Array<object>} splits
 * @param {number} targetKm 目標距離 (例: 5, 10, 21.0975)
 * @returns {{ timeSec: number, startLap: number, endLap: number }|null}
 */
function findFastestSplitWindow(splits, targetKm) {
  const valid = (splits || []).filter(s => !s.isTimeBased && s.paceSec >= 120 && s.paceSec <= 1200);
  const wholeKm = Math.floor(targetKm);
  const fracKm = targetKm - wholeKm;
  const neededLaps = fracKm > 0.01 ? wholeKm + 1 : wholeKm;

  if (valid.length < neededLaps) return null;

  // 確保分段編號大致連續（避免缺漏太多分段造成誤差）
  let best = null;
  for (let i = 0; i <= valid.length - neededLaps; i++) {
    let sumSec = 0;
    let isContiguous = true;
    for (let j = 0; j < wholeKm; j++) {
      if (j > 0 && valid[i + j].lap - valid[i + j - 1].lap > 1) {
        isContiguous = false;
        break;
      }
      sumSec += valid[i + j].paceSec;
    }
    if (!isContiguous) continue;

    if (fracKm > 0.01) {
      const nextSplit = valid[i + wholeKm];
      if (nextSplit.lap - valid[i + wholeKm - 1].lap > 1) continue;
      sumSec += nextSplit.paceSec * fracKm;
    }

    const roundedSec = Math.round(sumSec);
    if (!best || roundedSec < best.timeSec) {
      best = {
        timeSec: roundedSec,
        startLap: valid[i].lap,
        endLap: valid[i + neededLaps - 1].lap
      };
    }
  }
  return best;
}

/**
 * 判斷是否為間歇／重複跑等含休息分段之課表（不計入連續距離 PR 金銀銅）
 * @param {object} act
 * @returns {boolean}
 */
function isIntervalWorkout(act) {
  if (!act) return false;
  const wType = act.workoutType || '';
  if (wType === 'INTERVAL' || wType === 'REPETITION') return true;

  const name = String(act.activityName || '');
  // 偵測常見間歇命名：200m R * 8、800m I x 5、3min T x 6、T - 3 x 2km、間歇
  if (/(\d+\s*(?:m|k|km|min|分鐘)|[RTI])\s*[x×*]\s*\d+|\d+\s*[x×*]\s*\d+\s*(?:m|k|km|min)|間歇|亞索/i.test(name)) {
    return true;
  }

  // 若分段內含時間組別或休息註記 (breakNote) 也視為間歇
  const splits = act.lapSplits || [];
  if (splits.some(s => s.isTimeBased || s.breakNote)) {
    return true;
  }

  return false;
}

/**
 * 2. 萃取 4 大標準距離 (5K / 10K / 半馬 / 全馬) 金銀銅 Top 3
 * 同一場活動於同一距離最多只取一筆最佳表現 (支援全馬中抓出最快半馬/10K/5K，並自動排除間歇課表)
 * @param {Array<object>} logs
 */
export function extractDistancePodiums(logs = []) {
  const categories = [
    { key: '5K', title: '5K 速度榜', targetKm: 5.0, minFullKm: 4.85, maxFullKm: 5.4 },
    { key: '10K', title: '10K 進階榜', targetKm: 10.0, minFullKm: 9.8, maxFullKm: 10.6 },
    { key: 'HM', title: '半程馬拉松 (21.1K)', targetKm: 21.0975, minFullKm: 20.8, maxFullKm: 21.8 },
    { key: 'FM', title: '全程馬拉松 (42.2K)', targetKm: 42.195, minFullKm: 41.5, maxFullKm: 43.5 }
  ];

  const result = {};

  categories.forEach(cat => {
    const candidates = [];

    (logs || []).forEach(act => {
      if (isIntervalWorkout(act)) return;

      const dist = act.distanceKm || 0;
      const totalSec = act.durationTotalSec || 0;
      if (dist < cat.minFullKm || totalSec <= 0) return;

      let bestCandidate = null;

      // 1) 若該場總距離剛好符合該標準距離，直接採計完賽總時間 (依目標距離微幅正規化或直接採用)
      if (dist >= cat.minFullKm && dist <= cat.maxFullKm) {
        const normalizedSec = Math.round((totalSec / dist) * cat.targetKm);
        bestCandidate = {
          activityId: act.activityId,
          activityName: act.activityName,
          date: formatDate(act.activityDate),
          timeSec: normalizedSec,
          timeStr: formatDuration(normalizedSec, normalizedSec >= 3600),
          avgPaceStr: formatPace(normalizedSec / cat.targetKm),
          sourceType: 'full',
          sourceLabel: '🏁 完賽實跑'
        };
      }

      // 2) 若有每公里分段，透過滑動視窗搜尋該場中更快的「賽中分段 (Split PR)」
      const splitBest = findFastestSplitWindow(act.lapSplits, cat.targetKm);
      if (splitBest && (!bestCandidate || splitBest.timeSec < bestCandidate.timeSec)) {
        // 若本身就是標準距離實跑，優先保留實跑標籤；若來自更長距離（如全馬中的半馬），標註 Split PR
        const isFromLonger = dist > cat.maxFullKm;
        bestCandidate = {
          activityId: act.activityId,
          activityName: act.activityName,
          date: formatDate(act.activityDate),
          timeSec: splitBest.timeSec,
          timeStr: formatDuration(splitBest.timeSec, splitBest.timeSec >= 3600),
          avgPaceStr: formatPace(splitBest.timeSec / cat.targetKm),
          sourceType: isFromLonger ? 'split' : 'full',
          sourceLabel: isFromLonger
            ? `⚡ 賽中分段 (${splitBest.startLap}–${splitBest.endLap}k)`
            : '🏁 完賽實跑'
        };
      }

      if (bestCandidate) {
        candidates.push(bestCandidate);
      }
    });

    candidates.sort((a, b) => a.timeSec - b.timeSec);
    result[cat.key] = {
      ...cat,
      podium: candidates.slice(0, 3)
    };
  });

  return result;
}

/**
 * 3. 萃取「單場之最」極限紀錄牆 (All-Time Bests)
 * @param {Array<object>} logs
 */
export function extractAllTimeBests(logs = []) {
  let fastestKm = null;
  let longestDist = null;
  let longestTime = null;
  let highestElev = null;
  let highestLoad = null;

  const monthTotals = new Map(); // 'YYYY-MM' -> { km, count }
  const activeWeeks = new Set(); // ISO week key 'YYYY-Www'

  (logs || []).forEach(act => {
    const dateStr = formatDate(act.activityDate);
    const load = getActivityLoad(act);

    // 單場距離
    if (act.distanceKm > 0 && (!longestDist || act.distanceKm > longestDist.value)) {
      longestDist = {
        value: act.distanceKm,
        display: `${act.distanceKm.toFixed(2)} km`,
        activityId: act.activityId,
        activityName: act.activityName,
        date: dateStr
      };
    }

    // 單場時間
    if (act.durationTotalSec > 0 && (!longestTime || act.durationTotalSec > longestTime.value)) {
      longestTime = {
        value: act.durationTotalSec,
        display: formatDuration(act.durationTotalSec, true),
        activityId: act.activityId,
        activityName: act.activityName,
        date: dateStr
      };
    }

    // 單場爬升
    if (act.elevationGain > 0 && (!highestElev || act.elevationGain > highestElev.value)) {
      highestElev = {
        value: act.elevationGain,
        display: `${Math.round(act.elevationGain)} m`,
        activityId: act.activityId,
        activityName: act.activityName,
        date: dateStr
      };
    }

    // 單場最高負荷
    if (load > 0 && (!highestLoad || load > highestLoad.value)) {
      highestLoad = {
        value: load,
        display: `${Math.round(load)} TRIMP`,
        activityId: act.activityId,
        activityName: act.activityName,
        date: dateStr
      };
    }

    // 史上最快單公里 (排除間歇組與異常 GPS < 140s/km = 2:20/km)
    (act.lapSplits || []).forEach(s => {
      if (!s.isTimeBased && s.paceSec >= 140 && s.paceSec <= 900) {
        if (!fastestKm || s.paceSec < fastestKm.value) {
          fastestKm = {
            value: s.paceSec,
            display: formatPace(s.paceSec),
            lapLabel: s.label || `${s.lap}k`,
            hr: s.hr || null,
            activityId: act.activityId,
            activityName: act.activityName,
            date: dateStr
          };
        }
      }
    });

    // 單月累積與週次 Streak
    if (dateStr && dateStr.length >= 7) {
      const ym = dateStr.slice(0, 7);
      const prev = monthTotals.get(ym) || { km: 0, count: 0 };
      monthTotals.set(ym, { km: prev.km + (act.distanceKm || 0), count: prev.count + 1 });
    }

    const ts = getActivityTimestamp(act);
    if (ts > 0) {
      activeWeeks.add(getISOWeekKey(new Date(ts)));
    }
  });

  // 單月最高跑量王
  let bestMonth = null;
  monthTotals.forEach((val, ym) => {
    if (!bestMonth || val.km > bestMonth.km) {
      bestMonth = { ym, km: Math.round(val.km * 10) / 10, count: val.count };
    }
  });

  // 最長連續訓練週數 (Weekly Streak)
  const longestStreakWeeks = calcLongestWeekStreak(activeWeeks);

  return {
    fastestKm,
    longestDist,
    longestTime,
    highestElev,
    highestLoad,
    bestMonth,
    longestStreakWeeks
  };
}

/**
 * 取得連續週數 Key (以週一為一週起始 YYYY-MM-DD)
 */
function getISOWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // Mon=1 .. Sun=7
  d.setDate(d.getDate() - (day - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function calcLongestWeekStreak(weekMondaySet) {
  if (!weekMondaySet || weekMondaySet.size === 0) return 0;
  const mondays = Array.from(weekMondaySet)
    .map(str => new Date(`${str}T00:00:00`).getTime())
    .sort((a, b) => a - b);

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < mondays.length; i++) {
    const diffDays = Math.round((mondays[i] - mondays[i - 1]) / (24 * 60 * 60 * 1000));
    if (diffDays === 7) {
      currentStreak += 1;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else if (diffDays > 7) {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

/**
 * 4. 建立 GitHub 風格年度跑步熱力圖資料 (2020 ~ 2026)
 * @param {Array<object>} logs
 * @param {number} [targetYear]
 */
export function buildYearlyHeatmapData(logs = [], targetYear = null) {
  const yearSet = new Set();
  const dayMap = new Map(); // 'YYYY-MM-DD' -> { km, runs: [] }

  (logs || []).forEach(act => {
    const y = act.activityYear || getActivityYear(act.activityDate);
    if (y) yearSet.add(y);

    const dateStr = formatDate(act.activityDate);
    if (!dateStr) return;
    const entry = dayMap.get(dateStr) || { km: 0, runs: [] };
    entry.km += act.distanceKm || 0;
    entry.runs.push({
      activityId: act.activityId,
      activityName: act.activityName,
      distanceKm: act.distanceKm || 0,
      paceAvg: act.paceAvg || ''
    });
    dayMap.set(dateStr, entry);
  });

  const currentYear = new Date().getFullYear();
  const sortedYears = Array.from(yearSet).sort((a, b) => b - a);
  const recentYears = sortedYears.filter(y => y >= currentYear - 1);
  const availableYears = recentYears.length > 0 ? recentYears : sortedYears.slice(0, 2);
  const year = targetYear && availableYears.includes(targetYear)
    ? targetYear
    : (availableYears[0] || currentYear);

  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const startDayOfWeek = jan1.getDay(); // 0=Sun .. 6=Sat

  // 產生 53~54 週 × 7 天矩陣 (column = week, row = Sun..Sat)
  const cells = [];
  for (let pad = 0; pad < startDayOfWeek; pad++) {
    cells.push({ empty: true });
  }

  let totalKm = 0;
  let activeDays = 0;
  const cursor = new Date(jan1);
  while (cursor <= dec31) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    const info = dayMap.get(key);
    const km = info ? Math.round(info.km * 10) / 10 : 0;

    if (km > 0) {
      totalKm += km;
      activeDays += 1;
    }

    let level = 0;
    if (km > 0 && km < 6) level = 1;
    else if (km >= 6 && km < 12) level = 2;
    else if (km >= 12 && km < 20) level = 3;
    else if (km >= 20) level = 4;

    cells.push({
      empty: false,
      date: key,
      month: cursor.getMonth(),
      km,
      level,
      runs: info ? info.runs : []
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  // 切成每週 7 格
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    const col = cells.slice(i, i + 7);
    while (col.length < 7) col.push({ empty: true });
    weeks.push(col);
  }

  return {
    year,
    availableYears,
    totalKm: Math.round(totalKm * 10) / 10,
    activeDays,
    weeks
  };
}

/**
 * 5. 「歷年的這週」時光機對比 (依目標日期前後 ±3 天，跨 2020~2026 比對每年同期訓練)
 * @param {Array<object>} logs
 * @param {Date} [referenceDate=new Date()]
 */
export function extractTimeMachineWeeks(logs = [], referenceDate = new Date()) {
  const refMonth = referenceDate.getMonth();
  const refDate = referenceDate.getDate();

  const yearsSet = new Set();
  (logs || []).forEach(l => {
    const y = l.activityYear || getActivityYear(l.activityDate);
    if (y) yearsSet.add(y);
  });

  const years = Array.from(yearsSet).sort((a, b) => b - a);
  const MS_3_5_DAYS = 3.5 * 24 * 60 * 60 * 1000;

  return years.map(y => {
    const targetCenter = new Date(y, refMonth, refDate, 12, 0, 0);
    const startMs = targetCenter.getTime() - MS_3_5_DAYS;
    const endMs = targetCenter.getTime() + MS_3_5_DAYS;

    const matched = (logs || []).filter(l => {
      const ts = getActivityTimestamp(l);
      return ts >= startMs && ts <= endMs;
    });

    const totalKm = matched.reduce((sum, l) => sum + (l.distanceKm || 0), 0);
    const totalSec = matched.reduce((sum, l) => sum + (l.durationTotalSec || 0), 0);
    const avgPaceSec = totalKm > 0 ? totalSec / totalKm : 0;

    const hrLogs = matched.filter(l => l.hrAvg > 0);
    const avgHr = hrLogs.length > 0
      ? Math.round(hrLogs.reduce((sum, l) => sum + l.hrAvg, 0) / hrLogs.length)
      : null;

    const topRun = matched.slice().sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0))[0] || null;

    return {
      year: y,
      runCount: matched.length,
      totalKm: Math.round(totalKm * 10) / 10,
      avgPaceStr: avgPaceSec > 0 ? formatPace(avgPaceSec) : '-',
      avgHr,
      topRun
    };
  });
}
