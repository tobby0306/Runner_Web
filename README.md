# Runner Pulse Analytics (跑步數據解析與 VDOT 心率分析器)

基於純 HTML5 + Vanilla JS (ES Modules) + Chart.js 的輕量高質感跑者數據儀表板，專為分析 Garmin 跑步日誌、VDOT 跑力演算法與心率區間監控打造。

---

## 📁 專案架構目錄

```text
Runner_Web/
├── .rules/                     # 專案角色規範 (Architect, Frontend, PM, SA, UXUI, QA, etc.)
├── css/
│   ├── index.css               # 全域 Design Tokens、色票、跑者暗色主題、字型
│   ├── layout.css              # App Shell、響應式側邊欄、格狀儀表板佈局
│   └── components.css          # 卡片、按鈕、三態狀態標籤、表格、載入動態
├── js/
│   ├── app.js                  # 應用程式入口控制器、視圖路由、事件處理
│   ├── config.js               # Google Sheets ID、GID 映射表、跑者基準常數
│   ├── services/
│   │   ├── sheetsService.js    # Google Sheets CSV 連線、快取判定與三態平滑降級
│   │   └── storageService.js   # LocalStorage TTL (1小時) 封裝服務
│   ├── utils/
│   │   ├── csvParser.js        # RFC-4180 標準 CSV 解析器 (支援逗號與引號嵌套)
│   │   └── formatters.js       # 時間 (HH:MM:SS)、配速 (sec/km)、日期轉換工具
│   └── mock/
│       └── mockData.js         # 規格書 3 大頁籤 (日誌/區間/課表) 高擬真測試數據
├── index.html                  # 主 SPA 入口頁面 (引進 Google Fonts 與 Chart.js v4)
├── serve.py                    # 本地輕量開發伺服器啟動器 (Python 3.12)
├── RUNNER_PULSE_SYSTEM_SPEC_AND_MANUAL.md # 系統規格與維護開發手冊 (v2.2)
└── README.md                   # 專案說明文件
```

---

## 🚀 快速啟動

專案無需依賴 Node.js 或打包工具，支援以下任一種方式開啟：

### 方式 1：使用內建 Python 伺服器（推薦）
在終端機中執行：
```bash
python serve.py
```
接著在瀏覽器打開：`http://localhost:3000`

### 方式 2：使用任何靜態 HTTP 伺服器
```bash
python -m http.server 3000
```

---

## ⚡ 核心功能與已完成規格 (Task T-01)

1. **三態資料連線管理 (Three-tier Data Fallback)**：
   - **LIVE**：嘗試連線 Google Sheets CSV API 即時資料。
   - **CACHED**：自動讀取 1 小時以內的 LocalStorage 乾淨快取。
   - **MOCK**：跨網域 CORS 受限或離線時，自動平滑降級至高品質 Mock Data 確保系統介面與圖表邏輯 100% 可用。
2. **現代跑者暗色科技美學 (Cyber Runner UI)**：
   - 採用 Deep Charcoal (`#0A0E17`) 底色、Electric Cyan (`#00F2FE`) 與 Energetic Orange (`#FF6B4A`) 強調色。
   - 整合 Google Fonts (`Outfit`, `Inter`) 與 Chart.js v4.4 CDN。
   - 完整的 RWD 手機版摺疊側邊欄設計。
