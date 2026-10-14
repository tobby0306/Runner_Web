/**
 * Runner Pulse Analytics - Jack Daniels VDOT Algorithm Engine (Task T-07)
 * 實作 Jack Daniels 跑力公式與完賽時間預測
 * 依據 running_analyzer_spec.md Section 5.2 與 T-07 Acceptance Criteria
 */

import { parseDuration, formatDuration, formatPace } from './formatters.js';

/**
 * 計算單場賽事或測驗之 VDOT 跑力值 (Jack Daniels Running Formula)
 * @param {number} distanceKm 距離 (公里)
 * @param {number} finishTimeSec 完賽總秒數
 * @returns {number} VDOT 跑力小數點後一位 (例: 36.3)
 */
export function calcVDOT(distanceKm, finishTimeSec) {
  if (!distanceKm || !finishTimeSec || distanceKm <= 0 || finishTimeSec <= 0) {
    return 0;
  }

  // 1. 換算公尺 (d) 與分鐘數 (t)
  const d = distanceKm * 1000.0;
  const t = finishTimeSec / 60.0;
  const v = d / t; // 公尺/分鐘

  // 2. 計算耗氧量 VO2 (Daniels Oxygen Cost equation)
  // VO2 = -4.60 + 0.182258 * v + 0.000104 * v^2
  const vo2 = -4.60 + (0.182258 * v) + (0.000104 * Math.pow(v, 2));

  // 3. 計算跑者當前時間下所能維持的 VO2max 百分比 (%VO2max drop-off equation)
  // %VO2max = 0.8 + 0.1894393 * e^(-0.012778*t) + 0.2989558 * e^(-0.1932605*t)
  const pctVo2Max = 0.8 + 
    (0.1894393 * Math.exp(-0.012778 * t)) + 
    (0.2989558 * Math.exp(-0.1932605 * t));

  if (pctVo2Max <= 0) return 0;

  // 4. VDOT = VO2 / %VO2max
  const vdot = vo2 / pctVo2Max;
  return Math.round(vdot * 10) / 10;
}

/**
 * 從所有歷史活動中自動萃取 RACE (比賽) 與 TEST (測驗) 活動並換算 VDOT
 * @param {Array<object>} activities 
 * @returns {Array<{ date: string, activityId: string, activityName: string, workoutType: string, distanceKm: number, finishTimeStr: string, finishTimeSec: number, vdot: number }>}
 */
export function extractVDOTMilestones(activities = []) {
  if (!Array.isArray(activities) || activities.length === 0) return [];

  const milestones = [];

  for (let i = 0; i < activities.length; i++) {
    const act = activities[i];
    const type = act.workoutType;

    // 依規格書 5.2：VDOT 僅對 TEST 與 RACE 活動計算
    if (type === 'TEST' || type === 'RACE') {
      const dist = act.distanceKm || 0;
      const sec = act.durationTotalSec || parseDuration(act.durationTotal);

      if (dist >= 3 && sec > 0) { // 至少大於 3K 之測驗或比賽
        const vdot = calcVDOT(dist, sec);
        if (vdot > 20 && vdot < 85) { // 合理生理範圍過濾
          milestones.push({
            date: act.activityDate ? String(act.activityDate).slice(0, 10) : act.activityDateRaw.slice(0, 10),
            activityId: act.activityId,
            activityName: act.activityName,
            workoutType: type,
            distanceKm: dist,
            finishTimeStr: act.durationTotal,
            finishTimeSec: sec,
            vdot
          });
        }
      }
    }
  }

  // 依日期時間升冪排序 (供歷史趨勢折線圖由左到右繪製)
  return milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * 依 VDOT 跑力分數反推各項標準距離預估完賽時間與訓練配速
 * 參考 Jack Daniels Running Formula 經典配速常數表
 * @param {number} vdot
 */
export function getVDOTPredictions(vdot = 36.0) {
  const v = Math.max(30, Math.min(75, vdot));

  // 依基準 VDOT 36 與回歸模型推估標準賽事完賽時間 (秒)
  // 5K: 基準 26:15 (1575s) at VDOT 36.0
  const time5kSec = Math.round(1575 * Math.pow(36.0 / v, 1.06));
  // 10K: 約為 5K * 2.08
  const time10kSec = Math.round(time5kSec * 2.085);
  // 半馬 (21.0975K): 約為 10K * 2.22
  const timeHalfSec = Math.round(time10kSec * 2.22);
  // 全馬 (42.195K): 約為 半馬 * 2.15
  const timeFullSec = Math.round(timeHalfSec * 2.14);

  // 計算建議訓練配速 (秒/km)
  // E 配速 (輕鬆跑): 約 5K 配速的 1.25 ~ 1.35 倍
  const pace5k = time5kSec / 5.0;
  const easyPaceSec = Math.round(pace5k * 1.30);
  const marathonPaceSec = Math.round(timeFullSec / 42.195);
  const thresholdPaceSec = Math.round(pace5k * 1.08);
  const intervalPaceSec = Math.round(pace5k * 0.96);
  const repetitionPaceSec = Math.round(pace5k * 0.90);

  return {
    vdot: v,
    racePredictions: [
      { event: '5 公里 (5K)', distanceKm: 5.0, finishTime: formatDuration(time5kSec), avgPace: formatPace(pace5k) },
      { event: '10 公里 (10K)', distanceKm: 10.0, finishTime: formatDuration(time10kSec), avgPace: formatPace(time10kSec / 10.0) },
      { event: '半程馬拉松 (21.1K)', distanceKm: 21.0975, finishTime: formatDuration(timeHalfSec, true), avgPace: formatPace(timeHalfSec / 21.0975) },
      { event: '全程馬拉松 (42.2K)', distanceKm: 42.195, finishTime: formatDuration(timeFullSec, true), avgPace: formatPace(timeFullSec / 42.195) }
    ],
    trainingPaces: [
      { zone: 'E 輕鬆跑', paceSec: easyPaceSec, paceStr: formatPace(easyPaceSec), purpose: '有氧基底、微血管增生、主動修復' },
      { zone: 'M 馬拉松跑', paceSec: marathonPaceSec, paceStr: formatPace(marathonPaceSec), purpose: '模擬巡航配速、提升脂肪利用率' },
      { zone: 'T 乳酸門檻跑', paceSec: thresholdPaceSec, paceStr: formatPace(thresholdPaceSec), purpose: '提升乳酸清除效率 (乳酸門檻)' },
      { zone: 'I 最大攝氧量', paceSec: intervalPaceSec, paceStr: formatPace(intervalPaceSec), purpose: '刺激 VO2Max 心肺極限與心搏量' },
      { zone: 'R 速度重複跑', paceSec: repetitionPaceSec, paceStr: formatPace(repetitionPaceSec), purpose: '提升跑步經濟性與快縮肌神經徵召' }
    ]
  };
}
