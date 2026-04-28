import os
import json

def generate_key_rotation_set(num_periods=4):
    # Cấu hình các file đầu vào (khớp với file bạn đã tạo ở bước trước)
    video_input = "video_1080p.mp4"
    audio_input = "audio.m4a"
    
    keys_list = []
    shaka_keys_parts = []

    print("--- ĐANG SINH 4 BỘ KHÓA CHO KEY ROTATION ---")
    
    for i in range(num_periods):
        kid = os.urandom(16).hex()
        key = os.urandom(16).hex()
        iv = os.urandom(16).hex()
        
        keys_list.append({
            "period": i + 1,
            "KID": kid,
            "Key": key,
            "IV": iv
        })
        
        # Tạo chuỗi tham số cho Shaka Packager
        # Gán nhãn VIDEO cho cả 4 bộ khóa để xoay vòng
        shaka_keys_parts.append(f"label=VIDEO:key_id={kid}:key={key}:iv={iv}")
        
    # Thêm khóa cho Audio (dùng chung khóa của Period 1)
    shaka_keys_parts.append(f"label=AUDIO:key_id={keys_list[0]['KID']}:key={keys_list[0]['Key']}:iv={keys_list[0]['IV']}")

    # Lưu vào file JSON cho Ân nạp Database
    with open('license_keys.json', 'w') as f:
        json.dump(keys_list, f, indent=4)
    
    print(f"✔ Đã lưu {num_periods} bộ khóa vào file 'license_keys.json'")
    print("-" * 50)
    print("\n[COPY CÂU LỆNH DƯỚI ĐÂY VÀO DOCKER TERMINAL]:\n")
    
    # Tạo câu lệnh Shaka hoàn chỉnh
    keys_param = ",".join(shaka_keys_parts)
    command = (
        f"packager \\\n"
        f"in={video_input},stream=video,init_segment=output/v_init.mp4,segment_template='output/v_$Number$.m4s',drm_label=VIDEO \\\n"
        f"in={audio_input},stream=audio,init_segment=output/a_init.mp4,segment_template='output/a_$Number$.m4s',drm_label=AUDIO \\\n"
        f"--enable_raw_key_encryption \\\n"
        f"--keys {keys_param} \\\n"
        f"--period_duration_seconds 10 \\\n"
        f"--protection_scheme cenc \\\n"
        f"--mpd_output output/manifest_rotation.mpd"
    )
    print(command)
    print("\n" + "-" * 50)

if __name__ == "__main__":
    generate_key_rotation_set()