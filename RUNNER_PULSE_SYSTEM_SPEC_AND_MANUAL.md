# Runner Pulse Analytics — 系統架構、功能規格與邏輯開發手冊
> **文件版本**：v2.2 (雲端發布對接與功能增強擴充版)  
> **編寫角色**：Technical PM (`@01_role_pm.md`) + Senior SA (`@02_role_sa.md`) + Principal Architect (`@03_role_architect.md`)  
> **適用對象**：全端工程師、系統分析師、跑者用戶、維運與未來迭代團隊  
> **線上站點**：
> - GitHub Pages: [https://tobby0306.github.io/Runner_Web/](https://tobby0306.github.io/Runner_Web/)  
> - Netlify: [https://tobby-runner-web.netlify.app](https://tobby-runner-web.netlify.app)  
> **資料來源**：[Google 試算表 - 訓練日誌](https://docs.google.com/spreadsheets/d/1DahiYbLvl4zR6-5EABCSwTATCtkP7N3IywSxWo5JKas/)  
> **公開發布識別碼 (CORS)**：`2PACX-1vRWTBzIVn5aVBDYHIzmkBbI0E-Vok36PDANTne_S8U00vpPZCx6kDEzBq0iWLgZ2VIDg5Y20CgsCOod`

---

## 1. 專案說明 (Project Overview)

### 1.1 專案背景與痛點
本系統為專為長跑選手與馬拉松跑者打造的 **個人化跑步數據解析與 VDOT 心率分析系統 (Runner Pulse Analytics)**。
跑者長期在 Google 試算表記錄大量歷史 Garmin 活動日誌（2020 台北馬 ～ 2026 年，超過 200+ 趟），欄位包含 Garmin 活動 ID、日期、名稱、配速、心率、步頻、步幅、備註以及每公里分段資料。
過去面臨的痛點包括：
1. **試算表純文字難以視覺化**：缺乏長期跑力（VDOT）爬升曲線、無法直觀分析每公里配速與心率漂移。
2. **心率強度監控不易**：難以即時評估是否遵守「80/20 有氧法則」（低強度 80% vs 質量課 20%）。
3. **課表執行成效難以對比**：計畫里程與實際 Garmin 匯入數據分開，難以掌握課表完成率。
4. **跨裝置使用困難**：在操場練跑後用手機查閱試算表體驗極差，需要支援手機窄螢幕操作的 Web App。
5. **瀏覽器跨來源 (CORS) 阻擋**：靜態網頁直接存取 Google 試算表 `/export` 端點受限於同源政策，需透過官方發布端點與多通道降級保證高可用性。

### 1.2 核心價值與架構定位
- **零後端伺服器負擔 (Serverless SPA)**：純原生 ES6+ JavaScript 模組化架構，不依賴龐大框架，秒級極速載入。
- **即時試算表雙向聯動**：直接以 CSV 直連或本機代理拉取 Google Sheets，試算表一更新，首頁與課表立即連動。
- **專業級 Jack Daniels 跑力體系**：內建 Daniels Running Formula 耗氧量與 %VO2max 數學模型，自動反推全馬力與各配速區間。
- **極致 RWD 手機優化**：手機抽屜導覽選單、防爆版水平滑動表格、觸控友善圖表與彈窗。
- **全方位平滑降級與自我修復**：五重 Google Sheets 連線管線，遭遇斷網或 CORS 阻擋時秒級自動啟用高擬真模擬資料備援。

### 1.3 技術棧矩陣 (Technology Stack)
| 領域 | 技術選型 | 選擇理由 |
|---|---|---|
| **核心語言** | Vanilla ES6+ JavaScript (ES Modules) | 輕量極速、原生支援瀏覽器、無編譯依賴、程式碼維護透明 |
| **結構與排版** | Semantic HTML5 + Custom Modern CSS | CSS 自訂變數、深色跑者儀表板、玻璃擬態 (Glassmorphism)、RWD Grid |
| **圖表視覺化** | Chart.js v4.4.1 (UMD) | 高效能 Canvas 繪製、雙軸配速逆轉顯示、堆疊長條圖與圓餅圖 |
| **資料儲存/快取** | LocalStorage + MemoryCache (TTL 1h) | 離線優先、大幅減少對 Google Sheets 的 API 請求，防請求超流 |
| **雲端靜態部署** | GitHub Pages + Netlify (CI/CD) | 免費全球 CDN、自動化 Git Push 觸發持續部署、HTTPS 憑證保護 |

### 1.4 專案里程碑與任務拆解清單 (WBS & Task Breakdown)
依據 `@01_role_pm.md` 技術專案經理規範，拆解基線任務 (Baseline) 與擴充功能任務 (Extensions)：

| Task ID | 任務名稱 | 負責角色 | 優先級 | 依賴任務 | 交付物定義 (DoD) |
|---|---|---|---|---|---|
| **T-01** | 專案初始化與設計系統規範建立 | FE / UX | P0 | 無 | 建立 CSS 變數、版型結構與色彩常數 |
| **T-02** | Google Sheets 批次同步與三層快取降級 | BE / SA | P0 | T-01 | 完成 3 頁籤平行拉取與 LocalStorage 快取 |
| **T-03** | 訓練日誌 CSV 解析與分段正規化 | SA / BE | P0 | T-02 | 正則萃取每公里分段、時間間歇與 7 大訓練分類 |
| **T-04** | 主控路由與導覽切換架構 | FE | P0 | T-01 | 完成 SPA 單頁視圖無刷新切換 |
| **T-05** | 系統儀表板核心 KPI 與跑量統計 | FE / SA | P0 | T-03 | 呈現年度里程、平均心率、步頻與倒數卡片 |
| **T-06** | 訓練日誌清單多維度篩選與標籤呈現 | FE | P1 | T-03 | 完成日期/名稱/強度多維過濾器 |
| **T-07** | Jack Daniels VDOT 跑力計算引擎 | SA / FE | P0 | T-03 | 實現 Daniels 公式與 5K/10K/半馬/全馬成績預測 |
| **T-08** | VDOT 歷史跑力演進折線圖表 | FE | P1 | T-07 | Chart.js 繪製跑力爬升曲線 |
| **T-09** | 5 大心率區間對照與月度分佈圖表 | FE / SA | P1 | T-03 | 實現 %LTHR 區間分佈堆疊圖與雙月圓餅圖 |
| **T-10** | 80/20 有氧法則聚合與週跑量長條圖 | FE / SA | P1 | T-03 | 計算 80/20 有氧比例與 4/8/12 週滾動聚合 |
| **T-11** | 每公里分段明細彈窗與配速/心率雙軸圖 | FE / UX | P1 | T-03 | 點擊卡片彈出雙軸折線圖與 Delta 配速差明細 |
| **T-12** | 訓練課表追蹤與進度條完成率比對 | FE / SA | P1 | T-03 | 動態關聯活動完成里程與計畫里程 |
| **T-13** | 即時重新整理與全域狀態指示燈 | FE | P2 | T-02 | 狀態指示燈顯示 LIVE / CACHED / MOCK |
| **T-14** | 極致響應式 (RWD) 佈局與手機端優化 | UX / FE | P0 | 全任務 | 手機抽屜選單、防爆版表格與觸控手勢相容 |
| **T-15** | 無伺服器 CI/CD 部署與自動化發布 | BE | P0 | 全任務 | GitHub Pages 與 Netlify 全自動部署 |
| **T-EXT-01** | 跑者生理基準自訂彈窗與全站動態區間連動 | FE / SA | P0 | T-09 | 支援自訂 VDOT/LTHR/MaxHR，全站即時重繪 |
| **T-EXT-02** | 日誌總表 RPE / TRIMP 欄位與分頁控制器 | FE / SA | P1 | T-06 | 補齊 TRIMP 衝量與主觀疲勞度，支援 10/25/50 分頁 |
| **T-EXT-03** | 首頁五大心率/配速區間速查基準卡 | FE / UX | P1 | T-05 | 首頁嵌入五大區間速查尺，支援一鍵點擊過濾日誌 |
| **T-EXT-07** | 全域非阻塞 Toast 輕量互動動畫通知 | UX / FE | P1 | T-13 | 取代原生 Alert，支援 4 種等級與平滑動畫倒數 |
| **T-EXT-08** | Google Sheets 跨來源發布對接與診斷彈窗 | SA / BE / UX | P0 | T-02 | 整合 `pub?output=csv` 官方端點、5 重連線管道與診斷視窗 |

---

## 2. 系統架構 (System Architecture)

### 2.1 整體系統架構圖 (Mermaid Architecture)

```mermaid
graph TB
    subgraph "雲端資料來源 Data Sources"
        GS_Pub["Google Sheets 官方發布端點<br>(/d/e/2PACX-1v.../pub?output=csv)"]
        GS_Raw["Google 試算表原始試算表<br>(1DahiYbLvl4.../export?format=csv)"]
    end

    subgraph "資料存取與快取層 Data Ingestion & Cache Layer"
        SheetsSvc["SheetsService (sheetsService.js)<br>五重自動備援擷取管道"]
        LocalProxy["本機代理 (serve.py /api/sheets)"]
        DirectPub["官方 CORS 端點 (/d/e/{publishedId}/pub)"]
        GVizAPI["Google Visualization API (GViz)"]
        ProxyCORS["公用 CORS 轉發代理備援 (allorigins / corsproxy)"]
        StorageSvc["StorageService (storageService.js)<br>TTL 1h + 前綴 runner_pulse_v7_"]
        MockData["MockData (高擬真離線測試備援)"]
    end

    subgraph "核心運算與演算法引擎 Business Logic & Calculation Engines"
        CSVParser["CSV 解析器 (csvParser.js)"]
        ActParser["活動解析與分段正規化 (activityParser.js)"]
        VDOTCalc["Jack Daniels VDOT 引擎 (vdotCalc.js)"]
        VolCalc["週跑量與 80/20 分類 (weeklyVolumeCalc.js)"]
        ZoneCalc["心率區間分佈分析 (zoneCalc.js)"]
        SchedCalc["課表執行與目標偵測 (scheduleCalc.js)"]
    end

    subgraph "控制與呈現層 Controller & Presentation Views"
        AppCtrl["AppController (app.js)"]
        ViewDash["1. 儀表板首頁 (Dashboard)<br>+ 五大區間速查尺 (T-EXT-03)"]
        ViewLogs["2. 訓練日誌清單 (Training Logs)<br>+ RPE / TRIMP + 分頁器 (T-EXT-02)"]
        ViewVDOT["3. VDOT 跑力分析 (VDOT Trend)"]
        ViewZones["4. 心率區間對照 (HR Zones)"]
        ViewSched["5. 課表追蹤管理 (Schedule Tracker)"]
        ModalSplits["每公里分段折線圖彈窗 (T-11)"]
        ModalProfile["跑者生理設定彈窗 (T-EXT-01)"]
        ModalDiag["資料來源連線診斷彈窗 (T-EXT-08)"]
        ToastEngine["全域 Toast 輕量通知 (T-EXT-07)"]
    end

    GS_Pub --> DirectPub --> SheetsSvc
    GS_Raw --> LocalProxy -.-> SheetsSvc
    GS_Raw --> GVizAPI -.-> SheetsSvc
    GS_Raw --> ProxyCORS -.-> SheetsSvc
    SheetsSvc <--> StorageSvc
    SheetsSvc -.Fallback.-> MockData
    SheetsSvc --> CSVParser --> ActParser
    ActParser --> VDOTCalc
    ActParser --> VolCalc
    ActParser --> ZoneCalc
    ActParser --> SchedCalc

    VDOTCalc & VolCalc & ZoneCalc & SchedCalc --> AppCtrl
    AppCtrl --> ViewDash
    AppCtrl --> ViewLogs
    AppCtrl --> ViewVDOT
    AppCtrl --> ViewZones
    AppCtrl --> ViewSched
    AppCtrl --> ModalSplits
    AppCtrl --> ModalProfile
    AppCtrl --> ModalDiag
    AppCtrl --> ToastEngine
```

---

### 2.2 資料流程圖 (Data Flow Diagram - DFD)

#### DFD Level 0 (Context Diagram 系統環境圖)

```mermaid
graph LR
    User((跑者 / 使用者))
    System[[Runner Pulse Analytics<br>跑步數據分析系統]]
    GSheets[(Google 試算表<br>公開發布 CSV 串流)]
    BrowserCache[(瀏覽器本地儲存<br>LocalStorage: 快取與跑者生理設定)]

    User -->|設定生理基準、切換分頁、查看分段與診斷| System
    System -->|渲染圖表、指標卡、課表比對與 Toast 通知| User
    GSheets -->|CORS 公開 CSV 數據串流| System
    System <-->|讀寫暫存活動快取 (v7) 與跑者客製參數| BrowserCache
```

#### DFD Level 1 (詳細資料處理與五重備援流程)

```mermaid
sequenceDiagram
    autonumber
    actor Runner as 跑者 / 瀏覽器
    participant App as AppController (app.js)
    participant Sheets as SheetsService
    participant Cache as StorageService (LocalStorage)
    participant Google as Google Sheets API / CDN
    participant Engine as 運算解析引擎 (Parsers & Calculators)
    participant View as DOM & Chart.js 視覺化

    Runner->>App: 開啟網頁 / 點擊重新整理
    App->>Sheets: batchFetchAllTabs(forceRefresh)
    alt 命中未過期快取 (TTL 1hr)
        Sheets->>Cache: get(CACHE_KEYS)
        Cache-->>Sheets: 回傳快取 JSON 物件
        Sheets-->>App: 回傳 CACHED 狀態
    else 快取過期或強制更新 (五重連線策略)
        critical 多通道擷取管道
            Sheets->>Google: 優先管道: /d/e/{publishedId}/pub?output=csv (原生 CORS)
            alt 官方發布連線成功
                Google-->>Sheets: 回傳 200 OK + CSV 串流 (含 Access-Control-Allow-Origin: *)
            else 備援嘗試
                Sheets->>Sheets: 嘗試本機 Proxy / GViz / 公用 CORS 代理
            end
        option 連線全數受阻
            Sheets->>Sheets: 自動切換為高擬真 Mock Data 備援資料集
        end
        Sheets->>Engine: parseCSV() & parseActivities()
        Engine-->>Sheets: 結構化活動陣列 (含分段、心率、TRIMP、RPE)
        Sheets->>Cache: set(CACHE_KEYS, data, 1hr)
        Sheets-->>App: 回傳 LIVE 或 MOCK 狀態與資料集
    end

    App->>Engine: 執行 VDOT 計算、週跑量彙整、課表動態比對、目標賽事偵測
    Engine-->>App: 傳回計算結果數據物件
    App->>View: 渲染當前畫面與五大區間速查卡片
    View-->>Runner: 呈現高光指標、Chart.js 折線圖、分頁日誌與 Toast 提示
```

---

### 2.3 檔案目錄結構與職責清單 (File Inventory)

```
c:\Antigravity_WS\Runner_Web\
├── index.html                      # 主應用程式 SPA 入口骨架與導覽列
├── RUNNER_PULSE_SYSTEM_SPEC_AND_MANUAL.md # 系統規格與維護開發手冊 (v2.2)
├── README.md                       # 專案快速啟動說明
├── serve.py                        # 本機開發 HTTP 伺服器與 Google Sheets 反向代理
├── start.bat                       # 一鍵啟動批次檔
├── .gitignore                      # Git 版本控制忽略清單
├── .rules/                         # 團隊角色定義與規範手冊
│   ├── 01_role_pm.md
│   ├── 02_role_sa.md
│   ├── 03_role_architect.md
│   ├── 04_role_uxui.md
│   ├── 05_role_frontend.md
│   ├── 06_role_backend.md
│   └── 07_role_qa.md
├── css/                            # 樣式表層 (遵循設計系統)
│   ├── index.css                   # 全域 CSS 變數、顏色、字體與重設基底
│   ├── layout.css                  # 佈局網格、側邊欄、頂部導覽列與 RWD 斷點
│   └── components.css              # 卡片、按鈕、表格、徽章、模態彈窗樣式
└── js/                             # JavaScript 模組層 (ES Modules)
    ├── app.js                      # 主控核心：路由分發、DOM 事件與 View 渲染
    ├── config.js                   # 系統全域設定 (SheetID, GID, Cache 前綴, 跑者常數)
    ├── mock/
    │   └── mockData.js             # 降級備援資料 (Mock Data)
    ├── services/
    │   ├── sheetsService.js        # Google Sheets 批次載入、解析與三層容錯服務
    │   └── storageService.js       # LocalStorage 快取封裝 (帶 TTL 與記憶體 Fallback)
    └── utils/
        ├── activityParser.js       # 日誌文字解析、每公里分段正規表示式、強度判定
        ├── csvParser.js            # RFC 4180 標準相容 CSV 解析演算法
        ├── formatters.js           # 日期、配速 (MM:SS)、時間與字串格式化工具
        ├── scheduleCalc.js         # 課表「計畫 vs 實際」比對引擎、五態評定、目標賽事偵測
        ├── vdotCalc.js             # Jack Daniels VDOT 耗氧公式與完賽時間預測
        ├── weeklyVolumeCalc.js     # 週跑量時間窗口統計與 80/20 法則分佈
        └── zoneCalc.js             # 心率五大區間百分比分佈與月度對比運算
```

---

## 3. 各功能模組詳細說明與邏輯代碼對照表

本節針對系統內 10 大核心功能，逐一拆解其**業務目標、計算公式、核心 Method、以及精確的程式碼檔案位置與行號區間**。

---

### 模組 1：Google Sheets 批次同步、五重容錯與發布端點 CORS 策略 (Task T-02, T-EXT-08)

#### 1. 業務場景與目的
跑者在雲端 Google 試算表擁有 3 個核心頁籤（訓練日誌 gid=0、訓練區間 gid=1124408140、課表 gid=196879307）。由於純前端靜態站（GitHub Pages / Netlify）存取 Google 原生未發布之 `/export?format=csv` 連結會遭到瀏覽器 CORS 阻擋，系統必須具備多管道容錯機制，直連官方公開發布端點，並在網路中斷時秒級平滑降級為模擬資料集。

#### 2. 核心邏輯與五重擷取管線
1. **多管道備援管線 (Multi-Channel Ingestion Pipeline)**：
   - **策略 1（本機代理）**：偵測若處於 `localhost`，優先調用 `serve.py` 後端代理端點 `/api/sheets?gid=...`。
   - **策略 2（官方 CORS 發布端點）**：直連 `https://docs.google.com/spreadsheets/d/e/${publishedId}/pub?output=csv&gid=${gid}`，官方原生提供 `Access-Control-Allow-Origin: *` 標頭，無須後端代理。
   - **策略 3（原始試算表 pub 端點）**：嘗試 `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv&gid=${gid}`。
   - **策略 4（Google Visualization API）**：調用 GViz 查詢端點 `/gviz/tq?tqx=out:csv&gid=${gid}`。
   - **策略 5（公用 CORS 代理備援）**：調用 `allorigins.win` 與 `corsproxy.io` 公開轉發代理。
2. **三層平滑降級與自我修復 (Self-Healing Fallback)**：
   - 第一層：**LIVE** 連線成功 ➔ 存入 LocalStorage（有效期 1 小時，版本前綴 `runner_pulse_v7_`）➔ 狀態標籤 `DataSourceStatus.LIVE`。
   - 第二層：連線失敗但本地有未過期或歷史快取 ➔ 讀取本地快取 ➔ 狀態標籤 `DataSourceStatus.CACHED`，並跳出 Toast 提醒。
   - 第三層：全數管道受阻（如完全離線）➔ 自動載入標準測試集 ➔ 狀態標籤 `DataSourceStatus.MOCK`，確保全站圖表與日誌無縫運行不閃退。

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/services/sheetsService.js](file:///c:/Antigravity_WS/Runner_Web/js/services/sheetsService.js)
  - `fetchSheetData(sheetId, gid)`：行 [L35-L130](file:///c:/Antigravity_WS/Runner_Web/js/services/sheetsService.js#L35-L130)，五重備援管道平行串接。
  - `batchFetchAllTabs(forceRefresh)`：行 [L140-L260](file:///c:/Antigravity_WS/Runner_Web/js/services/sheetsService.js#L140-L260)，使用 `Promise.all` 平行非同步讀取 3 頁籤並校驗分類。
  - 降級與快取回退邏輯：行 [L261-L290](file:///c:/Antigravity_WS/Runner_Web/js/services/sheetsService.js#L261-L290)。
- **設定常數**：[js/config.js](file:///c:/Antigravity_WS/Runner_Web/js/config.js#L7-L38)，定義 `SPREADSHEET_ID`、`PUBLISHED_ID` 與 `CACHE.PREFIX: runner_pulse_v7_`。
- **本機 Proxy 檔案**：[serve.py](file:///c:/Antigravity_WS/Runner_Web/serve.py#L30-L115)，提供本機跨域快取與轉發處理。

---

### 模組 2：訓練日誌解析層與文字分段正規化 (Task T-03, T-11)

#### 1. 業務場景與目的
試算表中的訓練日誌是從 Garmin 匯出的文字資料，欄位包含日期 ISO 字串、配速 `7:05`、時間 `1:30:04`，以及格式多變的「每公里分段」字串。本模組需將非結構化文字清洗為強型別物件，並嚴格由最新向舊（倒序）排序。

#### 2. 核心邏輯與正規表達式
- **時間制與距離制混合正則解析**：
  ```javascript
  const LAP_SPLIT_REGEX = /([0-9]+(?:\.[0-9]+)?(?:min|k|km)?|[0-9]+)\s*\(\s*(\d+:\d+)\s*,\s*(?:Max\d+bpm,\s*Avg)?(\d+(?:\.\d+)?)\s*bpm\s*\)([^\|\n\"]*)/gi;
  ```
  能同時解析：
  - 標準距離：`1k(7:32, 110bpm)`
  - 時間間歇：`15min(6:43, 128bpm)-平均步頻183平均步幅0.8`
  - 休息標籤：`3min(5:34, 149bpm)-平均步頻187平均步幅0.96 *break 1min`
- **活動強度自動歸類 (`classifyWorkoutType`)**：
  依照活動名稱關鍵字（`Test` ➔ TEST、`萬金石/馬拉松` ➔ RACE、`T -/min T` ➔ THRESHOLD、`200m R` ➔ REPETITION、`E-` ➔ EASY）。
- **倒序排序演算法**：以 `getActivityTimestamp(b) - getActivityTimestamp(a)` 進行數值比對。

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/utils/activityParser.js](file:///c:/Antigravity_WS/Runner_Web/js/utils/activityParser.js)
  - `parseActivities(rawRows)`：行 [L190-L280](file:///c:/Antigravity_WS/Runner_Web/js/utils/activityParser.js#L190-L280)，主解析器。
  - `parseLapSplits(splitsString)`：行 [L120-L188](file:///c:/Antigravity_WS/Runner_Web/js/utils/activityParser.js#L120-L188)，每公里分段正規擷取。
  - `classifyWorkoutType(activityName)`：行 [L65-L115](file:///c:/Antigravity_WS/Runner_Web/js/utils/activityParser.js#L65-L115)，7 大強度自動識別。
  - `classifyPaceZone(paceSec)`：行 [L36-L63](file:///c:/Antigravity_WS/Runner_Web/js/utils/activityParser.js#L36-L63)，依分段配速秒數判定對應落點。

---

### 模組 3：Jack Daniels VDOT 跑力計算與賽事預測引擎 (Task T-07, T-08)

#### 1. 業務場景與目的
VDOT 是世界著名跑步教練 Jack Daniels 發明的跑力指數。系統自動從跑者歷史紀錄中篩選「測驗（TEST）」與「比賽（RACE）」活動，計算跑者歷年的跑力演變，並在圖表上繪製 VDOT 歷史爬升折線，同時自動推算 5K/10K/半馬/全馬的預估完賽時間。

#### 2. 核心公式與數學模型
1. **速度換算**：$v = \frac{d\text{ (公尺)}}{t\text{ (分鐘)}}$
2. **耗氧量公式 (Daniels Oxygen Cost)**：
   $$VO_2 = -4.60 + 0.182258 \cdot v + 0.000104 \cdot v^2$$
3. **極限持續能力曲線 (%VO2max drop-off)**：
   $$\%VO_2\text{max} = 0.8 + 0.1894393 \cdot e^{-0.012778 \cdot t} + 0.2989558 \cdot e^{-0.1932605 \cdot t}$$
4. **VDOT 跑力**：
   $$\text{VDOT} = \frac{VO_2}{\%VO_2\text{max}}$$

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/utils/vdotCalc.js](file:///c:/Antigravity_WS/Runner_Web/js/utils/vdotCalc.js)
  - `calcVDOT(distanceKm, finishTimeSec)`：行 [L15-L40](file:///c:/Antigravity_WS/Runner_Web/js/utils/vdotCalc.js#L15-L40)，實作耗氧量與極限比率公式。
  - `extractVDOTMilestones(activities)`：行 [L47-L81](file:///c:/Antigravity_WS/Runner_Web/js/utils/vdotCalc.js#L47-L81)，從日誌中萃取里程大於 3K 的測驗與賽事點。
  - `getVDOTPredictions(vdot)`：行 [L88-L126](file:///c:/Antigravity_WS/Runner_Web/js/utils/vdotCalc.js#L88-L126)，反推四項標準賽事完賽時間與 E/M/T/I/R 訓練配速。
- **視圖繪製**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L950-L1070) `renderVdotAnalysisView()` 與 Chart.js 折線圖配置。

---

### 模組 4：訓練類型分類 (7 大體系) 與週跑量統計圖 (Task T-10)

#### 1. 業務場景與目的
實踐馬拉松訓練「80/20 法則」，追蹤跑者每週累積的訓練里程、訓練時長，並以彩色堆疊長條圖呈現各類別比例（輕鬆跑、馬拉松跑、門檻跑、間歇跑、速度跑、比賽、測驗）。

#### 2. 核心邏輯
- **週次對齊**：依 ISO 8601 週曆（每週一為起始日，週日為結尾），計算 `YYYY-Wxx`。
- **多週期時間篩選切換**：支援「近 8 週 (`8weeks`)」、「近 12 週 (`12weeks`)」、「2026 年度 (`2026`)」、「歷年全部 (`all`)」。
- **80/20 有氧健康度評估**：
  $$\text{有氧比例} = \frac{\text{Easy 里程}}{\text{總里程}} \times 100\%$$
  若大於 75% 評定為「🟢 優秀（有氧打底紮實）」，若低於 65% 則給予「⚠️ 質量偏高」警示。

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/utils/weeklyVolumeCalc.js](file:///c:/Antigravity_WS/Runner_Web/js/utils/weeklyVolumeCalc.js)
  - `aggregateWeeklyVolume(activities, rangeOption)`：行 [L50-L165](file:///c:/Antigravity_WS/Runner_Web/js/utils/weeklyVolumeCalc.js#L50-L165)，完成週次彙總與時長換算。
  - `calculateWorkoutTypeBreakdown(activities, filterYear)`：行 [L175-L245](file:///c:/Antigravity_WS/Runner_Web/js/utils/weeklyVolumeCalc.js#L175-L245)，計算 7 大類別圓餅佔比。
- **圖表渲染**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L600-L680) `renderDashWeeklyChart()`，使用 Chart.js 堆疊柱狀圖。

---

### 模組 5：心率五大強度區間分佈與月度演變分析 (Task T-09)

#### 1. 業務場景與目的
對照跑者的生理基準（最大心率 196 bpm，臨界心率 LTHR 172 bpm），將所有歷史日誌的心率劃分至 Zone 1～Zone 5，並進行「最近兩個月份」的心率佔比比較，直觀展示跑者的心肺能力是否有向低心率有氧位移。

#### 2. 區間定義標準 (依試算表頁籤 2 基準)
- **Zone 1 (恢復跑)**：`112 ~ 137 bpm` (65% ~ 80% LTHR)
- **Zone 2 (輕鬆跑 E)**：`138 ~ 153 bpm` (80% ~ 89% LTHR)
- **Zone 3 (馬拉松 M)**：`154 ~ 163 bpm` (89% ~ 95% LTHR)
- **Zone 4 (乳酸門檻 T)**：`164 ~ 172 bpm` (95% ~ 100% LTHR)
- **Zone 5 (最大攝氧/速度 I/R)**：`173 ~ 196 bpm` (> 100% LTHR)

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/utils/zoneCalc.js](file:///c:/Antigravity_WS/Runner_Web/js/utils/zoneCalc.js)
  - `calculateHeartRateDistribution(activities)`：行 [L40-L95](file:///c:/Antigravity_WS/Runner_Web/js/utils/zoneCalc.js#L40-L95)，統計 5 區間活動次數、里程與佔比。
  - `getLatestTwoMonths(activities)`：行 [L125-L165](file:///c:/Antigravity_WS/Runner_Web/js/utils/zoneCalc.js#L125-L165)，自動萃取最新兩月份供月度對比。
- **視圖繪製**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L1080-L1250) `renderZonesView()`，包含甜甜圈環形圖與並排雙月柱狀圖。

---

### 模組 6：每公里與時間制分段解析及配速/心率雙軸折線圖 (Task T-11)

#### 1. 業務場景與目的
在日誌清單點擊任一活動列，即可彈出「每公里分段 (Lap Splits) 深度解析視窗」。可視化每一公里（或時間區段）的配速波動與心率上升趨勢（心率漂移 Cardiac Drift），並支援表格/卡片雙視圖切換。

#### 2. 核心邏輯
- **雙軸逆轉折線圖 (Chart.js Dual-Axis)**：
  - 左 Y 軸為心率（數值越大越往上，70~200 bpm）。
  - 右 Y 軸為配速（秒/km），設定 `reverse: true`，讓跑得越快的公里在畫面上顯示在越上方，符合跑者直覺。
- **4 大高光指標統計**：自動計算最快公里（Fastest Lap）、最慢公里（Slowest Lap）、心率爬升差（HR Drift $\Delta = \text{末段心率} - \text{起跑心率}$）與平均步頻。

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js)
  - `openLapSplitsModal(activityId)`：行 [L143-L382](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L143-L382)，Modal 資料綁定與 DOM 注入。
  - `renderModalSplitsChart(splits)`：行 [L200-L280](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L200-L280)，配置配速/心率雙軸 Canvas 折線圖。

---

### 模組 7：課表「計畫 vs 實際」比對與目標賽事智慧偵測引擎 (Task T-12, T-05)

#### 1. 業務場景與目的
自動讀取 Google Sheets 頁籤 3「課表」，將課表預計距離（EST）與實際執行里程（ACT 或自動比對當日 Garmin 記錄）進行動態對比。同時在首頁 Hero 區塊**全自動識別下一場大賽或測驗**，並給予動態天數倒數。

#### 2. 核心邏輯與五態狀態機
- **五態執行狀態定義 (`SCHEDULE_STATUS`)**：
  1. `ON_TARGET`（完美達標）：完成率 $90\% \le \text{Ratio} \le 115\%$
  2. `EXCEEDED`（超額執行）：完成率 $\text{Ratio} > 115\%$
  3. `PARTIAL`（里程未滿）：完成率 $\text{Ratio} < 90\%$ 且執行里程 $>0$
  4. `MISSED`（缺席未跑）：課表日期已過期且里程為 0
  5. `UPCOMING`（待執行）：課表日期在未來
- **目標賽事智慧偵測演算法 (`detectTargetMilestone`)**：
  - 嚴格正則過濾：`/(測驗|比賽|馬拉松|半馬|全馬|決戰|大考|總驗收|race|marathon|test\b)/i` 或 `tags === 'RACE'`。
  - 自動剔除每日練習之距離代號（如 10K Q1、8K 輕鬆跑），防止誤判。
  - 動態產生倒數天數（$>0$ 顯示「決戰倒數 X 天」，$=0$ 顯示「🔥 今日決戰日！」，$<0$ 顯示「已完成」）。

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/utils/scheduleCalc.js](file:///c:/Antigravity_WS/Runner_Web/js/utils/scheduleCalc.js)
  - `evaluateScheduleItem(item, logs, today)`：行 [L110-L175](file:///c:/Antigravity_WS/Runner_Web/js/utils/scheduleCalc.js#L110-L175)，單列狀態評定與差異計算。
  - `calculateScheduleSummary(evaluatedItems)`：行 [L180-L230](file:///c:/Antigravity_WS/Runner_Web/js/utils/scheduleCalc.js#L180-L230)，課表總達成率與質量課執行率統計。
  - `detectTargetMilestone(schedule, logs)`：行 [L240-L326](file:///c:/Antigravity_WS/Runner_Web/js/utils/scheduleCalc.js#L240-L326)，目標大賽自動萃取引擎。
- **視圖整合**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L520-L555) (首頁 Banner) 與 [L1260-L1480](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L1260-L1480) (課表完整清單頁)。

---

### 模組 8：LocalStorage 本地快取機制與 TTL 過期控制 (Task T-13)

#### 1. 業務場景與目的
每次造訪頁面都重新呼叫 Google Sheets 會耗費頻寬、拖慢載入速度甚至引發 API 速率限制。透過 LocalStorage 快取，讓用戶在 1 小時內重複造訪可實現「毫秒級」開屏載入。

#### 2. 核心邏輯
- **版本化前綴 (`PREFIX`)**：使用 `runner_pulse_v6_` 作為 Key 前綴，程式架構升級時自動淘汰舊版本髒快取。
- **過期時間戳記 (TTL)**：寫入時附帶 `_timestamp` 與 `_ttl`。讀取時檢驗 `Date.now() - timestamp > ttl`，過期則主動失效。
- **無痕模式容錯 (Memory Fallback)**：當用戶在私人瀏覽或封鎖 Storage 時，自動降級為 JavaScript 記憶體 `Map`，保證系統不崩潰。

#### 3. 核心方法與程式碼對照
- **檔案路徑**：[js/services/storageService.js](file:///c:/Antigravity_WS/Runner_Web/js/services/storageService.js)
  - `set(key, data, ttlMs)`：行 [L25-L45](file:///c:/Antigravity_WS/Runner_Web/js/services/storageService.js#L25-L45)。
  - `get(key)`：行 [L47-L70](file:///c:/Antigravity_WS/Runner_Web/js/services/storageService.js#L47-L70)，檢查逾期並自動回傳 null。
- **設定檔配置**：[js/config.js](file:///c:/Antigravity_WS/Runner_Web/js/config.js#L32-L42)。

---

### 模組 9：RWD 響應式佈局、漢堡抽屜選單與防爆版設計 (Task T-14)

#### 1. 業務場景與目的
系統支援寬螢幕桌機（1920px+）、筆電（1024px~1440px）、iPad 平板（768px）與智慧型手機（375px~430px）。

#### 2. 響應式優化細節
1. **抽屜式導覽選單 (Mobile Drawer)**：寬度小於 768px 時，側邊欄收合為 `transform: translateX(-100%)`，點擊頂部漢堡圖示滑出，並加入毛玻璃半透明遮罩（`#sidebarBackdrop`），點擊遮罩外圍或切換分頁自動收合。
2. **多欄表格防爆版**：日誌總表（10 欄）與課表（9 欄）均外包 `.data-table-container`，啟用 `overflow-x: auto` 與 iOS 平滑滑動 `-webkit-overflow-scrolling: touch`。
3. **極窄螢幕 (< 480px) 保護**：自動隱藏麵包屑路徑冗餘文字，頂部按鈕轉為圖示優先，避免導覽列高度暴增。

#### 3. 核心方法與程式碼對照
- **樣式檔案**：[css/layout.css](file:///c:/Antigravity_WS/Runner_Web/css/layout.css#L274-L365)
  - `@media (max-width: 1024px)`：雙欄圖表轉為垂直單欄堆疊。
  - `@media (max-width: 768px)`：側邊欄抽屜化與漢堡按鈕顯現。
  - `@media (max-width: 480px)`：按鈕文字精簡與表格防擠壓設定。
- **DOM 事件綁定**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js#L87-L110) `toggleSidebar` 與 `sidebarBackdrop` 點擊關閉事件。

---

### 模組 10：無伺服器部署與 CI/CD 自動化同步 (Task T-15)

#### 1. 業務場景與目的
建立免主機維護、免負擔伺服器費用的永久可用線上服務，支援 Git Push 觸發全自動重新建置與發布。

#### 2. 雙平台部署架構
- **GitHub Pages**：
  - 儲存庫：`https://github.com/tobby0306/Runner_Web`
  - 分支來源：`main` 根目錄 (`/ (root)`)
  - 正式網址：`https://tobby0306.github.io/Runner_Web/`
- **Netlify (自動連動 CI/CD)**：
  - 專案名稱：`tobby-runner-web`
  - 部署觸發：GitHub Webhook（偵測 `main` 分支 push 自動觸發建置）
  - 正式網址：`https://tobby-runner-web.netlify.app`

---

### 模組 11：跑者生理基準自訂與全站動態重算 (Task T-EXT-01)

#### 1. 業務場景與目的
跑者隨著訓練週期進展（如從基礎期進入質量競賽期），跑力指數 (VDOT)、乳酸門檻心率 (LTHR) 與最大心率 (Max HR) 會隨之進步或微調。過去生理基準寫死於試算表常數中，跑者無法在網頁端自訂；本模組提供專屬自訂彈窗，支援跑者隨時調整個人參數，並即時重繪全站所有配速與心率區間。

#### 2. 商業邏輯與檢核規則
- **輸入欄位防呆規則 (Validation Rules)**：
  - `Runner Name`：字串長度 1~30 字元，不得為空。
  - `VDOT`：浮點數，有效區間 `20.0 ~ 85.0`（依 Jack Daniels Running Formula 數學有效域）。
  - `LTHR`：整數，有效區間 `100 ~ 220 bpm`（依 30 分鐘全力計時平均心率）。
  - `Max HR`：整數，有效區間 `120 ~ 240 bpm`。
  - **邊界防呆檢核**：`Max HR` 必須嚴格大於 `LTHR`（`maxHr > lthr`），否則拋出警示中斷儲存。
- **即時連動預覽 (Live Preview)**：彈窗輸入時即時動態計算 5 大心率區間閥值（Zone 1~5）與 5K 預估配速提示。
- **持久化機制**：以 JSON 格式儲存於 LocalStorage (`runner_profile_custom`)，系統重啟時優先載入。

#### 3. 核心方法與程式碼對照
- **資料存取層**：[js/services/storageService.js](file:///c:/Antigravity_WS/Runner_Web/js/services/storageService.js) `getRunnerProfile()`、`saveRunnerProfile()`、`resetRunnerProfile()`。
- **主控與事件**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js) `initSettingsModalEvents()`、`updateSettingsPreview()`、`handleSettingsSubmit()`。
- **彈窗標記與樣式**：[index.html](file:///c:/Antigravity_WS/Runner_Web/index.html) `#runnerSettingsModal`；[css/components.css](file:///c:/Antigravity_WS/Runner_Web/css/components.css) `.modal-container.modal-sm`。

---

### 模組 12：訓練日誌總表 RPE / TRIMP 欄位與分頁控制器 (Task T-EXT-02)

#### 1. 業務場景與目的
單純依靠配速與心率無法完全反映該次訓練對跑者自律神經與心肺系統的整體累積衝量。本模組補全客觀運動衝量 (TRIMP) 與主觀疲勞度 (RPE)，並為 200+ 筆歷史活動提供順暢的分頁控制器 (Pagination)，徹底解決單頁渲染上百筆 DOM 帶來的效能延遲。

#### 2. 核心運算公式與視覺化規格
- **Banister 運動衝量 (TRIMP, Training Impulse)**：
  $$\text{TRIMP} = D \times \Delta\text{HR} \times 0.64 \times e^{1.92 \times \Delta\text{HR}}$$
  其中 $D$ 為活動時間（分鐘），$\Delta\text{HR} = \frac{\text{HR}_{\text{avg}} - \text{HR}_{\text{rest}}}{\text{HR}_{\text{max}} - \text{HR}_{\text{rest}}}$ 為心率儲備儲量百分比。
  系統以數值 Badge 呈現：`0~50 (輕度)`、`50~100 (中度)`、`100~200 (高負荷)`、`>200 (極限)`。
- **Borg CR10 主觀自覺疲勞量表 (RPE, Rating of Perceived Exertion)**：
  依據心率強度與活動分類映射 1~10 級（例如 RPE 2 輕鬆修復、RPE 4-5 有氧巡航、RPE 7-8 乳酸門檻、RPE 9-10 全力衝刺），並搭配 Emoji 標籤與警示色。
- **分頁控制器規格**：
  - 支援每頁顯示筆數切換：`10 筆 / 頁`、`25 筆 / 頁`、`50 筆 / 頁`。
  - 智慧省略號演算法：當總頁數大於 7 頁時，自動顯示 `1 ... 4 5 6 ... 12` 模式。
  - 上一頁 / 下一頁邊界停用按鈕 (`disabled`)。

#### 3. 核心方法與程式碼對照
- **分頁計算與 DOM 渲染**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js) `renderTrainingLogsView()`、`renderPaginationControls()`。
- **樣式元件**：[css/components.css](file:///c:/Antigravity_WS/Runner_Web/css/components.css) `.pagination-controls`、`.page-btn`、`.page-size-select`。

---

### 模組 13：首頁五大心率/配速區間速查基準卡 (Task T-EXT-03)

#### 1. 業務場景與目的
跑者在每天出門跑步前，需要一眼看清當天各種課表（恢復跑、有氧長距離、節奏跑、間歇跑）對應的「目標心率範圍」與「配速區間」。本模組在儀表板首頁 Hero 卡片正下方，動態渲染 5 大區間速查尺 (Zone Benchmark Cards)，並支援「一鍵反向篩選日誌」。

#### 2. 生理學模型與互動邏輯
- 依據跑者當前 VDOT 與 LTHR，計算五大區間卡片：
  1. **Zone 1 修復跑 (Recovery)**: `< 85% LTHR`，恢復代謝。
  2. **Zone 2 有氧基礎 (Aerobic Easy)**: `85% ~ 89% LTHR`，微血管新生與燃脂基底。
  3. **Zone 3 馬拉松配速 (Tempo/Marathon)**: `90% ~ 94% LTHR`，節奏耐力。
  4. **Zone 4 乳酸門檻 (Threshold)**: `95% ~ 100% LTHR`，提升乳酸清除速率。
  5. **Zone 5 最大攝氧量間歇 (VO2 Max / Interval)**: `> 100% LTHR`，心肺輸出極限。
- **反向聯動**：點擊任意區間卡片，系統自動跳轉「訓練日誌清單」並帶入該訓練類型過濾器（例如點擊 Zone 4 卡片，自動篩選出所有 Threshold 訓練）。

#### 3. 核心方法與程式碼對照
- **運算邏輯**：[js/utils/zoneCalc.js](file:///c:/Antigravity_WS/Runner_Web/js/utils/zoneCalc.js) `computeZoneBenchmarkCards(profile)`。
- **卡片渲染與跳轉**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js) `renderDashboard()`。
- **樣式視覺**：[css/components.css](file:///c:/Antigravity_WS/Runner_Web/css/components.css) `.benchmark-bar-section`、`.benchmark-zone-card`。

---

### 模組 14：全域非阻塞 Toast 輕量互動動畫通知 (Task T-EXT-07)

#### 1. 業務場景與目的
原生的瀏覽器 `window.alert()` 會阻斷 JavaScript 執行緒與使用者介面互動，在行動端或進行資料重新整理時體驗極差。本模組實作輕量現代化、全域懸浮的 Toast 通知系統。

#### 2. 規格與互動機制
- **通知型態**：支援 4 種語意化等級：
  - `success`（綠色/打勾圖示）：儲存成功、連線成功、參數更新。
  - `info`（藍色/驚嘆號圖示）：系統資料載入中、快取提示。
  - `warning`（黃色/三角警示圖示）：Mock Data 模擬模式降級警告。
  - `danger`（紅色/錯誤叉叉圖示）：網路連線中斷、表單驗證失敗。
- **動畫與倒數機制**：
  - 預設持續 4200ms，底部附帶平滑進度條倒數動畫 (`.toast-progress`)。
  - **懸停暫停 (Hover Pause)**：滑鼠懸停於 Toast 上時自動暫停倒數計時，移開後恢復 1200ms 平滑關閉。
  - 手動關閉按鈕 (`&times;`)，平滑淡出與縮放退場 (`toast-hide`)。

#### 3. 核心方法與程式碼對照
- **全域 Method**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js) `showToast(message, type, duration)`。
- **向後相容**：`this.showAlert()` 自動轉接調用 `showToast()`。
- **樣式與動畫**：[css/components.css](file:///c:/Antigravity_WS/Runner_Web/css/components.css) `.toast-container`、`.toast-item`、`@keyframes toastProgress`。

---

### 模組 15：Google Sheets 跨來源發布對接與互動診斷彈窗 (Task T-EXT-08)

#### 1. 業務場景與目的
由於 Google 試算表預設的 `/export?format=csv` 下載連結不允許前端 JavaScript 進行跨來源存取 (CORS)，導致 GitHub Pages 上的靜態網頁持續處於 Mock Data 狀態。本模組整合官方公開發布端點，並提供頂部可點擊的資料連線狀態晶片與診斷彈窗 (`#dataSourceModal`)，給予跑者 1 分鐘自助發布指引與一鍵重試連線機制。

#### 2. 系統架構與操作規格
- **官方 CORS 端點架構**：
  `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?output=csv&gid=${gid}`
  Google CDN 會為已發布文件直接附加 `Access-Control-Allow-Origin: *`，支援全球任何靜態網頁直接 fetch，免金鑰、免憑證、免架設中繼伺服器。
- **診斷彈窗規格 (`#dataSourceModal`)**：
  - 點擊頂部導覽列 `#dataSourceStatus` 狀態晶片即可開啟診斷視窗。
  - 若處於 **MOCK 狀態**：以黃色警示說明 CORS 限制原因，並呈現 1 分鐘啟用步驟清單。
  - 若處於 **LIVE 狀態**：以綠色徽章顯示即時連線成功，並列出活動總筆數與最後同步時間戳記。
  - 提供快捷按鈕：【開啟 Google 試算表 &rarr;】與【🔄 立即重新連線】。

#### 3. 核心方法與程式碼對照
- **多通道擷取**：[js/services/sheetsService.js](file:///c:/Antigravity_WS/Runner_Web/js/services/sheetsService.js) `fetchSheetData()`。
- **診斷彈窗事件與渲染**：[js/app.js](file:///c:/Antigravity_WS/Runner_Web/js/app.js) `initDataSourceModalEvents()`、`openDataSourceModal()`。
- **HTML 結構**：[index.html](file:///c:/Antigravity_WS/Runner_Web/index.html) `#dataSourceStatus`、`#dataSourceModal`。

---

## 4. 架構師審查評估與維護操作指南 (Architect Review & Operations Manual)

### 4.1 架構審查總評與潛在風險分析 (Architectural Review & Risk Analysis)
依據 `@03_role_architect.md` 主架構師規範，針對近期新增模組與雲端資料存取層進行全面架構審查：

| 風險等級 | 影響模組/邏輯 | 問題描述 | 建議修正方案與目前落實狀態 |
|---|---|---|---|
| **高 (High)** | 模組 1 / 15: Google Sheets 擷取 | 靜態站直接 fetch `/export` 端點受限於 CORS，導致全站持續降級為 Mock Data | **已解決**：整合 Google 官方發布公開端點 (`pub?output=csv`)，附加原生 CORS 標頭，並導入五重自動備援管線 |
| **中 (Medium)** | 模組 1: 本地快取 (LocalStorage) | 試算表剛發布後，若使用者端保有舊版本快取，可能延遲看到最新日誌 | **已解決**：升級快取版本前綴至 `runner_pulse_v7_`，並於診斷彈窗與頂部提供「強制重新整理」一鍵覆蓋 |
| **中 (Medium)** | 模組 11: 跑者生理基準表單 | 跑者可能輸入負數、極端異常值（如 Max HR < LTHR），導致區間計算崩潰 | **已解決**：實作強嚴格驗證（VDOT 20~85、LTHR 100~220、MaxHR > LTHR），並於前端呈現行內錯誤提示 |
| **低 (Low)** | 模組 12: 日誌分頁控制器 | 若跑者篩選出 0 筆結果，分頁器可能計算產生 NaN 頁碼 | **已解決**：加入 `Math.max(1, Math.ceil(total / pageSize))` 防呆防溢保護 |
| **低 (Low)** | 模組 14: 全域 Toast 系統 | 多筆快速異步通知同時觸發時，Toast 可能堆疊超出畫面底部 | **已解決**：採用 `flex-direction: column-reverse` 與 4200ms 自動倒數銷毀機制 |

### 4.2 跑者常見維護操作指南

#### 1. 如何更新「下一個目標賽事」？
1. 打開你的 Google 試算表 **「課表」頁籤**。
2. 在新週期（例如年底）新增一列課表：
   - `Week`: `W1`
   - `Date`: `2026-12-20`
   - `Name`: `2026 台北馬拉松`
   - `Tags`: `RACE`
   - `備註與執行重點`: `🔥 目標 SUB 4 完賽！`
3. 打開線上網頁點擊「重新整理」，首頁倒數卡片就會**自動切換為台北馬拉松倒數**！

#### 2. 如果修改了前端網頁代碼，如何發布到線上？
在電腦打開終端機（CMD 或 PowerShell），輸入以下三行指令：
```cmd
cd C:\Antigravity_WS\Runner_Web
git add .
git commit -m "更新功能描述"
git push
```
按下 Enter 後，**GitHub Pages 與 Netlify 會在 10 秒內同步自動上線**！

#### 3. 如何將 Google 試算表發布到網路並取得 CORS 專屬金鑰？
若您更換了全新的試算表，或需要重新授權網頁直連：
1. 開啟目標 Google 試算表。
2. 點擊頂部功能表 **【檔案 (File)】** ➔ **【共用 (Share)】** ➔ **【發布到網路 (Publish to the web)】**。
3. 在彈出視窗中：
   - 範圍選擇：**【整份文件 (Entire Document)】**
   - 連結格式：選擇 **【逗號分隔值 (.csv)】**
   - 點擊藍色 **【發布 (Publish)】** 按鈕並確認「確定要發布這個選項嗎？」。
4. 發布後 Google 會提供一串網址，例如：
   `https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pubhtml`
5. 取出其中的 `2PACX-1v...` 金鑰，貼入 `js/config.js` 的 `PUBLISHED_ID` 欄位中，Push 上 GitHub 即可永久生效！

---
*(本手冊完畢，由 PM、SA 與系統架構師聯合認證，做為 Runner Pulse Analytics 專案之標準工程基準規格書)*
