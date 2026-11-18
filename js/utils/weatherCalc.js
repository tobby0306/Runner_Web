/**
 * Runner Pulse Analytics - Weather & Heat Pace Adjustment Engine (Task T-WX-01)
 * 基於氣溫與相對濕度計算露點溫度、熱壓力係數、等效涼爽配速與熱修正 VDOT
 */

import { calcVDOT } from './vdotCalc.js';
import { formatPace } from './formatters.js';

/**
 * 熱壓力指數 (氣溫°C + 露點°C) 與掉速百分比分段對照表
 * 依台灣跑者習慣全面採用攝氏 (°C) 計算
 * 例：15°C + 露點 5°C = 20°C (無熱損)；30°C + 露點 25°C = 55°C (約掉速 8.5%)
 */
const HEAT_PENALTY_CURVE = [
  { sumC: 20.0, pct: 0.0 },
  { sumC: 25.6, pct: 0.5 },
  { sumC: 31.1, pct: 1.5 },
  { sumC: 36.7, pct: 3.0 },
  { sumC: 42.2, pct: 4.5 },
  { sumC: 47.8, pct: 6.0 },
  { sumC: 53.3, pct: 8.0 },
  { sumC: 58.9, pct: 10.5 },
  { sumC: 64.4, pct: 13.5 }
];

/**
 * 使用 Magnus-Tetens 公式計算露點溫度 (°C)
 * @param {number} tempC 氣溫 (°C)
 * @param {number} humidityPct 相對濕度 (1 - 100%)
 * @returns {number} 露點溫度 (°C，四捨五入至小數點後一位)
 */
export function calcDewPoint(tempC, humidityPct) {
  if (isNaN(tempC) || isNaN(humidityPct)) return 0;
  const rh = Math.min(100, Math.max(1, Number(humidityPct)));
  const t = Number(tempC);
  const a = 17.625;
  const b = 243.04;
  const alpha = Math.log(rh / 100) + (a * t) / (b + t);
  const dewPoint = (b * alpha) / (a - alpha);
  return Math.round(dewPoint * 10) / 10;
}

/**
 * 計算攝氏熱壓力總和指數 (氣溫°C + 露點°C)
 * @param {number} tempC
 * @param {number} humidityPct
 * @returns {number}
 */
export function calcHeatSumC(tempC, humidityPct) {
  const dewC = calcDewPoint(tempC, humidityPct);
  return Math.round((Number(tempC) + dewC) * 10) / 10;
}

/**
 * 計算熱壓力造成的配速掉速百分比 (%)
 * @param {number} tempC 氣溫 (°C)
 * @param {number} humidityPct 相對濕度 (%)
 * @returns {number} 掉速百分比 (例: 4.5 代表熱環境下配速慢了 4.5%)
 */
export function calcHeatPenaltyPct(tempC, humidityPct) {
  if (isNaN(tempC) || isNaN(humidityPct)) return 0;
  const sumC = calcHeatSumC(tempC, humidityPct);

  if (sumC <= HEAT_PENALTY_CURVE[0].sumC) return 0;

  for (let i = 1; i < HEAT_PENALTY_CURVE.length; i++) {
    const prev = HEAT_PENALTY_CURVE[i - 1];
    const curr = HEAT_PENALTY_CURVE[i];
    if (sumC <= curr.sumC) {
      const ratio = (sumC - prev.sumC) / (curr.sumC - prev.sumC);
      const pct = prev.pct + ratio * (curr.pct - prev.pct);
      return Math.round(pct * 10) / 10;
    }
  }

  const last = HEAT_PENALTY_CURVE[HEAT_PENALTY_CURVE.length - 1];
  const extra = (sumC - last.sumC) * 0.54;
  return Math.round(Math.min(20, last.pct + extra) * 10) / 10;
}

