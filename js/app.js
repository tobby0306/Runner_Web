/**
 * Runner Pulse Analytics - Main Application Controller
 * 整合 Task T-01 ~ T-06 需求優化版
 * 1. KPI 改為 2026 年度里程 (YTD)
 * 2. 訓練日誌嚴格由最新一筆往前倒序排列
 * 3. 完整 Jack Daniels 7 大強度分類體系 (E, M, T, I, R, RACE, TEST) 與分段配速對標
 */

import { APP_CONFIG } from './config.js';
import { sheetsService, DataSourceStatus } from './services/sheetsService.js';
import { formatDate, formatDuration, formatPace, getActivityYear } from './utils/formatters.js';
import { getActivityTimestamp, classifyWorkoutType } from './utils/activityParser.js';
import { calcVDOT, extractVDOTMilestones, getVDOTPredictions } from './utils/vdotCalc.js';
import { 
  calculateHeartRateDistribution, 
  ZONE_DEFINITIONS, 
  filterActivitiesByPeriod, 
  getLatestTwoMonths 
} from './utils/zoneCalc.js';
import {
  aggregateWeeklyVolume,
  calculateWorkoutTypeBreakdown,
  WORKOUT_TYPE_CONFIG
} from './utils/weeklyVolumeCalc.js';
import {
  filterScheduleByScope,
  evaluateScheduleItem,
  calculateScheduleSummary,
  detectTargetMilestone,
  SCHEDULE_STATUS
} from './utils/scheduleCalc.js';

class AppController {
  constructor() {
    this.currentView = 'dashboard';
    this.activeLogFilter = 'ALL';
    this.searchQuery = '';
    this.weeklyRange = '12weeks'; // '8weeks' | '12weeks' | '2026' | 'all'
    this.scheduleScope = 'current_and_next'; // 'current_and_next' | 'current_month' | 'next_month' | 'all'
    this.dashWeeklyChartInstance = null;
    this.modalSplitsChartInstance = null;
    this.dashVdotChartInstance = null;
    this.fullVdotChartInstance = null;
    this.dashHrChartInstance = null;
    this.fullHrBarChartInstance = null;
    this.fullHrDoughnutChartInstance = null;
    this.prevMonthHrChartInstance = null;
    this.currMonthHrChartInstance = null;
    this.data = {
      logs: [],
      zones: [],
      schedule: [],
      status: DataSourceStatus.LOADING,
      lastSync: null,
      rawCounts: {}
    };

    this.dom = {
      sidebar: document.getElementById('appSidebar'),
      sidebarToggle: document.getElementById('btnSidebarToggle'),
      sidebarBackdrop: document.getElementById('sidebarBackdrop'),
      navButtons: document.querySelectorAll('.nav-item'),
      pageTitle: document.getElementById('pageTitle'),
      pageContent: document.getElementById('pageContent'),
      contentLoader: document.getElementById('contentLoader'),
      dataSourceStatus: document.getElementById('dataSourceStatus'),
      btnRefreshData: document.getElementById('btnRefreshData'),
      systemAlertContainer: document.getElementById('systemAlertContainer'),
      sidebarVdotBadge: document.getElementById('sidebarVdotBadge'),
      lapSplitsModal: document.getElementById('lapSplitsModal'),
      modalTitle: document.getElementById('modalActivityTitle'),
      modalMeta: document.getElementById('modalActivityMeta'),
      modalSplitsContent: document.getElementById('modalSplitsContent'),
      btnCloseModal: document.getElementById('btnCloseModal'),
      btnModalCloseAction: document.getElementById('btnModalCloseAction')
    };
  }

  /**
   * 初始化系統環境與載入資料
   */
  async init() {
    console.info('[App] Runner Pulse Analytics 初始化中...');
    this.bindEvents();
    this.initModalEvents();
    await this.loadApplicationData(false);
  }

