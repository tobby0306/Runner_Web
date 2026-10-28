/**
 * Runner Pulse Analytics - Schedule Engine & Execution Comparator (Task T-12)
 * 負責課表「計畫 vs 實際」動態比對、五態執行狀況判定、日誌自動錨定與月份時間窗口過濾
 */

import { formatDate, parseDuration, formatDuration } from './formatters.js';

/**
 * 課表五態執行狀態定義
 */
export const SCHEDULE_STATUS = {
  ON_TARGET: {
    key: 'ON_TARGET',
    label: '✅ 完美達標',
    badgeClass: 'badge-easy',
    color: '#10B981',
    desc: '實際里程達計畫 90% ~ 115%，配速與體能負荷最適化'
  },
  EXCEEDED: {
    key: 'EXCEEDED',
    label: '🚀 超額執行',
    badgeClass: 'badge-marathon',
    color: '#00F2FE',
    desc: '實際里程超過計畫 115%，注意課後心率與肌肉疲勞恢復'
  },
  PARTIAL: {
    key: 'PARTIAL',
    label: '⚠️ 里程未滿',
    badgeClass: 'badge-threshold',
    color: '#FF6B4A',
    desc: '實際完成未達計畫 90%，建議檢視當日體感或作息'
  },
  MISSED: {
    key: 'MISSED',
    label: '❌ 缺席未跑',
    badgeClass: 'badge-interval',
    color: '#EF4444',
    desc: '課表日期已過但未執行任何里程'
  },
  UPCOMING: {
    key: 'UPCOMING',
    label: '⏳ 待執行',
    badgeClass: 'badge-general',
    color: '#94A3B8',
    desc: '未來課表，請依配速建議與備註執行'
  }
};

/**
 * 安全解析各種日期格式為本地時間 00:00:00 Date 物件
 * 支援 YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD, YYYY/M/D 等常見格式，防止 Invalid Date 與 NaN
 * @param {Date|string} dateInput 
 * @returns {Date|null}
 */
export function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }
  const str = String(dateInput).trim();
  if (!str) return null;

  // 1. 優先處理 YYYY[-/. ]M?M[-/. ]D?D (例如 2027/2/20, 2027-02-20, 2027.2.20)
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const dt = new Date(y, m, d, 0, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2. 原生 Date 備援解析
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0);
  }

  return null;
}

/**
 * 格式化 Date 為 YYYY-MM-DD
 * @param {Date|string} d 
 * @returns {string}
 */
export function toIsoDateString(d) {
  const dt = parseDateSafe(d);
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 依據月份範圍過濾課表
 * 需求 1：預設只顯示「這個月和下個月」
 * 
 * @param {Array<object>} scheduleList 原始課表陣列
 * @param {string} scope 'current_and_next' | 'current_month' | 'next_month' | 'all'
 * @param {Date} referenceDate 基準時間 (預設當前時間)
 * @returns {Array<object>}
 */
export function filterScheduleByScope(scheduleList = [], scope = 'current_and_next', referenceDate = new Date()) {
  if (!scheduleList || scheduleList.length === 0) return [];
  if (scope === 'all') return scheduleList;

  const ref = parseDateSafe(referenceDate) || new Date();
  const currentYear = ref.getFullYear();
  const currentMonth = ref.getMonth(); // 0-indexed (9 = 10月)

  // 計算下個月年月
  let nextYear = currentYear;
  let nextMonth = currentMonth + 1;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }

  return scheduleList.filter(item => {
    if (!item.date) return false;
    const itemDate = parseDateSafe(item.date);
    if (!itemDate) return false;

    const y = itemDate.getFullYear();
    const m = itemDate.getMonth();

    if (scope === 'current_month') {
      return y === currentYear && m === currentMonth;
    } else if (scope === 'next_month') {
      return y === nextYear && m === nextMonth;
    } else {
      // current_and_next (預設：這個月和下個月)
      return (y === currentYear && m === currentMonth) || (y === nextYear && m === nextMonth);
    }
  });
}

/**
 * 單堂課表「計畫 vs 實際」比對與狀態判定
 * 
 * @param {object} sched 課表項目 { week, date, day, name, tags, estKm, actKm, notes }
 * @param {Array<object>} logs 訓練日誌活動陣列
 * @param {Date} referenceDate 基準比對日期 (預設當前時間)
 * @returns {object} 包含執行狀態、差值、關聯活動之擴充物件
 */
