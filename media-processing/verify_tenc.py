import os
import binascii

def find_box(data, box_type):
    offset = 0
    while offset < len(data):
        size = int.from_bytes(data[offset:offset+4], byteorder='big')
        if size < 8:
            break
        btype = data[offset+4:offset+8].decode('ascii', errors='ignore')
        
        if btype == box_type:
            return data[offset:offset+size]
        
        # If it's a container box, we could search inside, but for simplicity, we do a raw search below
        offset += size
    return None

def main():
    print("="*50)
    print("TASK T1.5: KIỂM TRA HEADER MÃ HÓA (tenc / KID)")
    print("="*50)
    
    init_path = "../packager/output/init-stream0.m4s"
    if not os.path.exists(init_path):
        print(f"[Lỗi] Không tìm thấy file {init_path}")
        return

    with open(init_path, 'rb') as f:
        data = f.read()

    # Tìm raw bytes của tenc box (Track Encryption Box)
    tenc_idx = data.find(b'tenc')
    if tenc_idx != -1:
        print("[+] Đã tìm thấy Box 'tenc' (Track Encryption Box)!")
        
        # Cấu trúc tenc:
        # 4 bytes size
        # 4 bytes 'tenc'
        # 1 byte version + 3 bytes flags
        # 3 bytes reserved (hoặc khác tùy version) + 1 byte default_IV_size
        # 16 bytes default_KID
        
        # Bắt đầu từ 'tenc', default_KID thường nằm ở offset + 8 (nếu tính từ chữ 'tenc', là + 8)
        # Chi tiết: version(1) + flags(3) + reserved(3) + default_IV_size(1) = 8 bytes.
        kid_start = tenc_idx + 4 + 8
        kid_bytes = data[kid_start:kid_start+16]
        kid_hex = binascii.hexlify(kid_bytes).decode('ascii')
        
        print(f"[+] Extracted KID từ file video : {kid_hex}")
        
        # Kiểm tra đối chiếu với license_keys.json
        import json
        key_path = "license_keys.json"
        if os.path.exists(key_path):
            with open(key_path, 'r') as kf:
                keys = json.load(kf)
                if keys.get("KID").lower() == kid_hex.lower():
                    print("[+] MATCH: KID trong video khớp chính xác với KID trong license_keys.json!")
                else:
                    print(f"[-] MISMATCH: KID file config là {keys.get('KID')}")
    else:
        print("[-] KHÔNG tìm thấy Box 'tenc'. Video có thể chưa được mã hóa CENC.")

    print("\n[Mẹo] Để xuất toàn bộ cấu trúc như yêu cầu đồ án, hãy tải Bento4 và chạy lệnh:")
    print("      mp4dump.exe init-stream0.m4s")

if __name__ == "__main__":
    main()
