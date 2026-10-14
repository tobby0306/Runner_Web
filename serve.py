"""
Runner Pulse Analytics - Local Development Server & API Proxy
支援靜態資源託管與 Google Sheets API 後端代理，預防前端跨來源 (CORS) 限制
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import time
import os

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
SPREADSHEET_ID = '1DahiYbLvl4zR6-5EABCSwTATCtkP7N3IywSxWo5JKas'

# 後端記憶體快取 (TTL: 1 小時)
API_CACHE = {}
CACHE_TTL = 3600

# 白名單 GID 防護 (預防 SSRF 與非法查詢)
ALLOWED_GIDS = {
    '0': '訓練日誌',
    '1124408140': '訓練區間',
    '196879307': '課表'
}

class RunnerHttpHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 1. 系統健康檢查 API
        if parsed.path == '/api/health':
            self._handle_health()
            return

        # 2. Google Sheets CSV 代理 API
        if parsed.path == '/api/sheets':
            self._handle_sheets_proxy(parsed.query)
            return

        # 預設：靜態檔案託管
        super().do_GET()

    def _handle_health(self):
        payload = {
            "status": "healthy",
            "service": "Runner Pulse Analytics Dev Server",
            "timestamp": int(time.time()),
            "cached_tabs": list(API_CACHE.keys())
        }
        data = json.dumps(payload).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _handle_sheets_proxy(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        gid = params.get('gid', ['0'])[0].strip()

        # 輸入參數驗證 (Input Validation)
        if gid not in ALLOWED_GIDS:
            self._send_json_error(400, "INVALID_GID", f"不合法的 GID 參數。白名單範圍: {list(ALLOWED_GIDS.keys())}")
            return

        now = time.time()
        # 檢查快取
        if gid in API_CACHE:
            cached_data, cached_time = API_CACHE[gid]
            if now - cached_time < CACHE_TTL:
                self._send_csv_response(cached_data, from_cache=True)
                return

        # 發送後端請求至 Google Sheets
        remote_url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={gid}"
        try:
            req = urllib.request.Request(
                remote_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RunnerPulseAnalytics/1.0'
                }
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                if response.status != 200:
                    self._send_json_error(502, "UPSTREAM_ERROR", f"Google Sheets 回應狀態碼非 200: {response.status}")
                    return
                raw_bytes = response.read()

            # 寫入快取
            API_CACHE[gid] = (raw_bytes, now)
            self._send_csv_response(raw_bytes, from_cache=False)

        except Exception as e:
            # 發生例外時檢查過期快取作為 fallback
            if gid in API_CACHE:
                cached_data, _ = API_CACHE[gid]
                self._send_csv_response(cached_data, from_cache=True)
                return
            self._send_json_error(502, "UPSTREAM_CONNECTION_FAILED", f"連線 Google Sheets 失敗: {str(e)}")

    def _send_csv_response(self, data_bytes, from_cache=False):
        self.send_response(200)
        self.send_header('Content-Type', 'text/csv; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-Data-Source', 'Cache' if from_cache else 'Live-Google-Sheets')
        self.send_header('Content-Length', str(len(data_bytes)))
        self.end_headers()
        self.wfile.write(data_bytes)

    def _send_json_error(self, status_code, code, message):
        payload = {
            "error": {
                "code": code,
                "message": message,
                "timestamp": int(time.time())
            }
        }
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        # 靜態檔案快取控制
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), RunnerHttpHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=======================================================")
        print(" Runner Pulse Analytics 本地開發伺服器與 API Proxy 已啟動")
        print(f" 靜態首頁: {url}")
        print(f" 代理端點: {url}/api/sheets?gid=0")
        print(" 按 Ctrl+C 可停止伺服器")
        print("=======================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已正常停止。")

if __name__ == "__main__":
    main()