export function evaluateScheduleItem(sched, logs = [], referenceDate = new Date()) {
  const schedDateStr = toIsoDateString(sched.date);
  const targetKm = parseFloat(sched.estKm) || 0;

  // 1. 動態比對訓練日誌中相同日期的活動
  const matchedLogs = logs.filter(l => {
    const actDateStr = toIsoDateString(l.activityDate || l.activityDateRaw);
    return actDateStr === schedDateStr;
  });

  // 計算實際跑量 (優先以日誌真實跑量聚合，備援使用試算表 ACT 欄位)
  let actualKm = 0;
  let matchedLog = null;

  if (matchedLogs.length > 0) {
    actualKm = Math.round(matchedLogs.reduce((acc, cur) => acc + (cur.distanceKm || 0), 0) * 100) / 100;
    matchedLog = matchedLogs[0]; // 主要關聯活動 (供分段彈窗)
  } else if (sched.actKm !== undefined && sched.actKm !== null && String(sched.actKm).trim() !== '') {
    actualKm = parseFloat(sched.actKm) || 0;
  }

  // 2. 計算達成比例與差距
  const completionRatio = targetKm > 0 ? Math.round((actualKm / targetKm) * 100) : (actualKm > 0 ? 100 : 0);
  const deltaKm = Math.round((actualKm - targetKm) * 100) / 100;

  // 3. 判定時間關係與執行五態
  const ref = parseDateSafe(referenceDate) || new Date();
  const schedDateObj = parseDateSafe(sched.date) || new Date();
  schedDateObj.setHours(23, 59, 59, 999);
  const isPast = schedDateObj < ref;

  let status = SCHEDULE_STATUS.UPCOMING;

  if (actualKm > 0) {
    if (completionRatio >= 90 && completionRatio <= 115) {
      status = SCHEDULE_STATUS.ON_TARGET;
    } else if (completionRatio > 115) {
      status = SCHEDULE_STATUS.EXCEEDED;
    } else {
      status = SCHEDULE_STATUS.PARTIAL;
    }
  } else {
    if (isPast) {
      status = SCHEDULE_STATUS.MISSED;
    } else {
      status = SCHEDULE_STATUS.UPCOMING;
    }
  }

  return {
    ...sched,
    targetKm,
    actualKm,
    completionRatio,
    deltaKm,
    status,
    isPast,
    matchedLog,
    matchedLogsCount: matchedLogs.length
  };
}

/**
 * 彙整整體課表執行成效 KPI
 * @param {Array<object>} evaluatedItems 已經過 evaluateScheduleItem 處理之項目
 * @returns {object}
 */
export function calculateScheduleSummary(evaluatedItems = []) {
  if (!evaluatedItems || evaluatedItems.length === 0) {
    return {
      totalTargetKm: 0,
      totalActualKm: 0,
      overallRatio: 0,
      totalWorkouts: 0,
      completedWorkouts: 0,
      missedWorkouts: 0,
      upcomingWorkouts: 0,
      qualityWorkoutsTarget: 0,
      qualityWorkoutsActual: 0,
      qualityComplianceRatio: 0
    };
  }

  const totalTargetKm = Math.round(evaluatedItems.reduce((acc, cur) => acc + cur.targetKm, 0) * 10) / 10;
  const totalActualKm = Math.round(evaluatedItems.reduce((acc, cur) => acc + cur.actualKm, 0) * 10) / 10;
  const overallRatio = totalTargetKm > 0 ? Math.round((totalActualKm / totalTargetKm) * 100) : 0;

  const totalWorkouts = evaluatedItems.length;
  const completedWorkouts = evaluatedItems.filter(i => 
    i.status.key === 'ON_TARGET' || i.status.key === 'EXCEEDED' || i.status.key === 'PARTIAL'
  ).length;
  const missedWorkouts = evaluatedItems.filter(i => i.status.key === 'MISSED').length;
  const upcomingWorkouts = evaluatedItems.filter(i => i.status.key === 'UPCOMING').length;

  // 質量課 (Q 門檻跑 / L 長距離) 獨立統計
  const qualityItems = evaluatedItems.filter(i => i.tags === 'Q' || i.tags === 'L');
  const qualityWorkoutsTarget = qualityItems.length;
  const qualityWorkoutsActual = qualityItems.filter(i => 
    i.status.key === 'ON_TARGET' || i.status.key === 'EXCEEDED' || (i.status.key === 'PARTIAL' && i.completionRatio >= 70)
  ).length;
  const qualityComplianceRatio = qualityWorkoutsTarget > 0 
    ? Math.round((qualityWorkoutsActual / qualityWorkoutsTarget) * 100) 
    : 100;

  return {
    totalTargetKm,
    totalActualKm,
    overallRatio,
    totalWorkouts,
    completedWorkouts,
    missedWorkouts,
    upcomingWorkouts,
    qualityWorkoutsTarget,
    qualityWorkoutsActual,
    qualityComplianceRatio
  };
}

