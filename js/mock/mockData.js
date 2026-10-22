/**
 * Runner Pulse Analytics - Comprehensive Mock Data
 * 遵循 running_analyzer_spec.md 規格書定義之 3 個頁籤結構
 */

export const MOCK_DATA = {
  // 頁籤 1: 訓練日誌 (含每公里分段資料與 2020~2026 跑步紀錄)
  trainingLogs: [
    {
      activityId: '20520732623',
      activityDate: '2026-10-10T05:39:15Z',
      activityName: 'E-90min 輕鬆長跑',
      durationTotal: '1:30:04',
      durationMoving: '1:30:04',
      rpe: 3,
      trainingLoad: 19,
      distanceKm: 12.72,
      paceAvg: '7:05',
      hrAvg: 124.2,
      hrMax: 137,
      cadenceAvg: 186,
      strideLengthM: 0.76,
      elevationGain: 3,
      lapSplitsRaw: '1k(7:32, 110bpm) | 2k(7:17, 118bpm) | 3k(7:05, 122bpm) | 4k(7:02, 125bpm) | 5k(7:00, 126bpm) | 6k(6:58, 127bpm) | 7k(7:01, 125bpm) | 8k(7:04, 128bpm) | 9k(7:08, 130bpm) | 10k(7:02, 131bpm) | 11k(7:04, 132bpm) | 12k(6:59, 135bpm)',
      notes: '今天微雨涼爽，心率維持在低區間，體感輕鬆有餘力。'
    },
    {
      activityId: '20508912345',
      activityDate: '2026-10-07T11:20:00Z',
      activityName: '8K Q1: 3min T x 6 門檻跑',
      durationTotal: '0:52:14',
      durationMoving: '0:48:30',
      rpe: 7,
      trainingLoad: 38,
      distanceKm: 8.85,
      paceAvg: '5:28',
      hrAvg: 166.5,
      hrMax: 173,
      cadenceAvg: 192,
      strideLengthM: 0.95,
      elevationGain: 12,
      lapSplitsRaw: '1k(6:30, 135bpm) | 2k(5:28, 164bpm) | 3k(5:29, 166bpm) | 4k(6:30, 142bpm) | 5k(5:27, 168bpm) | 6k(5:26, 170bpm) | 7k(6:35, 145bpm) | 8k(5:25, 172bpm)',
      notes: '第 5, 6 組頂風，心率接近 LTHR 臨界點，但步頻維持 192。'
    },
    {
      activityId: '20485619283',
      activityDate: '2026-10-04T22:15:30Z',
      activityName: '200m R × 10 速度間歇',
      durationTotal: '0:42:10',
      durationMoving: '0:35:12',
      rpe: 8,
      trainingLoad: 42,
      distanceKm: 6.50,
      paceAvg: '4:46',
      hrAvg: 155.0,
      hrMax: 184,
      cadenceAvg: 198,
      strideLengthM: 1.08,
      elevationGain: 8,
      lapSplitsRaw: '1k(6:45, 128bpm) | 2k(4:45, 178bpm) | 3k(4:42, 182bpm) | 4k(4:48, 184bpm) | 5k(4:46, 183bpm) | 6k(6:50, 135bpm)',
      notes: '快縮肌刺激充沛，跑步經濟性良好。'
    },
    {
      activityId: '20260314050',
      activityDate: '2026-03-14T06:00:00Z',
      activityName: '5K-Test 跑力春季測驗',
      durationTotal: '0:26:15',
      durationMoving: '0:26:15',
      rpe: 9,
      trainingLoad: 55,
      distanceKm: 5.00,
      paceAvg: '5:15',
      hrAvg: 174.5,
      hrMax: 188,
      cadenceAvg: 194,
      strideLengthM: 0.98,
      elevationGain: 5,
      lapSplitsRaw: '1k(5:18, 165bpm) | 2k(5:16, 172bpm) | 3k(5:14, 175bpm) | 4k(5:15, 178bpm) | 5k(5:12, 188bpm)',
      notes: '基準測驗：26分15秒完賽，換算基準 VDOT 為 36.0。'
    },
    {
      activityId: '20250316001',
      activityDate: '2025-03-16T05:30:00Z',
      activityName: '2025 萬金石馬拉松',
      durationTotal: '4:08:42',
      durationMoving: '4:08:42',
      rpe: 8,
      trainingLoad: 110,
      distanceKm: 42.195,
      paceAvg: '5:53',
      hrAvg: 158.4,
      hrMax: 176,
      cadenceAvg: 188,
      strideLengthM: 0.91,
      elevationGain: 180,
      lapSplitsRaw: '1k(5:55, 145bpm) | 10k(5:52, 156bpm) | 21k(5:50, 158bpm) | 30k(5:54, 162bpm) | 40k(6:05, 171bpm)',
      notes: '金山段逆風強勁，30K 後配速微掉，順利完賽。'
    },
    {
      activityId: '20221218001',
      activityDate: '2022-12-18T06:30:00Z',
      activityName: '2022 台北馬拉松',
      durationTotal: '3:56:08',
      durationMoving: '3:56:08',
      rpe: 9,
      trainingLoad: 125,
      distanceKm: 42.195,
      paceAvg: '5:35',
      hrAvg: 165.2,
      hrMax: 179,
      cadenceAvg: 190,
      strideLengthM: 0.94,
      elevationGain: 85,
      lapSplitsRaw: '1k(5:35, 150bpm) | 10k(5:32, 162bpm) | 21k(5:34, 165bpm) | 35k(5:38, 172bpm) | 42k(5:40, 178bpm)',
      notes: '打破個人 PB 闖進 4 小時大關，換算 VDOT 約 40.5。'
    }
  ],

  // 頁籤 2: 訓練區間 (基準 VDOT 36, Max HR: 196, LTHR: 172)
  trainingZones: [
    {
      zone: 'Zone 1',
      name: 'Zone 1 恢復跑',
      paceGuide: '> 7:10',
      paceSecMin: 430,
      paceSecMax: 540,
      hrTarget: '112 – 137',
      hrMin: 112,
      hrMax: 137,
      pctLTHR: '65%–80%',
      pctMaxHR: '57%–70%',
      rpe: 'RPE 1-2 (極輕鬆，呼吸 3-3)',
      tactics: '高強度課表隔天消磁跑，完全無疲勞累積。',
      purpose: '主動修復與乳酸清除'
    },
    {
      zone: 'Zone 2',
      name: 'Zone 2 輕鬆跑 (E)',
      paceGuide: '6:25 – 7:09',
      paceSecMin: 385,
      paceSecMax: 429,
      hrTarget: '138 – 153',
      hrMin: 138,
      hrMax: 153,
      pctLTHR: '80%–89%',
      pctMaxHR: '70%–78%',
      rpe: 'RPE 3 (輕鬆，呼吸 3-3，能說完整長句)',
      tactics: '日常輕鬆跑應以此區間中段 (140-148 bpm) 為核心。',
      purpose: '建立基礎有氧、累積有氧底子、促進恢復。'
    },
    {
      zone: 'Zone 3',
      name: 'Zone 3 馬拉松 (M)',
      paceGuide: '6:01',
      paceSecMin: 361,
      paceSecMax: 361,
      hrTarget: '154 – 163',
      hrMin: 154,
      hrMax: 163,
      pctLTHR: '89%–95%',
      pctMaxHR: '78%–83%',
      rpe: 'RPE 4 (開始吃力，呼吸 2-2)',
      tactics: '2022 台北馬 (均心率 158.5 bpm) 強度。日常 E 跑若在此區間會因消耗醣原過快而提早疲勞，日常慢跑應避開。',
      purpose: '模擬馬拉松賽速、訓練後半程維持跑姿的能力。'
    },
    {
      zone: 'Zone 4',
      name: 'Zone 4 門檻跑 (T)',
      paceGuide: '5:29',
      paceSecMin: 329,
      paceSecMax: 329,
      hrTarget: '164 – 172',
      hrMin: 164,
      hrMax: 172,
      pctLTHR: '95%–100%',
      pctMaxHR: '84%–88%',
      rpe: 'RPE 5-6 (舒適的艱難，呼吸 2-2)',
      tactics: '週二 T 跑核心區，絕對不准衝破 172 bpm 天花板。',
      purpose: '提升身體清除與代謝乳酸的能力 (乳酸門檻)。'
    },
    {
      zone: 'Zone 5a',
      name: 'Zone 5 最大攝氧 (I)',
      paceGuide: '5:04',
      paceSecMin: 304,
      paceSecMax: 304,
      hrTarget: '173 – 196',
      hrMin: 173,
      hrMax: 196,
      pctLTHR: '> 100%',
      pctMaxHR: '88%–100%',
      rpe: 'RPE 7-8 (極度吃力，呼吸 2-1)',
      tactics: '刺激心肺極限，提升最大攝氧量 (VO2Max)。操場短速度間歇，基礎期暫時封印。',
      purpose: '刺激心肺極限，提升最大攝氧量 (VO2Max)。'
    },
    {
      zone: 'Zone 5b',
      name: 'Zone 5 重複/速度跑 (R)',
      paceGuide: '4:48',
      paceSecMin: 288,
      paceSecMax: 288,
      hrTarget: '183 – 196',
      hrMin: 183,
      hrMax: 196,
      pctLTHR: '> 100%',
      pctMaxHR: '93%–100%',
      rpe: 'RPE 9-10 (極限無氧衝刺)',
      tactics: '操場短速度間歇 (如 200m R 跑)。改善跑步經濟性，訓練快縮肌與步頻。',
      purpose: '改善跑步經濟性，訓練快縮肌與步頻。'
    }
  ],

  // 頁籤 3: 課表 (W1-W7 倒數計時週，目標 2026/10/24 VDOT 測驗)
  schedule: [
    {
      week: 'W1',
      date: '2026-10-24',
      day: '週六',
      name: '🎯 5K VDOT 秋季決戰測驗',
      tags: 'Q',
      estKm: 5.0,
      actKm: null,
      notes: '🔥 全力測驗跑，目標突破 VDOT 38+！前 2K 均速 5:10，後 3K 依體感漸進。'
    },
    {
      week: 'W1',
      date: '2026-10-22',
      day: '週四',
      name: '賽前減量 E-30min + 100m衝刺x4',
      tags: 'E',
      estKm: 4.5,
      actKm: null,
      notes: '保持神經敏銳度，不累積疲勞。'
    },
    {
      week: 'W2',
      date: '2026-10-18',
      day: '週日',
      name: 'E-75min 賽前最後長距離',
      tags: 'L',
      estKm: 11.0,
      actKm: null,
      notes: '嚴格壓制心率在 Zone 2 (<145bpm)。'
    },
    {
      week: 'W2',
      date: '2026-10-15',
      day: '週四',
      name: '8K Q1: 3min T x 5 門檻跑',
      tags: 'Q',
      estKm: 8.0,
      actKm: null,
      notes: '配速 5:29/km，間歇休 60 秒緩跑。'
    },
    {
      week: 'W3',
      date: '2026-10-10',
      day: '週六',
      name: 'E-90min 輕鬆長跑',
      tags: 'L',
      estKm: 12.5,
      actKm: 12.72,
      notes: '已完成 ✅ 體感極佳，心率穩定在 124bpm。'
    },
    {
      week: 'W3',
      date: '2026-10-07',
      day: '週三',
      name: '8K Q1: 3min T x 6 門檻跑',
      tags: 'Q',
      estKm: 8.8,
      actKm: 8.85,
      notes: '已完成 ✅ 達成配速 5:28/km。'
    }
  ]
};
