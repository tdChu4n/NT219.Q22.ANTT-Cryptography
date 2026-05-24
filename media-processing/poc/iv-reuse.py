import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

def xor_bytes(b1, b2):
    """Hàm thực hiện phép XOR giữa 2 chuỗi byte"""
    return bytes(x ^ y for x, y in zip(b1, b2))

print("======================================================")
print("🔴 PoC E2: TẤN CÔNG IV REUSE TRONG AES-CTR 🔴")
print("======================================================\n")

# 1. Khởi tạo Kịch bản: Cùng 1 Key và Cùng 1 IV (LỖI CHÍ MẠNG)
key = os.urandom(16) # Khóa bí mật (128-bit)
iv = os.urandom(16)  # IV dùng chung cho cả 2 luồng

print(f"[!] Đã khởi tạo Key (ẩn) và IV dùng chung: {iv.hex()[:16]}...\n")

# 2. Hai đoạn video thô (Plaintext) giả lập
# Giả sử Hacker biết được định dạng header của đoạn 1 (vd: MP4 Header)
p1 = b"moof_header: [SECRET_FRAME_DATA]"
p2 = b"moof_header: [VICTIM_CREDENTIAL]"

print(f"[+] Dữ liệu gốc 1 (P1): {p1}")
print(f"[+] Dữ liệu gốc 2 (P2): {p2}\n")

# 3. Server mã hóa (CENC) nhưng phạm sai lầm dùng chung IV
cipher1 = Cipher(algorithms.AES(key), modes.CTR(iv))
encryptor1 = cipher1.encryptor()
c1 = encryptor1.update(p1) + encryptor1.finalize()

cipher2 = Cipher(algorithms.AES(key), modes.CTR(iv))
encryptor2 = cipher2.encryptor()
c2 = encryptor2.update(p2) + encryptor2.finalize()

print(f"[-] Ciphertext 1 (C1): {c1.hex()[:32]}...")
print(f"[-] Ciphertext 2 (C2): {c2.hex()[:32]}...\n")

# 4. HACKER TẤN CÔNG: Lấy C1 XOR C2
print("[*] HACKER TIẾN HÀNH TẤN CÔNG (Bắt gói tin C1 và C2 trên mạng)...")
c1_xor_c2 = xor_bytes(c1, c2)

# 5. Hacker khôi phục dữ liệu:
# Vì C1 ^ C2 = P1 ^ P2. 
# Nếu Hacker biết (hoặc đoán được) một phần P1 (ví dụ header file luôn bắt đầu bằng chữ 'moof_header: ')
known_p1 = b"moof_header: "

print(f"[*] Hacker đoán được Header của P1 là: {known_p1}")
# Suy ra P2 = (C1 ^ C2) ^ P1
recovered_p2_part = xor_bytes(c1_xor_c2[:len(known_p1)], known_p1)

print("\n======================================================")
print("🟢 KẾT QUẢ KHÔI PHỤC DỮ LIỆU:")
print(f"-> Một phần của P2 đã bị lộ: {recovered_p2_part}")
print("======================================================")
print("✅ CHỨNG MINH: IV Reuse làm lộ nội dung bản rõ mà KHÔNG CẦN CÓ KEY!")