/**
 * 智慧偵測當前或下一階段「目標賽事/測驗」里程碑 (從 Google Sheets 課表自動萃取)
 * 1. 優先找「未來或當日」符合關鍵字 (測驗/比賽/馬拉松/決戰/Test/Race/🎯/🔥) 或標籤為 Q/RACE 的活動
 * 2. 自動提取目標日期、名稱、執行重點/目標成績，並計算即時倒數剩餘天數
 * 3. 換下一個週期或新增課表後，全自動無縫切換，完全無需手動修改程式碼
 * @param {Array<object>} schedule 課表資料列表 (頁籤 3)
 * @param {Array<object>} logs 訓練日誌列表 (選填，用於對照基準成績)
 * @param {Date} referenceDate 參考日期 (預設當前時間)
 * @returns {object}
 */
export function detectTargetMilestone(schedule = [], logs = [], referenceDate = new Date()) {
  const ref = parseDateSafe(referenceDate) || new Date();
  ref.setHours(0, 0, 0, 0);
  const refTime = ref.getTime();

  let targetItem = null;

  if (Array.isArray(schedule) && schedule.length > 0) {
    // 依日期時間升序排序
    const sorted = [...schedule].filter(i => i.date).sort((a, b) => {
      const da = parseDateSafe(a.date);
      const db = parseDateSafe(b.date);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

    // 嚴格的目標賽事/測驗標識 (排除普通課表距離如 5K/10K 與平日 Q1/Q2 質量跑，只針對真正測驗與大賽)
    const milestoneRegex = /(測驗|比賽|馬拉松|半馬|全馬|決戰|大考|總驗收|race|marathon|test\b)/i;

    // 1. 優先找「今天或未來」名稱明確含有測驗/比賽/馬拉松，或標籤明確為 RACE 的活動
    const futureMilestones = sorted.filter(item => {
      const itemDate = parseDateSafe(item.date);
      if (!itemDate) return false;
      const isUpcoming = itemDate.getTime() >= refTime;
      const isMilestone = milestoneRegex.test(item.name || '') || (item.tags || '').toUpperCase() === 'RACE';
      return isUpcoming && isMilestone;
    });

    if (futureMilestones.length > 0) {
      targetItem = futureMilestones[0];
    } else {
      // 2. 若未來課表中沒有明確標註「測驗/比賽」，則取未來課表清單的最後一筆 (週期的最終總結日)
      const futureItems = sorted.filter(item => {
        const itemDate = parseDateSafe(item.date);
        if (!itemDate) return false;
        return itemDate.getTime() >= refTime;
      });

      if (futureItems.length > 0) {
        targetItem = futureItems[futureItems.length - 1];
      } else {
        // 3. 若全部課表都在過去，取全課表的最後一筆重大里程碑
        const pastMilestones = sorted.filter(item => 
          milestoneRegex.test(item.name || '') || (item.tags || '').toUpperCase() === 'RACE'
        );
        targetItem = pastMilestones.length > 0 ? pastMilestones[pastMilestones.length - 1] : sorted[sorted.length - 1];
      }
    }
  }

  // 預設容錯目標 (當課表無資料時)
  const fallbackDateStr = '2026-10-24';
  const targetDate = parseDateSafe(targetItem?.date) || parseDateSafe(fallbackDateStr);
  const targetDateStr = toIsoDateString(targetDate);
  const diffDays = Math.ceil((targetDate.getTime() - refTime) / (1000 * 60 * 60 * 24));

  // 整理目標名稱 (例如: 🎯 2026/10/24 5K VDOT 測驗日)
  let rawName = targetItem?.name || '5K VDOT 測驗日';
  let formattedName = rawName.replace(/^🎯\s*/, '').trim();
  const dateFormatted = targetDateStr.replace(/-/g, '/');
  if (!formattedName.includes(dateFormatted)) {
    formattedName = `🎯 ${dateFormatted} ${formattedName}`;
  } else {
    formattedName = `🎯 ${formattedName}`;
  }

  // 整理執行重點/目標成績
  let rawNotes = targetItem?.notes ? targetItem.notes.trim() : '衝刺突破 VDOT 38+ (5K 24:50)';

  // 倒數徽章文字 (只有真正到了測驗當天 diffDays === 0 才會顯示「今日決戰日」)
  let countdownBadgeText = '';
  if (isNaN(diffDays)) {
    countdownBadgeText = '目標期程確認中';
  } else if (diffDays > 0) {
    countdownBadgeText = `決戰倒數 ${diffDays} 天`;
  } else if (diffDays === 0) {
    countdownBadgeText = `🔥 今日決戰日！`;
  } else {
    countdownBadgeText = `週期已完成 (${Math.abs(diffDays)} 天前)`;
  }

  return {
    targetItem,
    targetDateStr,
    targetName: formattedName,
    notes: rawNotes,
    diffDays: isNaN(diffDays) ? 0 : diffDays,
    countdownBadgeText,
    isUpcoming: !isNaN(diffDays) && diffDays >= 0
  };
}

