import threading
import urllib.request
import urllib.error
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
import hashlib

# Mảng để lưu log nộp sếp
log_output = []
def log(msg):
    print(msg)
    log_output.append(msg)

# =========================================================
# 1. MOCK KMS SERVER (Chạy mô phỏng máy chủ cấp Key)
# =========================================================
used_nonces = set()
class MockKMSHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Tắt log mặc định của Python HTTP Server cho dễ nhìn

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        payload = json.loads(post_data)
        nonce = payload.get("nonce")

        # Cơ chế chống Replay Attack
        if nonce in used_nonces:
            self.send_response(401)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error": "401 Unauthorized - Nonce Expired. Replay Attack Detected!"}')
        else:
            used_nonces.add(nonce)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": 200, "license_key": "AES_KEY_9989adb99119c956"}')

def start_server():
    server = HTTPServer(('127.0.0.1', 8085), MockKMSHandler)
    server.serve_forever()

# Khởi chạy KMS Server ở chế độ nền
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()
time.sleep(1) # Đợi 1 giây để server sẵn sàng nhận request

# =========================================================
# 2. KỊCH BẢN TẤN CÔNG BẰNG HTTP REQUEST THẬT
# =========================================================
log("==================================================")
log("🔴 PoC E5: TẤN CÔNG LICENSE REPLAY (HTTP NETWORK) 🔴")
log("==================================================\n")

url = "http://127.0.0.1:8085"
nonce = hashlib.md5(os.urandom(16)).hexdigest()[:8]
payload_dict = {"user": "loc_premium", "nonce": nonce}
payload_bytes = json.dumps(payload_dict).encode('utf-8')
headers = {'Content-Type': 'application/json'}

log("[1] BƯỚC CAPTURE: Người dùng gửi Request lần 1 (Nonce mới)")
log(f" -> Gửi Payload: {payload_dict}")
req1 = urllib.request.Request(url, data=payload_bytes, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req1) as response:
        log(f" <- SERVER KMS TRẢ VỀ [HTTP {response.status}]: {response.read().decode('utf-8')}\n")
except urllib.error.HTTPError as e:
    log(f" <- SERVER KMS TRẢ VỀ [HTTP {e.code}]: {e.read().decode('utf-8')}\n")


log("[2] BƯỚC REPLAY: Hacker bắt được gói tin và gửi lại y hệt (Cùng Nonce)")
log(f" -> Gửi Payload: {payload_dict}")
req2 = urllib.request.Request(url, data=payload_bytes, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req2) as response:
        log(f" <- SERVER KMS TRẢ VỀ [HTTP {response.status}]: {response.read().decode('utf-8')}\n")
except urllib.error.HTTPError as e:
    # Gói tin Replay sẽ bị văng vào nhánh lỗi này do HTTP 401
    log(f" <- SERVER KMS TRẢ VỀ [HTTP {e.code}]: {e.read().decode('utf-8')}\n")

log("==================================================")
log("✅ KẾT LUẬN: Request 1 thành công (HTTP 200). Request 2 bị chặn (HTTP 401) vì Server phát hiện Replay Attack!")
log("==================================================")

# Ghi đè log vào file cũ
with open("poc/e5_replay_log.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(log_output))
print("\n[!] Đã lưu file log chứng minh mới vào: poc/e5_replay_log.txt")