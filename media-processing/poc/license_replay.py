import os
import hashlib

# Mảng lưu trữ nội dung log để xuất ra file
log_content = []

def log(msg):
    print(msg)
    log_content.append(msg)

log("======================================================")
log("🔴 PoC E5: TẤN CÔNG LICENSE REPLAY (NONCE 1 LẦN) 🔴")
log("======================================================\n")

# Giả lập Database lưu trữ các Nonce đã sử dụng của KMS (Key Management System)
used_nonces = set()

def kms_license_server(request_data):
    """Giả lập máy chủ cấp phép bản quyền (License Server)"""
    user = request_data.get('user')
    nonce = request_data.get('nonce')
    
    log(f"[KMS Server] Nhận yêu cầu cấp Key từ '{user}' - Nonce: {nonce}")
    
    # Kiểm tra Nonce (Cơ chế chống Replay Attack)
    if nonce in used_nonces:
        log("[KMS Server] ❌ TỪ CHỐI: Phát hiện Nonce đã hết hạn hoặc bị sử dụng lại (Replay)!")
        return {"status": 401, "error": "401 Unauthorized - Nonce Expired"}
    
    # Nếu Nonce mới -> Lưu vào blacklist và cấp Key
    used_nonces.add(nonce)
    log("[KMS Server] ✅ HỢP LỆ: Nonce mới. Chấp nhận cấp License Key!")
    return {"status": 200, "license_key": "AES_KEY_9989adb99119c956"}

# ---------------------------------------------------------
# KỊCH BẢN TẤN CÔNG
# ---------------------------------------------------------
log("[1] Lộc (Người dùng Premium) tạo yêu cầu xin Key hợp lệ...")
valid_nonce = hashlib.md5(os.urandom(16)).hexdigest()[:8]
valid_request = {"user": "loc_premium", "nonce": valid_nonce}

log(" -> Gửi Request 1 (Hợp lệ):")
resp1 = kms_license_server(valid_request)
log(f" -> Kết quả trả về: {resp1}\n")

log("[2] HACKER đánh cắp gói tin Request 1 và thực hiện REPLAY ATTACK...")
log(" -> Hacker gửi lại Request 2 (Copy y hệt Request 1):")
resp2 = kms_license_server(valid_request)

log("\n======================================================")
log("🟢 KẾT QUẢ TỪ LOG CỦA MÁY CHỦ (KMS):")
log(f"Status Code: {resp2['status']}")
log(f"Message: {resp2.get('error')}")
log("======================================================")
log("✅ KẾT LUẬN: Đã chặn thành công Replay Attack nhờ cơ chế Nonce 1 lần!")

# Tự động xuất log ra file để nộp Deliverable
with open("poc/e5_replay_log.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(log_content))
log("\n[!] Đã tự động xuất file báo cáo: poc/e5_replay_log.txt")