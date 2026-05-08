## E7 — Tổng hợp hạn chế Watermarking (collusion, analog re-capture)

### 1) Bối cảnh: Watermarking chỉ là “giảm thiểu”

- DRM/CENC/AES-CTR giúp **không tải được ciphertext về để xem**.
- Nhưng trước **Analog Hole** (quay màn hình / HDMI capture), mật mã không thể chặn tuyệt đối.
- Watermarking được dùng để **truy vết nguồn rò rỉ**, không phải để “chống copy” tuyệt đối.

---

### 2) Các hạn chế chính (theo threat model)

#### (A) Re-encode / Transcoding
- **Điểm yếu**: watermark miền tần số phụ thuộc vào quantization; nén mạnh làm lật bit.
- **Giảm thiểu**: redundancy + vote đa frame; chọn tham số Δ phù hợp.
- **Thông điệp**: bền với nén vừa; không bền với nén cực mạnh hoặc pipeline upload nhiều tầng.

#### (B) Geometric transforms (crop/rotate/keystone)
- **Điểm yếu**: lưới block 8×8 bị lệch → detector đơn giản đọc sai hàng loạt.
- **Giảm thiểu** (ngoài scope PoC):
  - sync/anchor pattern để tự căn chỉnh;
  - grid search (offset/scale/rotation);
  - feature-based alignment (ORB/SIFT) rồi mới đọc watermark.

#### (C) Collusion attacks
- **Mô hình**: attacker có nhiều bản cùng nội dung nhưng watermark khác nhau.
- **Kỹ thuật**: average/median theo pixel hoặc theo thời gian để triệt dấu watermark.
- **Hệ quả**: watermark “per-user naïve” dễ suy yếu → mất khả năng truy vết hoặc truy vết sai.
- **Giảm thiểu** (ngoài scope PoC):
  - collusion-resistant fingerprinting codes (vd: Tardos);
  - nhúng theo nhiều segment/time-slices, tăng chi phí collusion.

#### (D) Analog re-capture / Screen recording
- **Tác động**: moiré/rolling shutter, motion blur, auto-exposure, noise + re-encode.
- **Hệ quả**: watermark DCT đơn giản giảm detectability rõ rệt.
- **Thông điệp**: forensic watermark là **best-effort**, không thể “đảm bảo 100%” trong analog.

#### (E) False positives và chọn ngưỡng phát hiện
- **Rủi ro**: ngưỡng thấp → nội dung không watermark có thể khớp ngẫu nhiên một phần.
- **Giảm thiểu**:
  - payload dài (ví dụ 256 bit), vote đa frame;
  - đo precision với nhiều “user giả” để ước lượng FP.

---

### 3) Gợi ý nội dung slide (demo-friendly)

- **Slide 1**: Analog Hole → vì sao DRM không đủ, cần forensic watermark.
- **Slide 2**: Pipeline nhúng: UserID → HMAC → bits → DCT mid-frequency.
- **Slide 3**: Detect: vote theo block + vote theo frame.
- **Slide 4**: Robustness (bảng kết quả): re-encode/blur (pass) vs crop/rotate (fail).
- **Slide 5**: Hạn chế E7: collusion + analog recapture + geometric transforms + FP threshold.
- **Slide 6 (optional)**: hướng production: sync/anchor, Tardos code, alignment, spread-spectrum.