/**
 * 取得熱壓力體感等級與 UI 標籤資訊
 * @param {number} tempC
 * @param {number} humidityPct
 * @returns {{ label: string, level: string, color: string, icon: string, advice: string }}
 */
export function getHeatStressLevel(tempC, humidityPct) {
  const sumC = calcHeatSumC(tempC, humidityPct);
  if (sumC <= 23.0) {
    return {
      label: '涼爽舒適',
      level: 'cool',
      color: '#10b981',
      icon: '🍃',
      advice: '理想跑步氣候，無明顯熱負荷，配速可完全發揮真實跑力。'
    };
  }
  if (sumC <= 34.0) {
    return {
      label: '溫和微熱',
      level: 'warm',
      color: '#38bdf8',
      icon: '🌤️',
      advice: '有輕微熱負荷，長距離建議注意補水與電解質。'
    };
  }
  if (sumC <= 45.0) {
    return {
      label: '悶熱警戒',
      level: 'hot',
      color: '#f59e0b',
      icon: '☀️',
      advice: '台灣典型濕熱天氣，心率會明顯偏高，應依體感/心率降速，不必硬追課表配速。'
    };
  }
  if (sumC <= 53.5) {
    return {
      label: '高溫高濕',
      level: 'severe',
      color: '#f97316',
      icon: '🔥',
      advice: '熱壓力顯著，有氧配速可能掉速 6% 以上，強烈建議改以心率區間控制強度。'
    };
  }
  return {
    label: '極端酷熱',
    level: 'extreme',
    color: '#ef4444',
    icon: '🥵',
    advice: '中暑與脫水風險高，建議縮短距離、改為晨跑/夜跑或室內跑步機。'
  };
}

/**
 * 綜合計算等效涼爽配速與熱修正數據
 * @param {number} actualPaceSecPerKm 實跑平均配速 (秒/km)
 * @param {number} tempC 氣溫 (°C)
 * @param {number} humidityPct 相對濕度 (%)
 * @param {object} [options] 選填：distanceKm, durationSec
 * @returns {{
 *   dewPointC: number,
 *   heatSumC: number,
 *   penaltyPct: number,
 *   coolPaceSec: number,
 *   coolPaceStr: string,
 *   hotTargetPaceSec: number,
 *   hotTargetPaceStr: string,
 *   savedSecPerKm: number,
 *   stress: object,
 *   adjustedVDOT: number|null
 * }}
 */
export function calcWeatherAdjustment(actualPaceSecPerKm, tempC, humidityPct, options = {}) {
  const dewPointC = calcDewPoint(tempC, humidityPct);
  const heatSumC = calcHeatSumC(tempC, humidityPct);
  const penaltyPct = calcHeatPenaltyPct(tempC, humidityPct);
  const factor = 1 + penaltyPct / 100;
  const stress = getHeatStressLevel(tempC, humidityPct);

  const validPace = actualPaceSecPerKm > 0 ? Number(actualPaceSecPerKm) : 0;
  const coolPaceSec = validPace > 0 ? Math.round(validPace / factor) : 0;
  const hotTargetPaceSec = validPace > 0 ? Math.round(validPace * factor) : 0;
  const savedSecPerKm = validPace > 0 ? Math.max(0, Math.round(validPace - coolPaceSec)) : 0;

  let adjustedVDOT = null;
  if (options.distanceKm >= 3 && options.durationSec > 0) {
    const coolDurationSec = options.durationSec / factor;
    const vdot = calcVDOT(options.distanceKm, coolDurationSec);
    if (vdot > 20 && vdot < 85) {
      adjustedVDOT = vdot;
    }
  }

  return {
    dewPointC,
    heatSumC,
    penaltyPct,
    coolPaceSec,
    coolPaceStr: formatPace(coolPaceSec),
    hotTargetPaceSec,
    hotTargetPaceStr: formatPace(hotTargetPaceSec),
    savedSecPerKm,
    stress,
    adjustedVDOT
  };
}
