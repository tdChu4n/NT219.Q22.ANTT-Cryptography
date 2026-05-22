# PoC E3: Mô phỏng Key Extraction Widevine L3 (Memory Scraping)

## 1. Mục tiêu
PoC này được thiết kế trong môi trường kiểm soát (Controlled PoC) nhằm minh họa lỗ hổng cốt lõi của **Widevine L3 (Software DRM)** mà không vi phạm các nguyên tắc pháp lý và an toàn bảo mật (không tấn công vào Chrome hay DRM module thật).

## 2. Kịch bản mô phỏng
* **Mock L3 Player:** Đóng vai trò là tiến trình giải mã bằng phần mềm, nơi Content Key buộc phải nằm trong bộ nhớ (User-Space RAM) để CPU xử lý.
* **Frida Attacker:** Sử dụng Dynamic Instrumentation để can thiệp (attach) vào tiến trình, quét bộ nhớ và trích xuất Content Key.

## 3. Kết luận
* **Attack Surface của L3:** Môi trường L3/Software có bề mặt tấn công (attack surface) rất cao. Khi khóa giải mã đi qua vùng nhớ User-Space của ứng dụng, các công cụ như Frida hoặc Cheat Engine hoàn toàn có thể quét (memory scraping) và kết xuất (dump) khóa ra ngoài.
* **Sự ưu việt của L1/TEE:** Ngược lại, với Widevine L1 (Hardware DRM), toàn bộ quá trình giải mã diễn ra trong vùng bảo mật TEE (Trusted Execution Environment). Khóa giải mã không bao giờ xuất hiện ở RAM User-Space, do đó kỳ vọng không thể dump được bằng phương pháp này.