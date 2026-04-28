import secrets
import json

def generate_secure_hex(bytes_length):
    """Sử dụng CSPRNG để sinh chuỗi hex ngẫu nhiên an toàn."""
    return secrets.token_hex(bytes_length)

def main():
    # 1. Content Key (16 Bytes = 128 bit)
    # Đây là khóa AES-128 dùng để mã hóa video
    content_key = generate_secure_hex(16)
    
    # 2. Key ID - KID (16 Bytes = 128 bit)
    # KID được đính kèm vào phần header (moov box) của video định dạng MP4/DASH.
    # Player sẽ đọc KID này và gửi yêu cầu lên License Server để xin Content Key tương ứng.
    kid = generate_secure_hex(16)
    
    # 3. Initialization Vector - IV (8 hoặc 16 Bytes)
    # Trong AES-CTR chuẩn CENC, IV thường dùng 8 bytes hoặc 16 bytes.
    # CHÚ Ý BẢO MẬT: IV phải là DUY NHẤT cho mỗi lần mã hóa (tránh Nonce Reuse).
    iv = generate_secure_hex(16)

    keys_data = {
        "KID": kid,
        "Key": content_key,
        "IV": iv
    }

    # In ra terminal để dán trực tiếp vào lệnh shaka-packager
    print("=== THÔNG SỐ TRUYỀN VÀO SHAKA-PACKAGER ===")
    print(f"--enable_raw_key_encryption")
    print(f"--keys label=AUDIO:key_id={kid}:key={content_key}:iv={iv}")
    print(f"--keys label=VIDEO:key_id={kid}:key={content_key}:iv={iv}")
    print("==========================================\n")

    # Lưu ra file JSON để đồng bộ với License Server
    with open("license_keys.json", "w") as f:
        json.dump(keys_data, f, indent=4)
    print("Đã lưu khóa vào 'license_keys.json'.")

if __name__ == "__main__":
    main()