  /**
   * 綁定使用者介面事件
   */
  bindEvents() {
    const toggleSidebar = (forceClose = false) => {
      if (!this.dom.sidebar) return;
      const willOpen = forceClose ? false : !this.dom.sidebar.classList.contains('open');
      this.dom.sidebar.classList.toggle('open', willOpen);
      if (this.dom.sidebarBackdrop) {
        this.dom.sidebarBackdrop.classList.toggle('active', willOpen);
      }
    };

    if (this.dom.sidebarToggle) {
      this.dom.sidebarToggle.addEventListener('click', () => toggleSidebar());
    }

    if (this.dom.sidebarBackdrop) {
      this.dom.sidebarBackdrop.addEventListener('click', () => toggleSidebar(true));
    }

    this.dom.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        this.switchView(targetView);
      });
    });

    if (this.dom.btnRefreshData) {
      this.dom.btnRefreshData.addEventListener('click', async () => {
        await this.loadApplicationData(true);
      });
    }
  }

  /**
   * 綁定 Modal 彈窗開關事件
   */
  initModalEvents() {
    const closeModal = () => {
      if (this.modalSplitsChartInstance) {
        this.modalSplitsChartInstance.destroy();
        this.modalSplitsChartInstance = null;
      }
      if (this.dom.lapSplitsModal) {
        this.dom.lapSplitsModal.classList.remove('open');
      }
    };

    if (this.dom.btnCloseModal) this.dom.btnCloseModal.addEventListener('click', closeModal);
    if (this.dom.btnModalCloseAction) this.dom.btnModalCloseAction.addEventListener('click', closeModal);
    if (this.dom.lapSplitsModal) {
      this.dom.lapSplitsModal.addEventListener('click', (e) => {
        if (e.target === this.dom.lapSplitsModal) closeModal();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dom.lapSplitsModal?.classList.contains('open')) {
        closeModal();
      }
    });
  }

  /**
   * 開啟每公里分段 (Lap Splits) 彈窗與繪製配速/心率雙軸折線圖 (Task T-11)
   */
  openLapSplitsModal(activityId) {
    const act = (this.data.logs || []).find(item => item.activityId === String(activityId));
    if (!act) return;

    if (this.modalSplitsChartInstance) {
      this.modalSplitsChartInstance.destroy();
      this.modalSplitsChartInstance = null;
    }

    if (this.dom.modalTitle) {
      this.dom.modalTitle.textContent = `${act.activityName}`;
    }
    if (this.dom.modalMeta) {
      this.dom.modalMeta.innerHTML = `
        <span>日期: <strong>${formatDate(act.activityDate)}</strong></span> &bull; 
        <span>總距離: <strong style="color:var(--accent-cyan);">${act.distanceKm} km</strong></span> &bull; 
        <span>均速: <strong>${act.paceAvg}</strong></span> &bull; 
        <span>平均心率: <strong style="color:var(--accent-orange);">${act.hrAvg || '-'} bpm</strong></span>
      `;
    }

    if (this.dom.modalSplitsContent) {
      const splits = act.lapSplits || [];
      if (splits.length === 0) {
        this.dom.modalSplitsContent.innerHTML = `
          <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">⏱️</div>
            <div>此活動未記錄每公里分段細節資料。</div>
            <div style="font-size: 0.8rem; margin-top: 0.35rem;">原始備註: ${act.notes || '無備註'}</div>
          </div>
        `;
      } else {
        // 1. 計算進階分段統計極值
        const fastest = splits.reduce((min, s) => (s.paceSec > 0 && (!min || s.paceSec < min.paceSec)) ? s : min, splits[0]);
        const slowest = splits.reduce((max, s) => (s.paceSec > 0 && (!max || s.paceSec > max.paceSec)) ? s : max, splits[0]);
        const validHrs = splits.filter(s => s.hr > 0);
        const avgHr = validHrs.length > 0 ? Math.round(validHrs.reduce((sum, s) => sum + s.hr, 0) / validHrs.length) : (act.hrAvg || '-');
        const maxHr = validHrs.length > 0 ? Math.max(...validHrs.map(s => s.hr)) : (act.hrMax || '-');

        // 2. 跑者配速策略判定 (負分段 Negative Split / 正分段 Positive Split / 均速 Even Split)
        let strategyTitle = '均速巡航 🎯';
        let strategyDesc = '前後半程配速均勻';
        if (splits.length >= 4) {
          const half = Math.floor(splits.length / 2);
          const firstHalf = splits.slice(0, half);
          const secondHalf = splits.slice(half);
          const p1 = firstHalf.reduce((sum, s) => sum + s.paceSec, 0) / firstHalf.length;
          const p2 = secondHalf.reduce((sum, s) => sum + s.paceSec, 0) / secondHalf.length;
          const deltaSec = Math.round(p2 - p1);
          if (deltaSec <= -4) {
            strategyTitle = '負分段 (Negative Split) 🚀';
            strategyDesc = `後半程每 km 加速 ${Math.abs(deltaSec)} 秒 (絕佳配速控管)`;
          } else if (deltaSec >= 4) {
            strategyTitle = '正分段 (Positive Split) ⚠️';
            strategyDesc = `後半程每 km 放慢 ${deltaSec} 秒 (體力衰退)`;
          } else {
            strategyTitle = '均速巡航 (Even Split) 🎯';
            strategyDesc = `前後半程配速差僅 ${Math.abs(deltaSec)} 秒 (高穩定度)`;
          }
        }

        // 3. 生成每公里分段卡片 (附帶與前一公里配速差 Delta)
        let cumulativeSeconds = 0;
        const splitsHtml = splits.map((s, idx) => {
          cumulativeSeconds += (s.paceSec || 0);
          const isHighHR = s.hr >= APP_CONFIG.ATHLETE.lthr;
          const pz = s.paceZone || { label: 'E 輕鬆配速', badgeClass: 'badge-easy' };
          
          let deltaHtml = '';
          if (idx > 0) {
            const prevSec = splits[idx - 1].paceSec;
            const diff = s.paceSec - prevSec;
            if (diff < 0) {
              deltaHtml = `<span class="pace-delta-faster">⚡ 快 ${Math.abs(diff)}s</span>`;
            } else if (diff > 0) {
              deltaHtml = `<span class="pace-delta-slower">🐢 慢 ${diff}s</span>`;
            } else {
              deltaHtml = `<span style="font-size:0.72rem;color:var(--text-muted);">&bull; 持平</span>`;
            }
          }

          const lapDisplay = s.label || `${s.lap}k`;
          const breakBadge = s.breakNote ? `<span class="badge" style="background:rgba(234,179,8,0.15);color:var(--accent-gold);border:1px solid rgba(234,179,8,0.3);font-size:0.65rem;padding:0.1rem 0.35rem;">⏸️ ${s.breakNote}</span>` : '';
          const cadenceText = s.cadence ? `<span style="font-size:0.7rem;color:var(--text-muted);">&bull; 步頻 ${s.cadence}</span>` : '';

          return `
            <div class="split-card">
              <div style="display: flex; align-items: center; gap: 0.85rem;">
                <span class="split-lap-num" style="font-size:${lapDisplay.length > 3 ? '0.95rem' : '1.1rem'};">${lapDisplay}</span>
                <div>
                  <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap:wrap;">
                    <span class="split-pace">${s.pace}</span>
                    <span class="badge ${pz.badgeClass}" style="font-size: 0.68rem; padding: 0.15rem 0.4rem;">${pz.label}</span>
                    ${breakBadge}
                  </div>
                  <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.15rem;">
                    <span style="font-size: 0.72rem; color: var(--text-muted);">${s.paceSec}s/km</span>
                    ${deltaHtml}
                    ${cadenceText}
                  </div>
                </div>
              </div>
              <div class="split-metrics">
                <span class="split-hr" style="color: ${isHighHR ? 'var(--accent-danger)' : 'var(--accent-orange)'};">
                  ${s.hr > 0 ? s.hr + ' bpm' : '-'}
                </span>
                <span style="font-size: 0.72rem; color: var(--text-muted);">
                  ${isHighHR ? '🔥 ≥ LTHR 門檻' : '有氧區間'}
                </span>
              </div>
            </div>
          `;
        }).join('');

        // 4. 生成分段資料表格 (Table View)
        let tableCumSec = 0;
        const tableRowsHtml = splits.map((s, idx) => {
          tableCumSec += (s.paceSec || 0);
          const isHighHR = s.hr >= APP_CONFIG.ATHLETE.lthr;
          const pz = s.paceZone || { label: 'E 輕鬆配速', badgeClass: 'badge-easy' };
          
          let deltaText = '-';
          if (idx > 0) {
            const diff = s.paceSec - splits[idx - 1].paceSec;
            deltaText = diff < 0 ? `▲ -${Math.abs(diff)}s (加速)` : diff > 0 ? `▼ +${diff}s (減速)` : '= 持平';
          }

          const breakBadge = s.breakNote ? `<span class="badge" style="background:rgba(234,179,8,0.15);color:var(--accent-gold);border:1px solid rgba(234,179,8,0.3);font-size:0.65rem;margin-left:0.35rem;">⏸️ ${s.breakNote}</span>` : '';

          return `
            <tr>
              <td><strong>第 ${s.lap} 組 (${s.label || s.lap + 'k'})</strong> ${breakBadge}</td>
              <td><code>${s.pace}/km</code></td>
              <td style="color:var(--text-muted);">${formatDuration(tableCumSec)}</td>
              <td><span style="color:${isHighHR ? 'var(--accent-danger)' : 'var(--accent-orange)'}; font-weight:700;">${s.hr > 0 ? s.hr + ' bpm' : '-'}</span></td>
              <td><span class="badge ${pz.badgeClass}" style="font-size:0.7rem;">${pz.label}</span></td>
              <td style="color:${deltaText.startsWith('▲') ? 'var(--accent-lime)' : deltaText.startsWith('▼') ? 'var(--accent-orange)' : 'var(--text-muted)'}; font-weight:600;">${deltaText}</td>
            </tr>
          `;
        }).join('');

        const isTimeRun = splits.some(s => s.isTimeBased);
        const fastestName = fastest.label || `${fastest.lap}k`;
        const slowestName = slowest.label || `${slowest.lap}k`;

        this.dom.modalSplitsContent.innerHTML = `
          <!-- 4 大分段極值與配速策略指標 (Task T-11) -->
          <div class="splits-kpi-grid">
            <div class="splits-kpi-item">
              <span class="splits-kpi-label">⚡ 最速分段 (${isTimeRun ? 'Best Interval' : 'Best Lap'})</span>
              <span class="splits-kpi-val" style="color:var(--accent-cyan);">${fastest.pace} <small style="font-size:0.75rem;color:var(--text-muted)">/km</small></span>
              <span class="splits-kpi-sub">第 ${fastest.lap}組 (${fastestName}) | ${fastest.paceZone.label}</span>
            </div>
            <div class="splits-kpi-item">
              <span class="splits-kpi-label">🐢 最慢分段 (${isTimeRun ? 'Slowest Interval' : 'Slowest Lap'})</span>
              <span class="splits-kpi-val" style="color:var(--accent-orange);">${slowest.pace} <small style="font-size:0.75rem;color:var(--text-muted)">/km</small></span>
              <span class="splits-kpi-sub">第 ${slowest.lap}組 (${slowestName}) | ${slowest.paceZone.label}</span>
            </div>
            <div class="splits-kpi-item">
              <span class="splits-kpi-label">❤️ 分段心率表現</span>
              <span class="splits-kpi-val" style="color:var(--accent-lime);">${avgHr} <small style="font-size:0.75rem;color:var(--text-muted)">bpm (均)</small></span>
              <span class="splits-kpi-sub">最高心率: ${maxHr} bpm ${maxHr >= APP_CONFIG.ATHLETE.lthr ? '🔥' : ''}</span>
            </div>
            <div class="splits-kpi-item">
              <span class="splits-kpi-label">🎯 配速控管策略</span>
              <span class="splits-kpi-val" style="font-size:1.05rem; color:var(--text-primary);">${strategyTitle}</span>
              <span class="splits-kpi-sub">${strategyDesc}</span>
            </div>
          </div>

          <!-- 每公里分段配速與心率雙軸折線圖畫布 (Task T-11 Chart.js) -->
          <div class="splits-chart-container">
            <canvas id="modalSplitsCanvas"></canvas>
          </div>

          <!-- 視圖切換列 -->
          <div class="splits-view-toggle">
            <div>
              <span style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">每公里分段明細</span>
              <span class="text-muted" style="font-size:0.78rem; margin-left:0.5rem;">(共記錄 ${splits.length} 個分段)</span>
            </div>
            <div class="pill-group">
              <button class="pill-btn active" id="btnSplitsCardsView">卡片視圖</button>
              <button class="pill-btn" id="btnSplitsTableView">表格明細</button>
            </div>
          </div>

          <!-- 分段卡片容器 -->
          <div class="splits-grid" id="modalSplitsCardsWrap">${splitsHtml}</div>

          <!-- 分段詳細表格容器 (預設隱藏) -->
          <div class="splits-table-wrapper" id="modalSplitsTableWrap" style="display:none;">
            <table class="splits-table">
              <thead>
                <tr>
                  <th>分段</th>
                  <th>公里配速</th>
                  <th>累計時間</th>
                  <th>平均心率</th>
                  <th>配速強度</th>
                  <th>配速差 (Delta)</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>
        `;

        // 繪製 Chart.js 每公里分段折線圖 (Task T-11)
        this.renderModalSplitsChart(splits);

        // 綁定卡片/表格切換事件
        const btnCards = document.getElementById('btnSplitsCardsView');
        const btnTable = document.getElementById('btnSplitsTableView');
        const wrapCards = document.getElementById('modalSplitsCardsWrap');
        const wrapTable = document.getElementById('modalSplitsTableWrap');

        if (btnCards && btnTable && wrapCards && wrapTable) {
          btnCards.addEventListener('click', () => {
            btnCards.classList.add('active');
            btnTable.classList.remove('active');
            wrapCards.style.display = 'grid';
            wrapTable.style.display = 'none';
          });
          btnTable.addEventListener('click', () => {
            btnTable.classList.add('active');
            btnCards.classList.remove('active');
            wrapCards.style.display = 'none';
            wrapTable.style.display = 'block';
          });
        }
      }
    }

    if (this.dom.lapSplitsModal) {
      this.dom.lapSplitsModal.classList.add('open');
    }
  }

  /**
   * 載入並同步資料 (強制最新到最舊倒序排列)
   */
  async loadApplicationData(forceRefresh = false) {
    this.renderLoadingState(true);
    this.updateStatusBadge(DataSourceStatus.LOADING);

    try {
      const result = await sheetsService.batchFetchAllTabs(forceRefresh);
      
      // 確保陣列由最新到最舊嚴格倒序排列 (Newest First)，並重新校驗分類
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach(l => {
          l.workoutType = classifyWorkoutType(l.activityName);
        });
        result.logs.sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));
      }

      this.data = result;
      this.updateStatusBadge(result.status, result.lastSync);
      this.renderCurrentView();

      if (result.status === DataSourceStatus.MOCK) {
        this.showAlert(
          '目前處於 <strong>Mock Data 模擬展示模式</strong>（已載入高擬真標準測試集）。',
          'warning'
        );
      } else if (result.status === DataSourceStatus.LIVE) {
        this.showAlert(
          `🎉 <strong>Google Sheets 資料同步成功</strong>！訓練日誌共載入 <strong>${result.logs.length}</strong> 筆活動 (已依最新日期向前排列)。`,
          'info'
        );
      } else {
        this.clearAlert();
      }
    } catch (err) {
      console.error('[App] 資料載入失敗:', err);
      this.updateStatusBadge(DataSourceStatus.ERROR);
      this.showAlert(`載入錯誤: ${err.message}`, 'danger');
    } finally {
      this.renderLoadingState(false);
    }
  }

  /**
   * 切換視圖
   */
  switchView(viewName) {
    if (this.currentView === viewName) return;
    this.currentView = viewName;

    this.dom.navButtons.forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (this.dom.sidebar) {
      this.dom.sidebar.classList.remove('open');
    }
    if (this.dom.sidebarBackdrop) {
      this.dom.sidebarBackdrop.classList.remove('active');
    }

    const titles = {
      'dashboard': '系統儀表板',
      'training-logs': '訓練日誌清單',
      'vdot-analysis': 'VDOT 跑力趨勢分析',
      'hr-zones': '心率區間對照與分析',
      'schedule': '課表執行與進度追蹤'
    };
    if (this.dom.pageTitle) {
      this.dom.pageTitle.textContent = titles[viewName] || '儀表板';
    }

    this.renderCurrentView();
  }

  renderCurrentView() {
    switch (this.currentView) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'training-logs':
        this.renderTrainingLogsView();
        break;
      case 'vdot-analysis':
        this.renderVdotAnalysisView();
        break;
      case 'hr-zones':
        this.renderZonesView();
        break;
      case 'schedule':
        this.renderScheduleView();
        break;
      default:
        this.renderDashboard();
    }
  }

  /**
   * 渲染儀表板首頁 (T-05 優化版：年度里程 + 倒序活動)
   */
  renderDashboard() {
    const logs = this.data.logs || [];

    // 強制最新分類與時間倒序排序 (由新到舊)
    logs.forEach(l => {
      l.workoutType = classifyWorkoutType(l.activityName);
    });
    logs.sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));

    // 需求 1：計算 2026 年度跑量 (YTD) 與 2025 去年全年跑量 (移除歷年累計)
    const currentYear = 2026;
    const lastYear = 2025;
    const logs2026 = logs.filter(l => (l.activityYear || getActivityYear(l.activityDate)) === currentYear);
    const logs2025 = logs.filter(l => (l.activityYear || getActivityYear(l.activityDate)) === lastYear);
    const year2026Km = logs2026.reduce((acc, cur) => acc + (cur.distanceKm || 0), 0);
    const year2025Km = logs2025.reduce((acc, cur) => acc + (cur.distanceKm || 0), 0);

    const avgCadence = logs.length > 0 
      ? Math.round(logs.reduce((acc, cur) => acc + (cur.cadenceAvg || 0), 0) / logs.length) 
      : 188;
    const avgHR = logs.length > 0 
      ? Math.round(logs.reduce((acc, cur) => acc + (cur.hrAvg || 0), 0) / logs.length) 
      : 145;

    // 智慧動態偵測：從 Google Sheets「課表」自動萃取即將到來的關鍵測驗/賽事里程碑
    const milestone = detectTargetMilestone(this.data.schedule || [], logs);

    // 計算 Task T-10: 週跑量聚合與 7 大訓練強度分佈
    const weeklyData = aggregateWeeklyVolume(logs, this.weeklyRange);
    const workoutTypeStats = calculateWorkoutTypeBreakdown(logs, 2026);

    const html = `
      <!-- Hero 決戰測驗倒數模組 (完全動態連動 Google Sheets 課表) -->
      <section class="hero-countdown-card">
        <div class="countdown-flex">
          <div class="countdown-info">
            <h2>
              <span>${milestone.targetName}</span>
            </h2>
            <p>
              基準成績：<strong>${APP_CONFIG.ATHLETE.zonesCriterion || '2026/03/14 5K (26:15, VDOT 36.0)'}</strong> &bull; 
              本週期目標：<strong style="color:var(--accent-cyan);">${milestone.notes}</strong>
            </p>
          </div>
          <div class="countdown-badge">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>${milestone.countdownBadgeText}</span>
          </div>
        </div>
      </section>

      <!-- 4 大 KPI 統計指標卡 (年度里程高光) -->
      <section class="grid-stats">
        <div class="stat-card">
          <div class="stat-label">當前跑力基準 (VDOT)</div>
          <div class="stat-value" style="color: var(--accent-cyan);">${APP_CONFIG.ATHLETE.baselineVDOT.toFixed(1)}</div>
          <div class="stat-sub">目標 5K 配速: 4:58/km</div>
        </div>

        <!-- 需求 1 優化：2026 年度跑量 (換成去年 2025 全年跑量對比，移除歷年累計) -->
        <div class="stat-card orange">
          <div class="stat-label">2026 年度跑量 (YTD)</div>
          <div class="stat-value" style="color: var(--accent-orange);">${year2026Km.toFixed(1)} <span style="font-size:1.1rem;color:var(--text-muted)">km</span></div>
          <div class="stat-sub">今年已完成 ${logs2026.length} 趟 (去年 2025: ${year2025Km.toFixed(1)} km)</div>
        </div>

        <div class="stat-card lime">
          <div class="stat-label">心率警戒監控 (LTHR)</div>
          <div class="stat-value" style="color: var(--accent-lime);">${APP_CONFIG.ATHLETE.lthr} <span style="font-size:1.1rem;color:var(--text-muted)">bpm</span></div>
          <div class="stat-sub">臨界心率 LTHR | Max: ${APP_CONFIG.ATHLETE.maxHR} bpm</div>
        </div>

        <div class="stat-card purple">
          <div class="stat-label">平均巡航步頻</div>
          <div class="stat-value" style="color: var(--accent-purple);">${avgCadence} <span style="font-size:1.1rem;color:var(--text-muted)">spm</span></div>
          <div class="stat-sub">全程平均心率約 ${avgHR} bpm</div>
        </div>
      </section>

      <!-- Task T-10: 週訓練量推移與 7 大訓練強度分類分佈 (Weekly Mileage & Volume) -->
      <section class="card weekly-volume-section">
        <div class="card-header">
          <div>
            <h2 class="card-title">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              週訓練量推移與強度分佈 (Task T-10)
            </h2>
            <small class="text-muted">自然週 (週一至週日) 連續時間軸聚合，支援 7 大強度堆疊柱狀圖與時數趨勢</small>
          </div>
          <div class="weekly-header-controls">
            <div class="pill-group" id="weeklyRangePillGroup">
              <button class="pill-btn ${this.weeklyRange === '8weeks' ? 'active' : ''}" data-range="8weeks">近 8 週</button>
              <button class="pill-btn ${this.weeklyRange === '12weeks' ? 'active' : ''}" data-range="12weeks">近 12 週</button>
              <button class="pill-btn ${this.weeklyRange === '2026' ? 'active' : ''}" data-range="2026">2026 全年</button>
              <button class="pill-btn ${this.weeklyRange === 'all' ? 'active' : ''}" data-range="all">全歷史</button>
            </div>
          </div>
        </div>

        <!-- 3 個動態體感指標 -->
        <div class="weekly-kpi-row">
          <div class="weekly-kpi-card">
            <span class="kpi-label">選定期間總跑量</span>
            <span class="kpi-value" style="color:var(--accent-cyan);">${weeklyData.summary.totalDistance} <small style="font-size:0.9rem;color:var(--text-muted)">km</small></span>
            <span class="kpi-sub">統計範圍涵蓋 ${weeklyData.summary.weeksCount} 週 | 總耗時 ${weeklyData.summary.totalHours} 小時</span>
          </div>
          <div class="weekly-kpi-card">
            <span class="kpi-label">平均週跑量</span>
            <span class="kpi-value" style="color:var(--accent-lime);">${weeklyData.summary.avgWeeklyDistance} <small style="font-size:0.9rem;color:var(--text-muted)">km/週</small></span>
            <span class="kpi-sub">單週最高巔峰: ${weeklyData.summary.maxWeeklyDistance} km</span>
          </div>
          <div class="weekly-kpi-card">
            <span class="kpi-label">80/20 訓練黃金法則</span>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.2rem;">
              <span class="badge-rule-8020">
                有氧底子 ${weeklyData.summary.aerobicPercent}% : 質量課 ${weeklyData.summary.qualityPercent}%
              </span>
            </div>
            <span class="kpi-sub">有氧 ${weeklyData.summary.aerobicKm} km | 質量 ${weeklyData.summary.qualityKm} km (T+I+R+賽事)</span>
          </div>
        </div>

        <!-- 週跑量 Chart.js 畫布 -->
        <div class="weekly-chart-canvas-container">
          <canvas id="dashWeeklyVolumeCanvas"></canvas>
        </div>

        <!-- 2026 年度 7 大訓練強度全局卡片網格 -->
        <div class="workout-types-summary-container">
          <div class="workout-types-title-row">
            <div>
              <strong style="color:var(--text-primary); font-size:0.95rem;">2026 年度 7 大訓練強度分佈</strong>
              <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.5rem;">(點擊卡片可前往日誌直接篩選)</span>
            </div>
            <span class="badge badge-easy">2026 全年累計 ${workoutTypeStats.totalDistance} km (${workoutTypeStats.totalHours}h)</span>
          </div>
          <div class="workout-types-grid">
            ${workoutTypeStats.breakdown.map(item => `
              <div class="type-summary-card" style="--type-color: ${item.color}" data-workout-type="${item.key}" title="${item.desc}">
                <div class="type-card-top">
                  <span class="badge ${item.badgeClass}">${item.label}</span>
                  <span style="font-size:0.75rem; font-weight:700; color:${item.color}">${item.percent}%</span>
                </div>
                <div class="type-card-stats">
                  <span class="type-card-km">${item.km} <small style="font-size:0.75rem;color:var(--text-muted)">km</small></span>
                  <span class="type-card-meta">${item.count} 趟 | 均速 ${item.avgPaceStr}</span>
                </div>
                <div class="type-card-bar-track">
                  <div class="type-card-bar-fill" style="width: ${item.percent}%;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- 圖表區塊佔位 (銜接 T-08 & T-09) -->
      <div class="grid-charts-2col">
        <section class="card">
          <div class="card-header">
            <h3 class="card-title">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              VDOT 跑力推移趨勢 (T-08)
            </h3>
            <button class="btn btn-ghost btn-sm" id="btnGoVdot">深度分析 &rarr;</button>
          </div>
          <div class="chart-container-dash">
            <canvas id="dashVdotCanvas"></canvas>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10h-10z"></path></svg>
                心率強度區間分佈 (2026 年度)
              </h3>
              <small class="text-muted">今年度已記錄 ${logs2026.length} 趟訓練之強度比例</small>
            </div>
            <button class="btn btn-ghost btn-sm" id="btnGoZones">深度分析 &rarr;</button>
          </div>
          <div class="chart-container-dash" style="padding: 0.4rem 0;">
            <div class="zone-dash-layout">
              <div style="position: relative; width: 130px; height: 130px; margin: 0 auto;">
                <canvas id="dashHrCanvas"></canvas>
              </div>
              <div class="zone-legend-list" id="dashHrLegend">
                <!-- 動態注入各區間佔比 -->
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 需求 2 優化：近期訓練紀錄由最後一筆 (最新) 往前排序 -->
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              近期訓練紀錄 (最新前 8 筆 / 由新到舊倒序)
            </h2>
            <small class="text-muted">已依照最新日期自動排序，顯示最近期的執行狀態</small>
          </div>
          <button class="btn btn-secondary btn-sm" id="btnGoLogs">查看完整日誌 (${logs.length} 筆) &rarr;</button>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>活動名稱</th>
                <th>強度類型</th>
                <th>距離 (km)</th>
                <th>平均配速</th>
                <th>總時間</th>
                <th>平均心率</th>
                <th>步頻</th>
                <th>每公里分段</th>
              </tr>
            </thead>
            <tbody>
              ${logs.slice(0, 8).map(item => {
                const wType = item.workoutType || 'EASY';
                const badgeClass = this._getBadgeClass(wType);
                const hasSplits = item.lapSplits && item.lapSplits.length > 0;
                return `
                  <tr>
                    <td><code>${formatDate(item.activityDate)}</code></td>
                    <td><strong>${item.activityName}</strong></td>
                    <td><span class="badge ${badgeClass}">${this._getWorkoutLabel(wType)}</span></td>
                    <td style="color: var(--accent-cyan); font-weight: 700;">${item.distanceKm ? item.distanceKm.toFixed(2) : '-'}</td>
                    <td><code>${item.paceAvg}</code></td>
                    <td>${item.durationTotal}</td>
                    <td><span style="color: ${item.hrAvg > 165 ? 'var(--accent-orange)' : 'var(--text-primary)'}; font-weight:600;">${item.hrAvg || '-'} bpm</span></td>
                    <td>${item.cadenceAvg || '-'} spm</td>
                    <td>
                      <button class="btn btn-outline btn-sm btn-view-splits" data-id="${item.activityId}">
                        ${hasSplits ? (item.lapSplits.some(s => s.isTimeBased) ? `⏱️ ${item.lapSplits.length}組 間歇` : `🔍 ${item.lapSplits.length}k 分段`) : '無分段'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    this.dom.pageContent.innerHTML = html;

    // 繪製 Task T-10: 週訓練量推移堆疊柱狀圖與時數線
    this.renderDashWeeklyChart(weeklyData);

    // 繪製首頁 VDOT 跑力趨勢圖 (T-08)
    const vdotMilestones = extractVDOTMilestones(logs);
    this.renderDashVdotChart(vdotMilestones);

    // 繪製首頁 心率強度區間環形圖 (鎖定 2026 當年度累計)
    const hrStats2026 = calculateHeartRateDistribution(logs2026.length > 0 ? logs2026 : logs);
    this.renderDashHrChart(hrStats2026);

    // 綁定週量期間切換按鈕 (Task T-10)
    document.querySelectorAll('#weeklyRangePillGroup .pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newRange = e.currentTarget.getAttribute('data-range');
        if (newRange && newRange !== this.weeklyRange) {
          this.weeklyRange = newRange;
          this.renderDashboard();
        }
      });
    });

    // 綁定 7 大訓練強度卡片點擊過濾 (Task T-10 -> T-06)
    document.querySelectorAll('.type-summary-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const type = e.currentTarget.getAttribute('data-workout-type');
        if (type) {
          this.activeLogFilter = type;
          this.switchView('training-logs');
        }
      });
    });

    document.getElementById('btnGoLogs')?.addEventListener('click', () => this.switchView('training-logs'));
    document.getElementById('btnGoVdot')?.addEventListener('click', () => this.switchView('vdot-analysis'));
    document.getElementById('btnGoZones')?.addEventListener('click', () => this.switchView('hr-zones'));

    document.querySelectorAll('.btn-view-splits').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.openLapSplitsModal(id);
      });
    });
  }

  /**
   * 渲染訓練日誌清單頁 (需求 2 & 3：倒序排 + 完整 7 大標籤過濾)
   */
  renderTrainingLogsView() {
    const logs = this.data.logs || [];

    // 強制最新分類與時間倒序排序 (由新到舊)
    logs.forEach(l => {
      l.workoutType = classifyWorkoutType(l.activityName);
    });
    logs.sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));

    const filterType = this.activeLogFilter;
    const query = this.searchQuery.toLowerCase().trim();

    // 依類別與搜尋字串過濾
    const filteredLogs = logs.filter(log => {
      const matchType = filterType === 'ALL' || log.workoutType === filterType;
      const matchQuery = !query || 
        log.activityName.toLowerCase().includes(query) ||
        (log.notes && log.notes.toLowerCase().includes(query)) ||
        formatDate(log.activityDate).includes(query);
      return matchType && matchQuery;
    });

    // 統計各類別數量
    const counts = {
      ALL: logs.length,
      EASY: logs.filter(l => l.workoutType === 'EASY').length,
      MARATHON: logs.filter(l => l.workoutType === 'MARATHON').length,
      THRESHOLD: logs.filter(l => l.workoutType === 'THRESHOLD').length,
      INTERVAL: logs.filter(l => l.workoutType === 'INTERVAL').length,
      REPETITION: logs.filter(l => l.workoutType === 'REPETITION').length,
      RACE: logs.filter(l => l.workoutType === 'RACE').length,
      TEST: logs.filter(l => l.workoutType === 'TEST').length
    };

    this.dom.pageContent.innerHTML = `
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Garmin 訓練日誌總表 (${filteredLogs.length} / ${logs.length} 筆)</h2>
            <small class="text-muted">已依最新日期向前倒序排列，支援 Jack Daniels 完整 7 大強度篩選</small>
          </div>
          <div class="search-input-wrapper" style="max-width: 280px; width: 100%;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="logSearchInput" class="form-control" placeholder="搜尋日誌名稱、日期或備註..." value="${this.searchQuery}">
          </div>
        </div>

        <!-- 需求 3：擴充 Jack Daniels 7 大分類 Pills -->
        <div class="filter-pill-bar">
          <button class="filter-pill ${filterType === 'ALL' ? 'active' : ''}" data-type="ALL">全部 (${counts.ALL})</button>
          <button class="filter-pill ${filterType === 'EASY' ? 'active' : ''}" data-type="EASY">E 輕鬆跑 (${counts.EASY})</button>
          <button class="filter-pill ${filterType === 'MARATHON' ? 'active' : ''}" data-type="MARATHON">M 馬拉松 (${counts.MARATHON})</button>
          <button class="filter-pill ${filterType === 'THRESHOLD' ? 'active' : ''}" data-type="THRESHOLD">T 門檻跑 (${counts.THRESHOLD})</button>
          <button class="filter-pill ${filterType === 'INTERVAL' ? 'active' : ''}" data-type="INTERVAL">I 最大攝氧 (${counts.INTERVAL})</button>
          <button class="filter-pill ${filterType === 'REPETITION' ? 'active' : ''}" data-type="REPETITION">R 速度跑 (${counts.REPETITION})</button>
          <button class="filter-pill ${filterType === 'RACE' ? 'active' : ''}" data-type="RACE">比賽賽事 (${counts.RACE})</button>
          <button class="filter-pill ${filterType === 'TEST' ? 'active' : ''}" data-type="TEST">跑力測驗 (${counts.TEST})</button>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>活動 ID</th>
                <th>日期 (新 ➔ 舊)</th>
                <th>活動名稱</th>
                <th>強度類型</th>
                <th>距離 (km)</th>
                <th>平均配速</th>
                <th>總時間</th>
                <th>平均心率</th>
                <th>步頻</th>
                <th>每公里分段</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs.map(log => {
                const wType = log.workoutType || 'EASY';
                const badgeClass = this._getBadgeClass(wType);
                const splitsCount = log.lapSplits ? log.lapSplits.length : 0;
                return `
                  <tr>
                    <td><small class="text-muted">${log.activityId}</small></td>
                    <td><code>${formatDate(log.activityDate)}</code></td>
                    <td><strong>${log.activityName}</strong></td>
                    <td><span class="badge ${badgeClass}">${this._getWorkoutLabel(wType)}</span></td>
                    <td style="color: var(--accent-cyan); font-weight: 700;">${log.distanceKm ? log.distanceKm.toFixed(2) : '-'}</td>
                    <td><code>${log.paceAvg}</code></td>
                    <td>${log.durationTotal}</td>
                    <td>${log.hrAvg || '-'} bpm</td>
                    <td>${log.cadenceAvg || '-'} spm</td>
                    <td>
                      <button class="btn btn-outline btn-sm btn-view-splits" data-id="${log.activityId}">
                        ${splitsCount > 0 ? (log.lapSplits.some(s => s.isTimeBased) ? `⏱️ ${splitsCount}組 間歇` : `🔍 ${splitsCount}k 分段`) : '無分段'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeLogFilter = e.currentTarget.getAttribute('data-type');
        this.renderTrainingLogsView();
      });
    });

    const searchInput = document.getElementById('logSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderTrainingLogsView();
        const inp = document.getElementById('logSearchInput');
        if (inp) {
          inp.focus();
          inp.setSelectionRange(inp.value.length, inp.value.length);
        }
      });
    }

    document.querySelectorAll('.btn-view-splits').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.openLapSplitsModal(id);
      });
    });
  }

  _getBadgeClass(wType) {
    switch (wType) {
      case 'EASY': return 'badge-easy';
      case 'MARATHON': return 'badge-marathon';
      case 'THRESHOLD': return 'badge-threshold';
      case 'INTERVAL': return 'badge-interval';
      case 'REPETITION': return 'badge-repetition';
      case 'RACE': return 'badge-race';
      case 'TEST': return 'badge-test';
      default: return 'badge-general';
    }
  }

  _getWorkoutLabel(wType) {
    switch (wType) {
      case 'EASY': return 'E 輕鬆跑';
      case 'MARATHON': return 'M 馬拉松';
      case 'THRESHOLD': return 'T 門檻跑';
      case 'INTERVAL': return 'I 攝氧間歇';
      case 'REPETITION': return 'R 速度跑';
      case 'RACE': return 'RACE 比賽';
      case 'TEST': return 'TEST 測驗';
      default: return wType;
    }
  }

  /**
   * 渲染訓練區間深度分析頁 (Task T-09: 支援 2026 年度累計與上個月 vs 這個月對比)
   */
  renderZonesView() {
    const zones = this.data.zones || [];
    const logs = this.data.logs || [];

    // 1. 2026 當年度整體數據
    const logs2026 = logs.filter(l => (l.activityYear || getActivityYear(l.activityDate)) === 2026);
    const hrStatsYear = calculateHeartRateDistribution(logs2026.length > 0 ? logs2026 : logs);

    // 2. 萃取最新兩月份資料 (例如上個月 2026-09 與這個月 2026-10)
    const { currentMonth, previousMonth } = getLatestTwoMonths(logs);
    const logsCurr = filterActivitiesByPeriod(logs, currentMonth);
    const logsPrev = filterActivitiesByPeriod(logs, previousMonth);
    const hrStatsCurr = calculateHeartRateDistribution(logsCurr);
    const hrStatsPrev = calculateHeartRateDistribution(logsPrev);

    this.dom.pageContent.innerHTML = `
      <!-- 4 大心率指標卡 (2026 年度體能基底) -->
      <section class="grid-stats">
        <div class="stat-card">
          <div class="stat-label">乳酸門檻心率 (LTHR)</div>
          <div class="stat-value" style="color: var(--accent-cyan);">${APP_CONFIG.ATHLETE.lthr} <small style="font-size:1.1rem;color:var(--text-muted)">bpm</small></div>
          <div class="stat-sub">臨界強度基準線 (Zone 4 上限)</div>
        </div>

        <div class="stat-card lime">
          <div class="stat-label">2026 有氧基底 (Z1 + Z2)</div>
          <div class="stat-value" style="color: var(--accent-lime);">${hrStatsYear.aerobicBasePercent}%</div>
          <div class="stat-sub">${hrStatsYear.isPolarized ? '✅ 符合 80/20 金字塔黃金法則' : '需適度增加輕鬆有氧跑量'}</div>
        </div>

        <div class="stat-card orange">
          <div class="stat-label">高強度刺激 (Z4 + Z5)</div>
          <div class="stat-value" style="color: var(--accent-orange);">${hrStatsYear.highIntensityPercent}%</div>
          <div class="stat-sub">門檻與最大攝氧衝刺負荷</div>
        </div>

        <div class="stat-card purple">
          <div class="stat-label">2026 年度已分析跑量</div>
          <div class="stat-value" style="color: var(--accent-purple);">${hrStatsYear.totalAnalyzedKm} <small style="font-size:1.1rem;color:var(--text-muted)">km</small></div>
          <div class="stat-sub">涵蓋 2026 全年 ${logs2026.length} 次活動紀錄</div>
        </div>
      </section>

      <!-- ★ 需求亮點：上個月 vs 這個月 心率區間圓餅圖對比 ★ -->
      <section class="card" style="margin-bottom: 1.75rem;">
        <div class="card-header">
          <div>
            <h3 class="card-title">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10h-10z"></path></svg>
              月度心率強度對比：${previousMonth} (上個月) vs ${currentMonth} (這個月)
            </h3>
            <small class="text-muted">比較最近兩個月份的強度移轉，掌握備賽期基礎打底與衝刺調整成效</small>
          </div>
          <div class="month-compare-badge">
            <span>📅 月度週期追蹤</span>
          </div>
        </div>

        <div class="grid-charts-2col" style="margin-top: 1rem;">
          <!-- 上個月圓餅圖卡片 -->
          <div style="background: rgba(10, 14, 23, 0.45); border-radius: var(--radius-sm); padding: 1.25rem; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--accent-cyan); display: flex; align-items: center; gap: 0.4rem;">
                <span>⏮️ 上個月 (${previousMonth})</span>
              </h4>
              <span class="badge badge-easy">共 ${hrStatsPrev.activityCount} 趟 / ${hrStatsPrev.totalAnalyzedKm} km</span>
            </div>
            <div style="height: 220px; position: relative;">
              <canvas id="zonesPrevMonthCanvas"></canvas>
            </div>
            <div style="margin-top: 0.75rem; text-align: center; font-size: 0.82rem; color: var(--text-secondary);">
              Z1+Z2 低強度有氧打底：<strong style="color: var(--accent-lime);">${hrStatsPrev.aerobicBasePercent}%</strong>
            </div>
          </div>

          <!-- 這個月圓餅圖卡片 -->
          <div style="background: rgba(10, 14, 23, 0.45); border-radius: var(--radius-sm); padding: 1.25rem; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--accent-orange); display: flex; align-items: center; gap: 0.4rem;">
                <span>▶️ 這個月 (${currentMonth})</span>
              </h4>
              <span class="badge badge-threshold">共 ${hrStatsCurr.activityCount} 趟 / ${hrStatsCurr.totalAnalyzedKm} km</span>
            </div>
            <div style="height: 220px; position: relative;">
              <canvas id="zonesCurrMonthCanvas"></canvas>
            </div>
            <div style="margin-top: 0.75rem; text-align: center; font-size: 0.82rem; color: var(--text-secondary);">
              Z1+Z2 低強度有氧打底：<strong style="color: var(--accent-lime);">${hrStatsCurr.aerobicBasePercent}%</strong>
            </div>
          </div>
        </div>

        <!-- 訓練教練月度動態洞察 -->
        <div class="month-insight-box">
          💡 <strong>月度心率轉移洞察：</strong>
          <strong>${currentMonth} (本月)</strong> 目前已完成 <strong>${hrStatsCurr.activityCount}</strong> 趟訓練（累積 <strong>${hrStatsCurr.totalAnalyzedKm} km</strong>），
          低強度有氧（Zone 1 恢復 + Zone 2 輕鬆）佔比高達 <strong style="color:var(--accent-lime);">${hrStatsCurr.aerobicBasePercent}%</strong>；
          對照 <strong>${previousMonth} (上月)</strong> 累積 <strong>${hrStatsPrev.totalAnalyzedKm} km</strong>（有氧佔比 <strong style="color:var(--accent-lime);">${hrStatsPrev.aerobicBasePercent}%</strong>），
          本月心率負荷控制得宜，微血管與粒線體修復效果良好，為 <strong>10/24 VDOT 決戰測驗</strong> 奠定良好神經與體能儲備！
        </div>
      </section>

      <!-- 2026 全年累積跑量長條圖 -->
      <section class="card" style="margin-bottom: 1.75rem;">
        <div class="card-header">
          <div>
            <h3 class="card-title">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              2026 年度各心率區間累積跑量分佈 (公里)
            </h3>
            <small class="text-muted">依 2026 年度 106 趟活動統計各強度區間所累積之總里程</small>
          </div>
          <span class="badge badge-threshold">2026 全年分佈</span>
        </div>
        <div class="chart-container-box">
          <canvas id="zonesBarCanvas"></canvas>
        </div>
      </section>

      <!-- 跑者心率與配速訓練區間對照標準表 -->
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">跑者心率與配速訓練區間對照表 (基準: VDOT 36, LTHR: 172 bpm)</h2>
            <small class="text-muted">依據試算表頁籤 2（訓練區間 gid=1124408140）建立，對標個人 2026 即時訓練成效</small>
          </div>
          <span class="badge badge-test">VDOT 36.0 Standard</span>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Zone 區間</th>
                <th>訓練強度</th>
                <th>建議配速</th>
                <th>心率目標 (bpm)</th>
                <th>% LTHR</th>
                <th>2026 實際累積里程</th>
                <th>核心目的</th>
              </tr>
            </thead>
            <tbody>
              ${zones.map(z => {
                const zoneKey = z.zone.toLowerCase().replace(' ', '-');
                const matchedStat = hrStatsYear.breakdown.find(b => z.zone.includes(b.key.replace('zone', 'Zone ')));
                const kmDisplay = matchedStat ? `${matchedStat.km} km (${matchedStat.percent}%)` : '-';
                return `
                  <tr>
                    <td><span class="zone-pill ${zoneKey}">${z.zone}</span></td>
                    <td><strong>${z.name}</strong></td>
                    <td><code style="color: var(--accent-cyan); font-weight:700;">${z.paceGuide}</code></td>
                    <td><strong style="color: var(--accent-orange);">${z.hrTarget}</strong></td>
                    <td>${z.pctLTHR}</td>
                    <td style="color: var(--accent-lime); font-weight: 700;">${kmDisplay}</td>
                    <td>${z.purpose}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    // 繪製心率專頁圖表 (月度雙圓餅圖 + 全年長條圖)
    this.renderFullZonesCharts(hrStatsYear, hrStatsPrev, hrStatsCurr);
  }

  /**
   * 渲染課表追蹤頁 (Task T-12 課表計畫 vs 實際深度比對與月份過濾)
   */
  renderScheduleView() {
    const rawSchedule = this.data.schedule || [];
    const logs = this.data.logs || [];
    const refDate = new Date('2026-10-14T00:00:00');

    // 1. 依據使用者選擇的時間窗口過濾 (預設：本月與下月)
    const filteredSchedule = filterScheduleByScope(rawSchedule, this.scheduleScope, refDate);

    // 2. 對每一筆課表項目執行「計畫 vs 實際」動態對齊與狀態判定
    const evaluatedItems = filteredSchedule.map(s => evaluateScheduleItem(s, logs, refDate));

    // 3. 彙總目前可見範圍的宏觀執行成效 KPI
    const summary = calculateScheduleSummary(evaluatedItems);

    // 4. 計算倒數決戰天數
    const targetDate = new Date('2026-10-24T00:00:00');
    const diffDays = Math.max(0, Math.ceil((targetDate - refDate) / (1000 * 60 * 60 * 24)));

    // 範圍標籤文字
    const scopeLabels = {
      'current_and_next': '🌟 本月與下月 (10月 ~ 11月)',
      'current_month': '📅 2026 年 10 月 (決戰月)',
      'next_month': '📅 2026 年 11 月 (修復月)',
      'all': '📜 全週期 (W1 ~ W7 全部)'
    };

    this.dom.pageContent.innerHTML = `
      <!-- 4 大課表執行成效 KPI 指標卡 (Task T-12) -->
      <section class="schedule-kpi-grid">
        <div class="schedule-kpi-card">
          <span class="kpi-label">總跑量達成率</span>
          <div class="kpi-val" style="color: ${summary.overallRatio >= 90 ? 'var(--accent-lime)' : summary.overallRatio >= 70 ? 'var(--accent-orange)' : 'var(--accent-danger)'};">
            ${summary.overallRatio}%
          </div>
          <span class="kpi-sub">實際跑量 ${summary.totalActualKm} km / 計畫 ${summary.totalTargetKm} km</span>
        </div>

        <div class="schedule-kpi-card">
          <span class="kpi-label">課表執行堂數比</span>
          <div class="kpi-val" style="color: var(--accent-cyan);">
            ${summary.completedWorkouts} <small style="font-size:1.05rem;color:var(--text-muted)">/ ${summary.totalWorkouts} 堂</small>
          </div>
          <span class="kpi-sub">已跑 ${summary.completedWorkouts} 堂 | 缺席 ${summary.missedWorkouts} 堂 | 待執行 ${summary.upcomingWorkouts} 堂</span>
        </div>

        <div class="schedule-kpi-card">
          <span class="kpi-label">質量課 (Q/LSD) 落實度</span>
          <div class="kpi-val" style="color: var(--accent-purple);">
            ${summary.qualityComplianceRatio}%
          </div>
          <span class="kpi-sub">門檻跑與長距離已落實 ${summary.qualityWorkoutsActual} / ${summary.qualityWorkoutsTarget} 堂</span>
        </div>

        <div class="schedule-kpi-card">
          <span class="kpi-label">決戰測驗倒數</span>
          <div class="kpi-val" style="color: var(--accent-orange);">
            ${diffDays} <small style="font-size:1.05rem;color:var(--text-muted)">天</small>
          </div>
          <span class="kpi-sub">2026/10/24 5K 測驗日 (目標 VDOT 38+)</span>
        </div>
      </section>

      <!-- 課表主卡片 -->
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">倒數週課表「計畫 vs 實際」對比 (Task T-12)</h2>
            <small class="text-muted">當前範圍：${scopeLabels[this.scheduleScope]} (共 ${evaluatedItems.length} 堂課表)</small>
          </div>

          <!-- 月份時間窗口切換膠囊按鈕 (需求 1) -->
          <div class="pill-group" id="scheduleScopePillGroup">
            <button class="pill-btn ${this.scheduleScope === 'current_and_next' ? 'active' : ''}" data-scope="current_and_next">🌟 本月與下月</button>
            <button class="pill-btn ${this.scheduleScope === 'current_month' ? 'active' : ''}" data-scope="current_month">10 月份</button>
            <button class="pill-btn ${this.scheduleScope === 'next_month' ? 'active' : ''}" data-scope="next_month">11 月份</button>
            <button class="pill-btn ${this.scheduleScope === 'all' ? 'active' : ''}" data-scope="all">全週期 (W1~W7)</button>
          </div>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th style="min-width:70px;">週次</th>
                <th style="min-width:110px;">預定日期</th>
                <th style="min-width:160px;">課表名稱</th>
                <th style="min-width:80px;">強度</th>
                <th style="min-width:85px;">計畫目標</th>
                <th style="min-width:160px;">實際執行 (ACT)</th>
                <th style="min-width:115px;">執行狀態</th>
                <th style="min-width:150px;">實跑日誌對標</th>
                <th>備註與執行重點</th>
              </tr>
            </thead>
            <tbody>
              ${evaluatedItems.length === 0 ? `
                <tr>
                  <td colspan="9" style="text-align:center; padding: 2.5rem 1rem; color:var(--text-muted);">
                    此時間範圍內無安排訓練課表。
                  </td>
                </tr>
              ` : evaluatedItems.map(item => {
                const ratio = item.completionRatio;
                const statusInfo = item.status;
                const fillWidth = Math.min(100, ratio);
                const tagClass = item.tags === 'Q' ? 'badge-threshold' : item.tags === 'L' ? 'badge-marathon' : 'badge-easy';
                const tagLabel = item.tags === 'Q' ? 'Q 門檻質量' : item.tags === 'L' ? 'L 長距離' : 'E 輕鬆有氧';

                let deltaTag = '';
                if (item.status.key === 'MISSED') {
                  deltaTag = `<span class="schedule-delta-tag delta-zero">未執行 (-${item.targetKm}k)</span>`;
                } else if (item.status.key === 'UPCOMING') {
                  deltaTag = `<span class="schedule-delta-tag delta-zero">待執行</span>`;
                } else if (item.deltaKm >= 0) {
                  deltaTag = `<span class="schedule-delta-tag ${ratio > 115 ? 'delta-over' : 'delta-matched'}">+${item.deltaKm} km (${ratio}%)</span>`;
                } else {
                  deltaTag = `<span class="schedule-delta-tag delta-under">${item.deltaKm} km (${ratio}%)</span>`;
                }

                // 實跑日誌按鈕
                let matchedLogCell = '<span style="color:var(--text-muted); font-size:0.75rem;">-</span>';
                if (item.matchedLog) {
                  matchedLogCell = `
                    <button class="schedule-log-chip btn-schedule-splits" data-id="${item.matchedLog.activityId}" title="點擊檢視實跑分段折線圖">
                      <span>⚡ ${item.matchedLog.distanceKm}k</span>
                      <small style="opacity:0.8;">(${item.matchedLog.paceAvg})</small>
                    </button>
                  `;
                }

                return `
                  <tr style="${item.status.key === 'MISSED' ? 'opacity: 0.65;' : ''}">
                    <td><strong>${item.week}</strong></td>
                    <td>
                      <code>${item.date}</code>
                      <div style="font-size:0.72rem; color:var(--text-muted);">${item.day}</div>
                    </td>
                    <td><strong>${item.name}</strong></td>
                    <td><span class="badge ${tagClass}" style="font-size:0.7rem;">${tagLabel}</span></td>
                    <td style="font-weight:700; color:var(--text-primary);">${item.targetKm} km</td>
                    <td>
                      <!-- 微型進度條與差值對照 (需求 2) -->
                      <div class="schedule-compare-cell">
                        <div class="schedule-numbers-row">
                          <strong style="color: ${item.actualKm > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)'};">${item.actualKm > 0 ? item.actualKm + ' km' : '-'}</strong>
                          ${deltaTag}
                        </div>
                        <div class="schedule-progress-track">
                          <div class="schedule-progress-fill" style="width: ${fillWidth}%; background: ${statusInfo.color};"></div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="badge ${statusInfo.badgeClass}" style="font-size:0.72rem; padding: 0.2rem 0.5rem;" title="${statusInfo.desc}">
                        ${statusInfo.label}
                      </span>
                    </td>
                    <td>${matchedLogCell}</td>
                    <td style="font-size:0.82rem; color:var(--text-secondary);">${item.notes || '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    // 綁定月份過濾膠囊按鈕 (需求 1)
    document.querySelectorAll('#scheduleScopePillGroup .pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newScope = e.currentTarget.getAttribute('data-scope');
        if (newScope && newScope !== this.scheduleScope) {
          this.scheduleScope = newScope;
          this.renderScheduleView();
        }
      });
    });

    // 綁定點擊實跑活動直接開啟 T-11 折線圖彈窗
    document.querySelectorAll('.btn-schedule-splits').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.openLapSplitsModal(id);
      });
    });
  }

  /**
   * 渲染 VDOT 跑力深度分析頁面 (Task T-07 & T-08)
   */
  renderVdotAnalysisView() {
    const logs = this.data.logs || [];
    const milestones = extractVDOTMilestones(logs);

    // 最新測驗/賽事之 VDOT
    const latestEvent = milestones.length > 0 ? milestones[milestones.length - 1] : null;
    const currentVDOT = latestEvent ? latestEvent.vdot : APP_CONFIG.ATHLETE.baselineVDOT;

    // 歷史最高 VDOT
    const peakVDOT = milestones.reduce((max, m) => Math.max(max, m.vdot), currentVDOT);
    const peakEvent = milestones.find(m => m.vdot === peakVDOT) || latestEvent;

    // 依據目前 VDOT 計算 Jack Daniels 預估成績與訓練配速
    const predictions = getVDOTPredictions(currentVDOT);

    const html = `
      <!-- VDOT 概況指標卡 -->
      <section class="grid-stats">
        <div class="stat-card">
          <div class="stat-label">最新跑力基準 (Latest VDOT)</div>
          <div class="stat-value" style="color: var(--accent-cyan);">${currentVDOT.toFixed(1)}</div>
          <div class="stat-sub">${latestEvent ? `${latestEvent.date} ${latestEvent.activityName}` : '基準測驗'}</div>
        </div>

        <div class="stat-card lime">
          <div class="stat-label">歷史巔峰跑力 (Peak VDOT)</div>
          <div class="stat-value" style="color: var(--accent-lime);">${peakVDOT.toFixed(1)}</div>
          <div class="stat-sub">${peakEvent ? `${peakEvent.date} ${peakEvent.activityName} (${peakEvent.finishTimeStr})` : '-'}</div>
        </div>

        <div class="stat-card orange">
          <div class="stat-label">秋季決戰目標 (Target VDOT)</div>
          <div class="stat-value" style="color: var(--accent-orange);">38.0+</div>
          <div class="stat-sub">目標: 2026/10/24 5K 測驗破 24:50</div>
        </div>

        <div class="stat-card purple">
          <div class="stat-label">跑力有效賽事紀錄</div>
          <div class="stat-value" style="color: var(--accent-purple);">${milestones.length} <small style="font-size:1rem;color:var(--text-muted)">場</small></div>
          <div class="stat-sub">涵蓋 2020~2026 馬拉松與測驗</div>
        </div>
      </section>

      <!-- VDOT 歷史推移折線圖 (Chart.js T-08) -->
      <section class="card" style="margin-bottom: 1.75rem;">
        <div class="card-header">
          <div>
            <h2 class="card-title">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              VDOT 跑力歷史推移趨勢 (2020 ~ 2026)
            </h2>
            <small class="text-muted">自動自所有 RACE (比賽) 與 TEST (測驗) 依 Jack Daniels 公式即時運算</small>
          </div>
          <div class="status-chip" style="background: rgba(0,242,254,0.1); border-color: rgba(0,242,254,0.3);">
            <span class="status-dot status-live"></span>
            <span>Jack Daniels Formula</span>
          </div>
        </div>

        <div class="chart-container-box">
          <canvas id="vdotTrendCanvas"></canvas>
        </div>
      </section>

      <!-- Jack Daniels 預估完賽時間卡片 (4 大賽事) -->
      <section class="card" style="margin-bottom: 1.75rem;">
        <div class="card-header">
          <div>
            <h2 class="card-title">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              基於當前 VDOT ${currentVDOT.toFixed(1)} 之標準賽事實力推估
            </h2>
            <small class="text-muted">由 Jack Daniels 配速回歸模型反推完賽時間與巡航均速</small>
          </div>
        </div>

        <div class="prediction-grid">
          ${predictions.racePredictions.map(p => `
            <div class="prediction-card">
              <div class="prediction-event">${p.event}</div>
              <div class="prediction-time">${p.finishTime}</div>
              <div class="prediction-pace">預估均速：${p.avgPace}</div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Jack Daniels 5 大強度建議配速表 -->
      <section class="card" style="margin-bottom: 1.75rem;">
        <div class="card-header">
          <h2 class="card-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            當前 VDOT ${currentVDOT.toFixed(1)} 建議訓練區間配速表
          </h2>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>強度區間</th>
                <th>建議配速 (min/km)</th>
                <th>核心訓練生理目的</th>
              </tr>
            </thead>
            <tbody>
              ${predictions.trainingPaces.map(tp => `
                <tr>
                  <td><strong>${tp.zone}</strong></td>
                  <td><code style="color: var(--accent-cyan); font-weight:700; font-size:1rem;">${tp.paceStr}</code></td>
                  <td>${tp.purpose}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- 跑力歷史里程碑明細表 -->
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            VDOT 跑力里程碑明細表 (${milestones.length} 場)
          </h2>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>賽事/測驗名稱</th>
                <th>類型</th>
                <th>距離 (km)</th>
                <th>完賽時間</th>
                <th>計算 VDOT</th>
                <th>等級評價</th>
              </tr>
            </thead>
            <tbody>
              ${milestones.slice().reverse().map(m => {
                const badge = m.workoutType === 'TEST' ? 'badge-test' : 'badge-race';
                return `
                  <tr>
                    <td><code>${m.date}</code></td>
                    <td><strong>${m.activityName}</strong></td>
                    <td><span class="badge ${badge}">${m.workoutType}</span></td>
                    <td style="color: var(--accent-cyan); font-weight:700;">${m.distanceKm.toFixed(2)} km</td>
                    <td><code>${m.finishTimeStr}</code></td>
                    <td><strong style="color: var(--accent-orange); font-size:1.1rem;">${m.vdot.toFixed(1)}</strong></td>
                    <td>${m.vdot >= 39 ? '🔥 菁英高點' : m.vdot >= 36 ? '⭐ 目前水準' : '🌱 成長積累'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    this.dom.pageContent.innerHTML = html;

    // 渲染 Chart.js 歷史趨勢圖
    this.renderFullVdotChart(milestones);
  }

  /**
   * 繪製完整 VDOT 折線趨勢圖 (Chart.js T-08)
   */
  renderFullVdotChart(milestones = []) {
    const canvas = document.getElementById('vdotTrendCanvas');
    if (!canvas || !window.Chart) return;

    if (this.fullVdotChartInstance) {
      this.fullVdotChartInstance.destroy();
      this.fullVdotChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    const labels = milestones.map(m => `${m.date.slice(5)} (${m.activityName.slice(0, 6)})`);
    const dataValues = milestones.map(m => m.vdot);

    this.fullVdotChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'VDOT 跑力值',
          data: dataValues,
          borderColor: '#00F2FE',
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return null;
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(0, 242, 254, 0.35)');
            gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
            return gradient;
          },
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointBackgroundColor: '#0A0E17',
          pointBorderColor: '#00F2FE',
          pointBorderWidth: 2.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(16, 22, 36, 0.95)',
            titleColor: '#00F2FE',
            bodyColor: '#F1F5F9',
            borderColor: 'rgba(0, 242, 254, 0.3)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const m = milestones[idx];
                return `${m.date} - ${m.activityName}`;
              },
              label: (context) => {
                const m = milestones[context.dataIndex];
                return [
                  `VDOT 跑力: ${m.vdot.toFixed(1)}`,
                  `距離: ${m.distanceKm} km`,
                  `完賽時間: ${m.finishTimeStr}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94A3B8', font: { family: 'Inter', size: 11 } }
          },
          y: {
            min: 24,
            max: 42,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: {
              color: '#94A3B8',
              stepSize: 4,
              font: { family: 'JetBrains Mono', size: 11 }
            }
          }
        }
      }
    });
  }

  /**
   * 繪製儀表板首頁迷你 VDOT 折線圖
   */
  renderDashVdotChart(milestones = []) {
    const canvas = document.getElementById('dashVdotCanvas');
    if (!canvas || !window.Chart) return;

    if (this.dashVdotChartInstance) {
      this.dashVdotChartInstance.destroy();
      this.dashVdotChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    const labels = milestones.map(m => m.date.slice(2, 7));
    const dataValues = milestones.map(m => m.vdot);

    this.dashVdotChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'VDOT',
          data: dataValues,
          borderColor: '#00F2FE',
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return null;
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
            gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
            return gradient;
          },
          borderWidth: 2.2,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0A0E17',
          pointBorderColor: '#00F2FE',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(16, 22, 36, 0.95)',
            titleColor: '#00F2FE',
            bodyColor: '#F1F5F9',
            callbacks: {
              title: (items) => milestones[items[0].dataIndex]?.activityName || '',
              label: (context) => `VDOT: ${context.parsed.y} (${milestones[context.dataIndex]?.date})`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748B', font: { size: 10 } }
          },
          y: {
            min: 24,
            max: 42,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#64748B', stepSize: 6, font: { size: 10 } }
          }
        }
      }
    });
  }

  /**
   * 繪製首頁心率強度區間迷你環形圖 (Task T-09)
   */
  renderDashHrChart(hrStats) {
    const canvas = document.getElementById('dashHrCanvas');
    const legendEl = document.getElementById('dashHrLegend');
    if (!canvas || !window.Chart) return;

    if (this.dashHrChartInstance) {
      this.dashHrChartInstance.destroy();
      this.dashHrChartInstance = null;
    }

    const labels = hrStats.breakdown.map(b => b.shortName);
    const dataValues = hrStats.breakdown.map(b => b.km);
    const bgColors = hrStats.breakdown.map(b => b.color);

    const ctx = canvas.getContext('2d');
    this.dashHrChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderColor: '#101624',
          borderWidth: 2.5,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(16, 22, 36, 0.95)',
            titleColor: '#00F2FE',
            bodyColor: '#F1F5F9',
            callbacks: {
              label: (context) => {
                const item = hrStats.breakdown[context.dataIndex];
                return `${item.label}: ${item.km} km (${item.percent}%)`;
              }
            }
          }
        }
      }
    });

    // 渲染右側精緻圖例與佔比
    if (legendEl) {
      legendEl.innerHTML = `
        <div style="margin-bottom: 0.35rem;">
          <span class="zone-highlight-pill">
            🎯 Zone 2 有氧基底 ${hrStats.breakdown[1]?.percent || 68}%
          </span>
        </div>
        ${hrStats.breakdown.map(b => `
          <div class="zone-legend-row">
            <div class="zone-legend-tag">
              <span class="zone-color-dot" style="background: ${b.color};"></span>
              <span>${b.shortName}</span>
            </div>
            <span class="zone-legend-val">${b.percent}% <small style="color:var(--text-muted);font-weight:400;">(${b.km}k)</small></span>
          </div>
        `).join('')}
      `;
    }
  }

  /**
   * 繪製儀表板週訓練量推移堆疊柱狀圖 (Task T-10)
   * 支援 7 大強度分色堆疊與訓練時數折線
   * @param {object} weeklyData 
   */
  renderDashWeeklyChart(weeklyData) {
    const canvas = document.getElementById('dashWeeklyVolumeCanvas');
    if (!canvas || !window.Chart) return;

    if (this.dashWeeklyChartInstance) {
      this.dashWeeklyChartInstance.destroy();
      this.dashWeeklyChartInstance = null;
    }

    const weeks = weeklyData.weeks || [];
    const labels = weeks.map(w => w.label);

    // 7 大訓練強度堆疊柱狀圖設定
    const typesOrder = ['EASY', 'MARATHON', 'THRESHOLD', 'INTERVAL', 'REPETITION', 'RACE', 'TEST'];
    const datasets = typesOrder.map(typeKey => {
      const config = WORKOUT_TYPE_CONFIG[typeKey];
      return {
        type: 'bar',
        label: config.shortLabel || config.label,
        data: weeks.map(w => w.byType ? (w.byType[typeKey] || 0) : 0),
        backgroundColor: config.color,
        borderRadius: 2,
        stack: 'weeklyVolume',
        yAxisID: 'y'
      };
    });

    // 次座標軸 (右側)：訓練時數趨勢線
    datasets.push({
      type: 'line',
      label: '訓練時數 (h)',
      data: weeks.map(w => w.totalDurationHours || 0),
      borderColor: '#F8FAFC',
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderWidth: 2,
      borderDash: [4, 4],
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: '#00F2FE',
      pointBorderColor: '#0A0E17',
      pointBorderWidth: 1.5,
      tension: 0.3,
      yAxisID: 'y1'
    });

    const ctx = canvas.getContext('2d');
    this.dashWeeklyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: '#94A3B8',
              boxWidth: 10,
              padding: 8,
              font: { family: 'Inter', size: 11 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(16, 22, 36, 0.95)',
            titleColor: '#00F2FE',
            bodyColor: '#F1F5F9',
            borderColor: 'rgba(0, 242, 254, 0.3)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              footer: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const w = weeks[idx];
                if (!w) return '';
                return `\n週總里程: ${w.totalDistance} km (${w.activityCount} 趟)\n有氧: ${w.aerobicDistance} km | 質量: ${w.qualityDistance} km`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#94A3B8',
              font: { family: 'Inter', size: 10 },
              maxRotation: 45
            }
          },
          y: {
            stacked: true,
            position: 'left',
            title: {
              display: true,
              text: '跑量 (km)',
              color: '#94A3B8',
              font: { size: 11 }
            },
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#94A3B8' }
          },
          y1: {
            position: 'right',
            title: {
              display: true,
              text: '時數 (h)',
              color: '#94A3B8',
              font: { size: 11 }
            },
            grid: { drawOnChartArea: false },
            ticks: { color: '#94A3B8' },
            min: 0
          }
        }
      }
    });
  }

  /**
   * 繪製彈窗每公里分段配速與心率雙軸折線圖 (Task T-11)
   * 支援 Y 軸配速反轉 (快在上方) 與心率門檻警示標記
   * @param {Array<object>} splits 
   */
  renderModalSplitsChart(splits = []) {
    const canvas = document.getElementById('modalSplitsCanvas');
    if (!canvas || !window.Chart || splits.length === 0) return;

    if (this.modalSplitsChartInstance) {
      this.modalSplitsChartInstance.destroy();
      this.modalSplitsChartInstance = null;
    }

    const labels = splits.map(s => `${s.lap}k`);
    const paceSeconds = splits.map(s => s.paceSec);
    const heartRates = splits.map(s => s.hr);

    const minPace = Math.min(...paceSeconds);
    const maxPace = Math.max(...paceSeconds);
    const validHrs = heartRates.filter(h => h > 0);
    const minHr = validHrs.length > 0 ? Math.min(...validHrs) : 120;
    const maxHr = validHrs.length > 0 ? Math.max(...validHrs) : 180;

    const ctx = canvas.getContext('2d');
    
    // 配速面積微光漸層
    const paceGradient = ctx.createLinearGradient(0, 0, 0, 240);
    paceGradient.addColorStop(0, 'rgba(0, 242, 254, 0.28)');
    paceGradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

    this.modalSplitsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '每公里配速 (Pace)',
            data: paceSeconds,
            borderColor: '#00F2FE',
            backgroundColor: paceGradient,
            fill: true,
            tension: 0.32,
            borderWidth: 2.6,
            pointRadius: 4.5,
            pointHoverRadius: 7.5,
            pointBackgroundColor: '#0A0E17',
            pointBorderColor: '#00F2FE',
            pointBorderWidth: 2,
            yAxisID: 'y'
          },
          {
            label: '平均心率 (HR)',
            data: heartRates,
            borderColor: '#FF6B4A',
            backgroundColor: 'transparent',
            borderWidth: 2.2,
            borderDash: [3, 3],
            tension: 0.32,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: (context) => {
              const hr = heartRates[context.dataIndex];
              return hr >= APP_CONFIG.ATHLETE.lthr ? '#EF4444' : '#FF6B4A';
            },
            pointBorderColor: '#0A0E17',
            pointBorderWidth: 1.5,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: '#94A3B8',
              boxWidth: 12,
              padding: 10,
              font: { family: 'Inter', size: 11 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(16, 22, 36, 0.95)',
            titleColor: '#00F2FE',
            bodyColor: '#F1F5F9',
            borderColor: 'rgba(0, 242, 254, 0.3)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const s = splits[idx];
                return `第 ${s.lap} 公里 (${s.paceZone ? s.paceZone.label : 'E 輕鬆'})`;
              },
              label: (context) => {
                const idx = context.dataIndex;
                const s = splits[idx];
                if (context.datasetIndex === 0) {
                  return `配速: ${s.pace}/km (${s.paceSec} 秒/km)`;
                } else {
                  const isHigh = s.hr >= APP_CONFIG.ATHLETE.lthr;
                  return `心率: ${s.hr > 0 ? s.hr + ' bpm' : '-'} ${isHigh ? '(≥ LTHR 臨界)' : ''}`;
                }
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#94A3B8',
              font: { family: 'Inter', size: 10 },
              maxRotation: 0
            }
          },
          y: {
            type: 'linear',
            position: 'left',
            reverse: true, // 核心重點：配速越快（秒數越小）在上方
            title: {
              display: true,
              text: '配速 (min/km)',
              color: '#00F2FE',
              font: { size: 11, weight: 'bold' }
            },
            grid: { color: 'rgba(0, 242, 254, 0.08)' },
            ticks: {
              color: '#00F2FE',
              callback: (val) => {
                const m = Math.floor(val / 60);
                const s = Math.round(val % 60);
                return `${m}:${String(s).padStart(2, '0')}`;
              }
            },
            min: Math.max(150, minPace - 15),
            max: maxPace + 15
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: '心率 (bpm)',
              color: '#FF6B4A',
              font: { size: 11, weight: 'bold' }
            },
            grid: { drawOnChartArea: false },
            ticks: { color: '#FF6B4A' },
            min: Math.max(80, minHr - 10),
            max: maxHr + 10
          }
        }
      }
    });
  }

  /**
   * 繪製心率區間專頁圖表 (上個月 vs 這個月圓餅圖 + 全年長條圖)
   */
  renderFullZonesCharts(hrStatsYear, hrStatsPrev, hrStatsCurr) {
    if (!window.Chart) return;

    // 1. 上個月圓餅圖
    this._renderMonthDoughnut('zonesPrevMonthCanvas', hrStatsPrev, 'prevMonthHrChartInstance');

    // 2. 這個月圓餅圖
    this._renderMonthDoughnut('zonesCurrMonthCanvas', hrStatsCurr, 'currMonthHrChartInstance');

    // 3. 2026 年度累積跑量長條圖 (Bar Chart)
    const barCanvas = document.getElementById('zonesBarCanvas');
    if (barCanvas) {
      if (this.fullHrBarChartInstance) {
        this.fullHrBarChartInstance.destroy();
        this.fullHrBarChartInstance = null;
      }
      const ctxBar = barCanvas.getContext('2d');
      this.fullHrBarChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: hrStatsYear.breakdown.map(b => b.shortName),
          datasets: [{
            label: '2026 累積跑量 (km)',
            data: hrStatsYear.breakdown.map(b => b.km),
            backgroundColor: hrStatsYear.breakdown.map(b => b.color),
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(16, 22, 36, 0.95)',
              titleColor: '#00F2FE',
              bodyColor: '#F1F5F9',
              callbacks: {
                label: (context) => {
                  const b = hrStatsYear.breakdown[context.dataIndex];
                  return [
                    `2026 跑量: ${b.km} km (${b.percent}%)`,
                    `心率範圍: ${b.hrRange}`,
                    `核心目的: ${b.purpose}`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#94A3B8', font: { family: 'Inter', size: 11 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.06)' },
              ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 11 } }
            }
          }
        }
      });
    }
  }

  /**
   * 繪製單月份圓餅/環形圖輔助函式
   */
  _renderMonthDoughnut(canvasId, stats, instanceProp) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !stats) return;

    if (this[instanceProp]) {
      this[instanceProp].destroy();
      this[instanceProp] = null;
    }

    const ctx = canvas.getContext('2d');
    this[instanceProp] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: stats.breakdown.map(b => `${b.shortName} (${b.percent}%)`),
        datasets: [{
          data: stats.breakdown.map(b => b.km),
          backgroundColor: stats.breakdown.map(b => b.color),
          borderColor: '#101624',
          borderWidth: 2.5,
          hoverOffset: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#94A3B8',
              boxWidth: 10,
              padding: 8,
              font: { family: 'Inter', size: 11 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(16, 22, 36, 0.95)',
            titleColor: '#00F2FE',
            bodyColor: '#F1F5F9',
            callbacks: {
              label: (context) => {
                const b = stats.breakdown[context.dataIndex];
                return `${b.label}: ${b.km} km (${b.percent}%) - ${b.hrRange}`;
              }
            }
          }
        }
      }
    });
  }

  updateStatusBadge(status, syncDate = null) {
    if (!this.dom.dataSourceStatus) return;

    let dotClass = 'status-loading';
    let text = '連線中...';

    switch (status) {
      case DataSourceStatus.LIVE:
        dotClass = 'status-live';
        text = 'Google Sheets (即時連線)';
        break;
      case DataSourceStatus.CACHED:
        dotClass = 'status-cached';
        text = '本地快取 (1h 內有效)';
        break;
      case DataSourceStatus.MOCK:
        dotClass = 'status-mock';
        text = 'Mock Data (模擬模式)';
        break;
      case DataSourceStatus.ERROR:
        dotClass = 'status-error';
        text = '連線異常';
        break;
    }

    this.dom.dataSourceStatus.innerHTML = `
      <span class="status-dot ${dotClass}"></span>
      <span class="status-label">${text}</span>
    `;
  }

  showAlert(message, type = 'info') {
    if (!this.dom.systemAlertContainer) return;
    this.dom.systemAlertContainer.innerHTML = `
      <div class="system-alert alert-${type}">
        <span>${message}</span>
        <button class="alert-close" onclick="this.parentElement.remove()">&times;</button>
      </div>
    `;
  }

  clearAlert() {
    if (this.dom.systemAlertContainer) {
      this.dom.systemAlertContainer.innerHTML = '';
    }
  }

  renderLoadingState(isLoading) {
    if (isLoading) {
      if (!this.data.logs || this.data.logs.length === 0) {
        if (this.dom.pageContent) {
          this.dom.pageContent.innerHTML = `
            <div class="content-loader-wrapper">
              <div class="spinner-pulse"></div>
              <div class="loading-text">載入跑步訓練分析資料中...</div>
              <div class="loading-subtext">Google Sheets: 訓練日誌、心率區間、課表</div>
            </div>
          `;
        }
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.init();
});
