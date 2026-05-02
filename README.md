# 🔐 Bảo vệ Bản quyền Nội dung Đa phương tiện bằng Mật mã học

> **NT219 - Mật mã học | Đồ án Capstone**
>
> Xuất phát từ ngữ cảnh ứng dụng nền tảng phân phối nội dung đa phương tiện (streaming media) — phân tích đặc thù của dữ liệu media, xác định bài toán **chống sao chép nội dung (copyright protection)** là trọng tâm, và thiết kế giải pháp mật mã phù hợp.

---

## 📋 Mục lục

- [Ngữ cảnh ứng dụng — Nội dung đa phương tiện](#-ngữ-cảnh-ứng-dụng--nội-dung-đa-phương-tiện)
- [Bài toán cốt lõi — Chống sao chép nội dung](#-bài-toán-cốt-lõi--chống-sao-chép-nội-dung)
- [Thiết kế giải pháp mật mã](#-thiết-kế-giải-pháp-mật-mã)
- [Kiến trúc mật mã](#-kiến-trúc-mật-mã)
- [Chi tiết cơ chế mật mã](#-chi-tiết-cơ-chế-mật-mã)
- [Các giao thức bảo vệ nội dung trên nền tảng thực tế](#-các-giao-thức-bảo-vệ-nội-dung-trên-nền-tảng-thực-tế)
- [Kịch bản tấn công & Phòng thủ](#-kịch-bản-tấn-công--phòng-thủ)
- [Watermarking — Giải pháp giảm thiểu](#-watermarking--giải-pháp-giảm-thiểu)
- [Thách thức phía Client](#-thách-thức-phía-client)
- [Công nghệ sử dụng](#️-công-nghệ-sử-dụng)
- [Cài đặt & Chạy thử](#-cài-đặt--chạy-thử)
- [Thực nghiệm & Đánh giá](#-thực-nghiệm--đánh-giá)
- [Timeline](#-timeline)
- [Thành viên nhóm](#-thành-viên-nhóm)

---

## 🎬 Ngữ cảnh ứng dụng — Nội dung đa phương tiện

### Nội dung đa phương tiện là gì?

Nội dung đa phương tiện (multimedia content) bao gồm **video, audio, hình ảnh** — là tài sản số có giá trị thương mại cao trên các nền tảng phân phối nội dung (Netflix, Spotify, Apple TV+, YouTube Premium...). Khác với dữ liệu thông thường (văn bản, file nhị phân), nội dung đa phương tiện có **các đặc thù riêng** ảnh hưởng trực tiếp đến thiết kế giải pháp mật mã:

| Đặc thù | Mô tả | Ảnh hưởng đến mật mã |
|---|---|---|
| **Dung lượng cực lớn** | Một bộ phim 1080p ~ 2-5 GB, 4K ~ 10-20 GB | Không thể mã hóa toàn khối (block cipher thuần) — cần **mã dòng (stream cipher)** hoặc **AES ở chế độ dòng (CTR mode)** để mã hóa nhanh, song song |
| **Phát theo thời gian thực** | Người dùng xem liên tục, không chờ tải hết | Phải **giải mã từng segment** ngay khi nhận, không giải mã toàn bộ trước |
| **Cần seek/tua nhanh** | Người dùng nhảy đến phút 45 mà không cần giải mã từ đầu | Cần chế độ mã hóa hỗ trợ **random access** — AES-CTR cho phép giải mã bất kỳ block nào độc lập |
| **Đa nền tảng** | Chrome, Safari, iOS, Android, Smart TV, Xbox... | Mỗi nền tảng có **giao thức DRM riêng** (Widevine, FairPlay, PlayReady) — cần chuẩn mã hóa chung (CENC) |
| **Giá trị bản quyền cao** | Một bộ phim tốn hàng triệu USD sản xuất | **Chống sao chép (copyright protection)** là yêu cầu sống còn — rò rỉ 1 bộ phim = thiệt hại lớn |
| **Dữ liệu có tính dư thừa** | Các frame video liền kề rất giống nhau | Nếu dùng ECB mode → lộ pattern. Phải dùng chế độ mã hóa **che dấu pattern** (CTR, CBC) |

### Tại sao không đơn giản là "mã hóa file rồi gửi"?

Với file thông thường (PDF, ZIP), ta có thể mã hóa toàn bộ → gửi → client giải mã toàn bộ → dùng. Nhưng với video streaming, cách này **không khả thi** vì:

1. **Không thể chờ tải hết**: Video 5 GB mà phải tải xong mới giải mã → trải nghiệm tệ
2. **Client lưu file giải mã = sao chép thành công**: Nếu client giải mã ra file rõ trên ổ đĩa → đã copy xong
3. **AES-CBC/ECB cần giải tuần tự**: Không hỗ trợ seek/tua — phải giải mã từ đầu đến giữa phim

→ **Giải pháp bắt buộc**: Thiết kế dữ liệu dưới dạng **segment nhỏ**, truyền bằng **streaming protocol**, giải mã **trong bộ nhớ (buffer)** rồi phát ngay, **KHÔNG BAO GIỜ ghi file rõ xuống ổ đĩa**.

---

## 🎯 Bài toán cốt lõi — Chống sao chép nội dung

**Mục tiêu số 1 của toàn bộ hệ thống**: Người dùng **chỉ được phép xem** nội dung trên nền tảng, **không thể sao chép, tải xuống, hay chiết xuất** nội dung ra ngoài hệ thống.

### Các lớp bảo vệ chống sao chép

```
Lớp 1: THIẾT KẾ DỮ LIỆU DẠNG SEGMENT
       Video không tồn tại dưới dạng file hoàn chỉnh
       → Chia thành hàng trăm segment nhỏ (2-10 giây/segment)
       → Mỗi segment được mã hóa riêng biệt

Lớp 2: MÃ HÓA MỖI SEGMENT (AES-128-CTR)
       Mỗi segment là một ciphertext riêng
       → Tải về chỉ được dữ liệu mã hóa, không phát được
       → Mỗi segment có IV riêng, Key riêng hoặc chung theo policy

Lớp 3: STREAMING — GIẢI MÃ TRONG BUFFER, KHÔNG GHI XUỐNG Ổ ĐĨA
       Client nhận segment → giải mã trong RAM buffer → phát ngay → xóa buffer
       → Video rõ KHÔNG BAO GIỜ tồn tại dạng file trên thiết bị

Lớp 4: BẢO VỆ KHÓA (KEY PROTECTION)
       Content Key không bao giờ lộ ra ngoài TEE phần cứng
       → Key mã hóa 2 lớp khi truyền (RSA + TLS)
       → Giải mã Key chỉ xảy ra trong chip phần cứng (TEE)

Lớp 5: QUẢN LÝ QUYỀN TRUY CẬP (ACCESS CONTROL)
       Chỉ user có quyền (đã mua/đăng ký) mới được cấp Key
       → License Server kiểm tra entitlement trước khi trả Key
       → Key gắn với session + device, không tái sử dụng

Lớp 6: GIẢM THIỂU — WATERMARK (truy vết khi rò rỉ)
       Nếu mọi lớp trên bị phá (quay màn hình) → vẫn truy vết được nguồn rò rỉ
       → Nhúng User ID vào frame video (thủy vân số)
       → Đây là giải pháp GIẢM THIỂU, không phải giải pháp chính
```

### Tại sao AES block cipher thuần (ECB/CBC) không phù hợp cho streaming?

| Vấn đề | AES-ECB | AES-CBC | AES-CTR (mã dòng) ✅ |
|---|---|---|---|
| Lộ pattern dữ liệu | ❌ Cùng plaintext → cùng ciphertext | ✅ Không lộ | ✅ Không lộ |
| Seek/Random access | ✅ Có | ❌ Phải giải tuần tự từ đầu | ✅ Giải bất kỳ block nào |
| Phát real-time | ⚠️ Có nhưng lộ pattern | ❌ Chậm, sequential | ✅ Nhanh, song song |
| Song song hóa | ✅ Có | ❌ Không (chain dependency) | ✅ Có — mỗi counter độc lập |
| Phù hợp streaming | ❌ | ❌ | ✅ **Được chọn cho CENC** |

→ **AES-128-CTR** (Counter mode) biến AES block cipher thành **mã dòng (stream cipher)**: sinh keystream từ (Key + IV + Counter) rồi XOR với plaintext. Đây là mode được **chuẩn CENC (ISO/IEC 23001-7)** chọn cho scheme `cenc` (DASH/Widevine/PlayReady).

---

## 🧩 Thiết kế giải pháp mật mã

### 1. Segment-based Data Design (Thiết kế dữ liệu dạng segment)

```
Video gốc (2 giờ, 5 GB)
          │
          ▼
┌─────────────────────────────────────────────────┐
│              SEGMENTATION                        │
│  Chia thành N segment, mỗi segment 2-10 giây    │
│  Format: fMP4 (fragmented MP4) / CMAF            │
└─────────┬───────────────────────────────────────┘
          │
          ▼
  seg_001.m4s  seg_002.m4s  seg_003.m4s  ...  seg_N.m4s
    (2-10s)      (2-10s)      (2-10s)          (2-10s)
          │           │           │                │
          ▼           ▼           ▼                ▼
┌─────────────────────────────────────────────────┐
│         MÃ HÓA TỪNG SEGMENT RIÊNG BIỆT          │
│                                                   │
│  seg_001: AES-128-CTR(Key, IV₁)                   │
│  seg_002: AES-128-CTR(Key, IV₂)                   │
│  seg_003: AES-128-CTR(Key, IV₃)                   │
│  ...                                              │
│  Mỗi segment có IV riêng → chống IV Reuse        │
└─────────────────────────────────────────────────┘
```

**Tại sao thiết kế dạng segment?**
- **Chống download toàn bộ**: Video không bao giờ tồn tại dưới dạng 1 file hoàn chỉnh (kể cả trên server)
- **Streaming**: Client tải từng segment → giải mã trong buffer → phát → xóa. Segment tiếp theo tải song song
- **Mã hóa section riêng**: Mỗi segment có IV riêng, có thể có Key riêng → nếu lộ 1 Key chỉ mất 1 segment (2-10 giây), không mất toàn bộ phim
- **Adaptive Bitrate (ABR)**: Cùng 1 thời điểm có nhiều rendition (360p, 720p, 1080p) — mỗi rendition cũng mã hóa riêng

**Chiến lược Key: 1 Key chung + IV riêng/segment + Key Rotation**

Một bộ phim 2 giờ chia thành ~720 segment (10s/segment). Tuy nhiên **KHÔNG cần 720 Key** — chuẩn CENC dùng **1 Content Key chung** cho toàn bộ phim, mỗi segment chỉ khác nhau ở IV:

```
Phim 2 giờ = 720 segment

Chiến lược mặc định: 1 Key duy nhất
  seg_001: AES-128-CTR(Key₁, IV₁)
  seg_002: AES-128-CTR(Key₁, IV₂)
  ...
  seg_720: AES-128-CTR(Key₁, IV₇₂₀)

  → KMS chỉ lưu 1 Content Key (16 bytes)
  → IV gắn sẵn trong header segment (tenc box) → client tự đọc, không cần hỏi server

Chiến lược Key Rotation (bảo mật cao hơn): xoay Key mỗi 30 phút
  Segment 001-180:  Key₁ + IV riêng/segment
  Segment 181-360:  Key₂ + IV riêng/segment
  Segment 361-540:  Key₃ + IV riêng/segment
  Segment 541-720:  Key₄ + IV riêng/segment

  → Chỉ cần 4 Key cho phim 2 tiếng
  → Nếu lộ Key₁ → chỉ mất 30 phút đầu, không mất cả phim
  → Mỗi Key Period được đánh dấu trong manifest (.mpd) bằng <Period> riêng
```

| Chiến lược | Số Key/phim 2h | Rủi ro khi lộ Key | Độ phức tạp KMS |
|---|---|---|---|
| 1 Key/phim | **1** | Mất toàn bộ phim | Rất thấp |
| Key Rotation 30 phút | **4** | Chỉ mất 30 phút | Thấp |
| Key Rotation 10 phút | **12** | Chỉ mất 10 phút | Trung bình |
| 1 Key/segment | **720** | Chỉ mất 10 giây | Cao — không cần thiết |

→ **Đề xuất**: Key Rotation mỗi 30 phút — cân bằng tốt nhất giữa bảo mật và độ phức tạp quản lý.

**Hiệu năng giải mã phía Client — tại sao không bị quá tải?**

Client **KHÔNG giải mã 720 segment cùng lúc**. Tại bất kỳ thời điểm nào, client chỉ xử lý **1-2 segment** theo pipeline:

```
Thời điểm t = 25 giây:

  seg_001: ✅ Đã phát xong   → XÓA khỏi RAM
  seg_002: 🎬 Đang phát       → Sắp xóa
  seg_003: 🔓 Đang giải mã    → ~1.2 ms là xong
  seg_004: 📥 Đang tải từ CDN
  seg_005+: ⏳ Chưa tải
```

| Thông số | Giá trị |
|---|---|
| Dung lượng 1 segment (10s, 1080p) | ~5 MB |
| Tốc độ AES-128-CTR (CPU có AES-NI) | ~4,000 MB/s |
| Thời gian giải mã 1 segment | **~1.2 ms** |
| Thời gian có sẵn trước khi cần phát | 10,000 ms (10 giây) |
| Dư thừa hiệu năng | **~8,000 lần** |
| RAM sử dụng tại 1 thời điểm | ~15 MB (2-3 segment) |

→ Kể cả thiết bị yếu (smart TV rẻ, điện thoại cũ) không có AES-NI (~200 MB/s) vẫn giải mã 1 segment trong ~25 ms — dư sức cho streaming real-time.

### 2. Streaming — Giải mã trong buffer

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT PLAYER                          │
│                                                          │
│   Network ──► [Encrypted segment buffer]                  │
│                        │                                  │
│                        ▼                                  │
│               [CDM / TEE giải mã]                         │
│                        │                                  │
│                        ▼                                  │
│               [Decoded frame buffer]  ← CHỈ trong RAM     │
│                        │                  KHÔNG ghi file   │
│                        ▼                                  │
│               [Video renderer → Màn hình]                 │
│                                                          │
│   Buffer cũ bị GÁN = 0 và GIẢI PHÓNG ngay               │
│   → Video rõ KHÔNG BAO GIỜ nằm trên ổ đĩa               │
└──────────────────────────────────────────────────────────┘
```

**Tại sao không cho download?**
- Server KHÔNG cung cấp endpoint tải file hoàn chỉnh
- Manifest file (`.mpd` / `.m3u8`) chỉ chứa **danh sách URL các segment đã mã hóa**
- Dù user tải hết tất cả segment → tất cả là ciphertext → không ghép lại thành video được nếu không có Key
- Key KHÔNG đi cùng segment — Key được truyền riêng qua **License Server** với xác thực nghiêm ngặt

### 3. Quản lý quyền truy cập nội dung

```
User bấm "Play"
      │
      ▼
┌─────────────────────┐     ┌─────────────────────┐
│   Player gửi        │────▶│   License Server     │
│   License Request    │     │                     │
│   (PSSH + JWT)       │     │  1. Kiểm tra JWT    │
│                     │     │     → User hợp lệ?   │
│                     │     │  2. Kiểm tra         │
│                     │     │     entitlement      │
│                     │     │     → User có quyền   │
│                     │     │       xem phim này?   │
│                     │     │  3. Kiểm tra device  │
│                     │     │     → Thiết bị hợp lệ?│
│                     │     │  4. Kiểm tra session  │
│                     │     │     → Đang có bao     │
│                     │     │       nhiêu phiên?    │
│                     │◀────│  5. Cấp License       │
│   Nhận Key          │     │     (Key mã hóa)     │
└─────────────────────┘     └─────────────────────┘
```

- **Entitlement check**: User A mua gói phim Hành Động → chỉ được cấp Key cho phim Hành Động, không phải toàn bộ kho phim
- **Device binding**: Key gắn với Device Certificate → copy License sang máy khác vô tác dụng
- **Session control**: Giới hạn số thiết bị phát cùng lúc (VD: chỉ cho phép 2 device đồng thời)
- **Time-bound**: License có thời hạn (VD: 24h cho phim thuê, vĩnh viễn cho phim mua)

---

## 🏗️ Kiến trúc mật mã

```
┌──────────────────────────────────────────────────────────────┐
│                   PHÍA SERVER (dễ kiểm soát)                  │
│                                                              │
│  Video gốc ──► Transcode ──► Segment hóa ──► MÃ HÓA CENC    │
│                 (FFmpeg)       (fMP4/CMAF)    (AES-128-CTR)   │
│                                                  │           │
│                                    ┌─────────────┘           │
│                                    ▼                         │
│                              ┌──────────┐   ┌────────────┐  │
│                              │   KMS    │   │ Encrypted  │  │
│                              │Key + KID │   │ Segments   │  │
│                              │(AES-256- │   │ → CDN      │  │
│                              │ GCM      │   └─────┬──────┘  │
│                              │ at-rest) │         │         │
│                              └────┬─────┘         │         │
└───────────────────────────────────┼───────────────┼─────────┘
                                    │               │
         ┌──────────────────────────┘               │
         ▼                                          │
┌──────────────────┐                                │
│  LICENSE SERVER   │                                │
│                  │                                │
│  JWT + PSSH      │                                │
│  → Entitlement   │                                │
│  → Device check  │                                │
│  → Trả Key       │                                │
│    (RSA-OAEP     │                                │
│     encrypted)   │                                │
└────────┬─────────┘                                │
         │ TLS 1.3                                  │
         │                                          │
┌────────▼──────────────────────────────────────────▼──────────┐
│              PHÍA CLIENT (khó kiểm soát — rủi ro cao)        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                TEE / Secure Hardware                   │    │
│  │                                                       │    │
│  │  License ──► Giải mã Key (RSA Private Key)            │    │
│  │                   │                                    │    │
│  │                   ▼                                    │    │
│  │  Encrypted ──► AES-128-CTR Decrypt ──► Decoded frames  │    │
│  │  segment          (Key + IV)              │            │    │
│  │                                           ▼            │    │
│  │                                   Secure Output ──► 🖥️ │    │
│  │                                   (HDCP)               │    │
│  │                                                       │    │
│  │  ⚠️ Content Key + Video rõ CHỈ tồn tại ở đây         │    │
│  │     OS/App bên ngoài KHÔNG truy cập được              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Rủi ro: RAM dump (nếu không có TEE), screen recording      │
└──────────────────────────────────────────────────────────────┘
```

### Luồng mật mã từng bước

| Bước | Mô tả | Cơ chế mật mã |
|---|---|---|
| **S1** | Chia video thành segment fMP4/CMAF (2-10s/segment) | Fragmented MP4 — mỗi segment là một moof+mdat box độc lập |
| **S2** | Mã hóa mỗi segment | **AES-128-CTR** — stream cipher mode, IV duy nhất/segment |
| **S3** | Sinh Key + KID + IV | **CSPRNG** (`/dev/urandom`) — đảm bảo không đoán được |
| **S4** | Lưu Key tại KMS | Mã hóa at-rest bằng Master Key (**AES-256-GCM**) |
| **S5** | Đẩy encrypted segment lên CDN | CDN chỉ chứa ciphertext — không có Key |
| **S6** | Client yêu cầu License (PSSH + JWT) | **TLS 1.3** bảo vệ kênh truyền |
| **S7** | License Server kiểm tra quyền + trả Key | Key mã hóa bằng **RSA-OAEP** (Public Key của CDM client) |
| **S8** | CDM giải mã Key trong TEE | **RSA Private Key** nằm cố định trong TEE hardware |
| **S9** | CDM giải mã segment trong TEE | **AES-128-CTR** decrypt trong Secure World |
| **S10** | Xuất video → màn hình | **HDCP** (High-bandwidth Digital Content Protection) trên HDMI |

---

## 📖 Chi tiết cơ chế mật mã

### 1. AES-128-CTR — Tại sao là mã dòng phù hợp cho streaming?

AES ở chế độ CTR (Counter) biến AES block cipher thành **mã dòng (stream cipher)**:

```
                    Key (128-bit)
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │AES Block │    │AES Block │    │AES Block │
  │Encrypt   │    │Encrypt   │    │Encrypt   │
  │(IV + 0)  │    │(IV + 1)  │    │(IV + 2)  │
  └────┬─────┘    └────┬─────┘    └────┬─────┘
       │ Keystream₀     │ Keystream₁    │ Keystream₂
       │               │               │
       ▼    ⊕          ▼    ⊕          ▼    ⊕
   Plaintext₀      Plaintext₁      Plaintext₂
       │               │               │
       ▼               ▼               ▼
   Ciphertext₀     Ciphertext₁     Ciphertext₂
```

**Đặc điểm quan trọng cho streaming:**
- **Random access**: Muốn giải mã block thứ 1000 → tính `AES(Key, IV+1000)` rồi XOR — không cần giải 999 block trước đó
- **Song song hóa**: Mỗi block giải mã độc lập → tận dụng multi-core CPU / GPU
- **Real-time**: Throughput AES-128-CTR trên CPU hiện đại (có AES-NI): **~4 GB/s** — dư sức cho 4K streaming (~25 Mbps)
- **Không padding**: Plaintext bao nhiêu byte → ciphertext bấy nhiêu byte (không phình file)

### 2. CENC `cbcs` — Pattern Encryption cho HLS/FairPlay (Apple)

Apple không dùng CTR mà dùng **AES-128-CBC với mã hóa theo pattern**:

```
Mỗi sample (NAL unit) gồm nhiều block 16 bytes:
[Block 1] [Block 2] [Block 3] ... [Block 10]

Pattern 1:9 = Mã hóa 1 block, bỏ qua 9 block:
[🔒 Enc ] [Clear  ] [Clear  ] ... [Clear   ]  [🔒 Enc ] [Clear  ] ...
```

- Tiết kiệm CPU (chỉ mã hóa ~10% dữ liệu) nhưng **đủ phá hủy** khả năng phát video
- **Giao thức bắt tay FairPlay** (Apple): Client chứng minh là thiết bị Apple hợp lệ → Server Provisioning cấp chứng chỉ → mới được nhận License Key

### 3. Bảo vệ Key — Mã hóa 2 lớp

Content Key là **bí mật trung tâm** — nếu lộ Key, toàn bộ nội dung bị phá. Thiết kế bảo vệ:

| Trạng thái Key | Cơ chế bảo vệ |
|---|---|
| **At-rest** (lưu trên KMS/DB) | Mã hóa bằng Master Key: `E(MasterKey, ContentKey)` sử dụng **AES-256-GCM** (AEAD — có authentication tag chống tamper) |
| **In-transit** (truyền qua mạng) | **Lớp 1**: TLS 1.3 mã hóa toàn bộ kênh truyền. **Lớp 2**: Content Key bên trong License Response được mã hóa bằng **RSA-OAEP** với Public Key của CDM thiết bị |
| **In-use** (đang dùng để giải mã) | Key chỉ tồn tại trong **TEE** (Trusted Execution Environment) — vùng phần cứng mà OS không đọc được. Trên thiết bị Widevine L1, Key nằm trong ARM TrustZone Secure World |

---

## 🌐 Các giao thức bảo vệ nội dung trên nền tảng thực tế

| Nền tảng | Giao thức DRM | Scheme mã hóa | Giao thức bắt tay | Streaming Protocol |
|---|---|---|---|---|
| **Chrome, Android, Smart TV** | Widevine (Google) | `cenc` — AES-128-CTR | License Request chứa PSSH box + Device Certificate | DASH (`.mpd` + `.m4s`) |
| **Safari, iOS, macOS, Apple TV** | FairPlay (Apple) | `cbcs` — AES-128-CBC pattern | **SPC/CKC handshake**: Client gửi Server Playback Context (SPC), Server trả Content Key Context (CKC) — multi-step handshake | HLS (`.m3u8` + `.ts`/`.m4s`) |
| **Edge, Windows, Xbox** | PlayReady (Microsoft) | `cenc` — AES-128-CTR | License Acquisition Protocol — SOAP-based hoặc RESTful | DASH hoặc Smooth Streaming |
| **Tất cả (tương lai)** | CMAF + CENC | `cenc` hoặc `cbcs` | Tùy CDM | CMAF (Common Media Application Format) — hợp nhất DASH + HLS |

### Giao thức thời gian thực liên quan

- **DASH (Dynamic Adaptive Streaming over HTTP)**: Manifest `.mpd` mô tả các rendition + segment URL + thông tin mã hóa (ContentProtection element chứa PSSH)
- **HLS (HTTP Live Streaming — Apple)**: Manifest `.m3u8` chứa phương thức mã hóa (`#EXT-X-KEY` hoặc `#EXT-X-SESSION-KEY`) và URL segment
- **CMAF (Common Media Application Format)**: Chuẩn hóa container fMP4 cho cả DASH và HLS — giảm chi phí lưu trữ (1 bộ segment cho tất cả nền tảng)

---

## ⚔️ Kịch bản tấn công & Phòng thủ

Tập trung vào các **tấn công trực tiếp nhằm sao chép/chiết xuất nội dung** và phòng thủ mật mã:

| Kịch bản tấn công | Mô tả | Phòng thủ |
|---|---|---|
| **Tải segment từ CDN** | Dùng tool (curl, wget, yt-dlp) tải hết các file `.m4s` | Tất cả segment đã mã hóa AES-128-CTR → tải về chỉ là ciphertext, không phát/ghép lại được |
| **Bắt Key trên đường truyền (MITM)** | Dùng Wireshark/proxy bắt License Response để lấy Content Key | Key trong License được mã hóa **RSA-OAEP** bằng Public Key riêng của CDM → MITM không có Private Key để giải. Kênh truyền mã hóa **TLS 1.3** |
| **IV/Nonce Reuse (Two-Time Pad)** | Dùng lại cặp (Key, IV) cho 2 segment → XOR 2 ciphertext = XOR 2 plaintext → khôi phục nội dung | Mỗi segment **bắt buộc IV riêng** (sinh bằng CSPRNG). Cấu trúc: `IV = nonce(8B) ∥ counter(8B)` |
| **Key Extraction từ RAM** | Dump bộ nhớ process player bằng Frida/gdb để tìm Content Key | TEE (Widevine L1): Key nằm trong Secure World → OS không đọc được. Thiết bị L3 (software): hạn chế chỉ phát SD 480p |
| **License Replay** | Capture License Response hợp lệ → gửi lại cho CDM khác | License chứa **Nonce** (dùng 1 lần) + **Device Certificate binding**. Replay → Server từ chối. Key mã hóa bằng Public Key riêng từng CDM → CDM khác không giải được |
| **Brute Force Key** | Thử hết 2¹²⁸ tổ hợp Key | 2¹²⁸ ≈ 3.4×10³⁸. Với 10¹² thử/giây → cần **10¹⁹ năm** → không khả thi |
| **Bit-Flipping (CTR malleable)** | AES-CTR không có auth tag → lật bit ciphertext → lật bit plaintext tương ứng | Bit-flip trong video chỉ gây nhiễu hình, không leak thông tin hữu ích. Kênh truyền License dùng **AES-GCM (AEAD)** — có authentication tag chống tamper |
| **TLS Downgrade** | Ép server hạ về TLS 1.0/1.1 có lỗ hổng (BEAST, POODLE) | Chỉ cho phép **TLS 1.2/1.3**, vô hiệu cipher suite yếu, bật **HSTS**, **Certificate Pinning** trên client |
| **Master Key Compromise** | Lộ Master Key của KMS → giải mã mọi Content Key → giải mã mọi video | Master Key lưu trong **HSM** (phần cứng chuyên dụng). **Key Rotation** định kỳ — re-encrypt toàn bộ Content Key bằng Master Key mới |
| **Rip bằng HDMI Capture Card** | Cắm thiết bị capture HDMI giữa máy và màn hình | **HDCP** (High-bandwidth Digital Content Protection) mã hóa tín hiệu HDMI. Thiết bị không hỗ trợ HDCP → hạ chất lượng hoặc chặn output |
| **Quay màn hình (Analog Hole)** | Chĩa camera/dùng phần mềm quay màn hình → bypass mọi DRM | **Giới hạn vật lý của mật mã** — không thể chặn 100%. Giảm thiểu bằng **Watermark** truy vết (xem mục dưới) |

---

## 💧 Watermarking — Giải pháp giảm thiểu

> ⚠️ **Lưu ý quan trọng**: Watermark **KHÔNG phải giải pháp chống sao chép chính**. Watermark **có thể bị phá** (re-encode chất lượng thấp, crop, xoay, collusion). Vai trò của Watermark là **giảm thiểu rủi ro** — khi mọi lớp bảo vệ khác thất bại (quay màn hình), vẫn có khả năng **truy vết** nguồn rò rỉ.

### Cách thức hoạt động

- Nhúng User ID vào hệ số DCT tần số trung bình (mắt thường không thấy)
- Khi phát hiện rò rỉ → phân tích video lậu → trích xuất Watermark → xác định User ID

### Hạn chế (theo góp ý giảng viên)

| Phương pháp phá Watermark | Hiệu quả |
|---|---|
| Re-encode ở bitrate rất thấp | Watermark có thể bị phá nếu chất lượng quá thấp |
| Crop + xoay + Gaussian blur | Giảm accuracy của detection |
| Collusion Attack (chồng nhiều bản) | Nếu không dùng A/B switching, watermark bị trung bình hóa → mất |
| Analog re-capture (quay lại bằng camera) | Watermark bị biến dạng mạnh |

→ **Kết luận**: Watermark là **tuyến phòng thủ cuối cùng** với **hiệu quả hạn chế**. Trọng tâm bảo vệ bản quyền phải nằm ở **mã hóa segment + bảo vệ Key + streaming design**.

---

## ⚡ Thách thức phía Client

Theo góp ý giảng viên: *"Phía server dễ, phía client mới khó"*. Các thách thức chính:

| Thách thức | Mô tả | Giải pháp / Hướng tiếp cận |
|---|---|---|
| **Rủi ro RAM** | Video đã giải mã nằm tạm trong RAM trước khi render → có thể bị dump | Giải mã trong **TEE** — RAM thuộc Secure World mà Normal World app không đọc được. Thiết bị không có TEE → hạn chế chất lượng SD |
| **Tương thích thư viện player** | Shaka Player (Web), ExoPlayer (Android), AVPlayer (iOS) — mỗi thư viện xử lý DRM khác nhau | Dùng **EME API** (Encrypted Media Extensions) chuẩn W3C cho Web. Mỗi platform có CDM riêng (Widevine, FairPlay, PlayReady) |
| **MPEG codec compatibility** | Không phải mọi codec đều hỗ trợ CENC encryption (VD: một số codec cũ không parse được encrypted NAL units) | Dùng codec chuẩn: **H.264 (AVC)** hoặc **H.265 (HEVC)** — đã được CENC spec hỗ trợ đầy đủ |
| **Apple FairPlay protocol** | FairPlay yêu cầu **giao thức bắt tay nhiều bước** (SPC → CKC) khác hoàn toàn Widevine. HLS dùng `cbcs` thay vì `cenc` | Implement riêng FairPlay License module. Dùng CMAF để tạo segment tương thích cả 2 scheme (`cenc` + `cbcs`) |
| **Giao thức thời gian thực** | Live streaming (phát trực tiếp) yêu cầu mã hóa + đóng gói segment **ngay lập tức** khi video được quay | Mã hóa pipeline phải xử lý realtime: AES-128-CTR với AES-NI hardware acceleration (~4 GB/s throughput) |
| **Secure Output Path** | Dù giải mã trong TEE, nếu output ra HDMI không mã hóa → vẫn bị capture | Bắt buộc **HDCP** trên cổng xuất. Smart TV + set-top box hỗ trợ tốt hơn trình duyệt |

---

## 🛠️ Công nghệ sử dụng

| Công nghệ | Vai trò trong đồ án |
|---|---|
| **FFmpeg** | Transcode + segment hóa video (fMP4/CMAF) |
| **shaka-packager** | Mã hóa CENC (AES-128-CTR), sinh KID/IV, gắn PSSH box |
| **Bento4** | Phân tích MP4 box: kiểm tra `sinf`, `schi`, `tenc` (thông tin mã hóa) |
| **Node.js** | License Server: xác thực JWT, kiểm tra entitlement, trả Key mã hóa RSA |
| **Software KMS** | Lưu trữ Content Key (mã hóa at-rest AES-256-GCM) |
| **Shaka Player** | Web player hỗ trợ EME/MSE — tích hợp Widevine CDM |
| **Python** | PoC: IV Reuse attack, watermark embedding/detection (DCT) |
| **Frida** | PoC: Dump Key từ Widevine L3 — chứng minh tại sao cần TEE |
| **Wireshark** | Phân tích License flow trên TLS — chứng minh Key không lộ |

---

## 🚀 Cài đặt & Chạy thử

### Yêu cầu

- FFmpeg >= 6.x
- Node.js >= 18.x (License Server)
- Python >= 3.10 (Watermarking, PoC attacks)
- Docker >= 24.x (tùy chọn)

### Pipeline mã hóa nội dung

```bash
# Bước 1: Transcode + segment hóa
cd ingest/
bash transcode.sh input/sample.mp4
# Output: output/360p/ output/720p/ output/1080p/ (các segment .m4s)

# Bước 2: Mã hóa CENC cho từng rendition
cd ../packager/
bash package_encrypt.sh \
  --input ../ingest/output/ \
  --kid <KID_HEX> \
  --key <CONTENT_KEY_HEX>
# Output: encrypted .m4s segments + .mpd manifest

# Bước 3: Kiểm tra mã hóa
mp4dump packager/output/seg_001.m4s | grep -A3 "tenc"
# Expected: defaultIsProtected=1, defaultPerSampleIVSize=8, defaultKID=<KID>
```

### Chạy License Server

```bash
cd license-server/
npm install && npm start
# POST http://localhost:8080/license
# Body: { pssh: "...", jwt: "..." }
# Response: { license: "<encrypted Content Key>" }
```

### Kiểm tra chống sao chép

```bash
# Thử phát segment mã hóa bằng FFplay → THẤT BẠI
ffplay packager/output/seg_001.m4s
# Expected: Error — encrypted content, cannot decode

# Thử ghép tất cả segment → THẤT BẠI
cat packager/output/seg_*.m4s > full_movie.mp4
ffplay full_movie.mp4
# Expected: Error — ciphertext, cannot play
```

---

## 🧪 Thực nghiệm & Đánh giá

| # | Thực nghiệm | Mục tiêu | Kết quả mong đợi |
|---|---|---|---|
| E1 | **Chống download** | Tải tất cả segment → thử phát | ❌ Không phát được (ciphertext) |
| E2 | **IV Reuse Attack** | Cố tình dùng lại IV cho 2 segment → XOR ciphertext | ✅ Khôi phục plaintext → chứng minh tại sao IV phải unique |
| E3 | **Key Extraction L3** | Dump RAM trên Widevine L3 bằng Frida | ✅ Lấy được Key → chứng minh L3 không an toàn |
| E4 | **Key Extraction L1** | Thử dump trên TEE | ❌ Không lấy được → chứng minh TEE bảo vệ Key |
| E5 | **License Replay** | Capture License → gửi lại | ❌ Server từ chối (Nonce expired) |
| E6 | **AES-CTR throughput** | Đo tốc độ mã hóa/giải mã | ≥ 1 GB/s (đủ cho 4K streaming) |
| E7 | **Watermark robustness** | Nén/crop/xoay → thử detection | Đánh giá recall/precision + ghi nhận hạn chế |
| E8 | **FairPlay handshake** | Implement SPC/CKC flow trên iOS emulator | Kiểm tra tương thích scheme `cbcs` |

### Metrics

**Bảo mật (chống sao chép):**
- Tỷ lệ chiết xuất nội dung thành công qua các kịch bản: phải = 0% (trừ analog hole)
- Tỷ lệ trích xuất Key thành công: L1 = 0%, L3 = minh họa rủi ro

**Hiệu năng mã hóa:**
- Throughput AES-128-CTR (MB/s) — đảm bảo đủ cho streaming real-time
- Overhead CPU: encryption + decryption
- License latency: median / p95 / p99
- Time-to-First-Frame: so sánh có DRM vs không DRM

---

## 📅 Timeline

Bảng theo dõi tiến độ: [Google Sheet — Timeline dự án](https://docs.google.com/spreadsheets/d/1w1mKGpv5SPb5p1dqNdZideCGQb87z6QokOSiyGN1Ckk/edit#gid=0)

Các hạng mục dưới đây phải phản ánh trên sheet (cột tên/ nội dung / mốc có thể chỉnh theo lịch nhóm, nhưng **thứ tự nghiệp vụ và mã task** cần khớp cấu trúc đồ án trong README: pipeline mã hóa → License → CDN → Player → thực nghiệm E1–E8).

| Giai đoạn | Mã | Nội dung công việc | Sản phẩm / mốc | Tham chiếu README |
|---|---|---|---|---|
| 0 | P0 | Khảo sát tài liệu CENC/DASH/DRM; cố định phạm vi, sơ đồ luồng mật mã (S1–S10) | Sơ đồ kiến trúc, danh sách công nghệ | § Thiết kế giải pháp, § Kiến trúc mật mã, § Chi tiết cơ chế |
| 1 | T1.1 | Transcode ABR, tách segment fMP4/CMAF | `ingest/` → các rendition + segment | § Segment-based, § Cài đặt (Bước 1) |
| 1 | T1.2 | Sinh KID / Content Key / IV (CSPRNG), lưu `license_keys.json`, đồng bộ với License | `media-processing/generate_cenc_keys.py` | § S3–S4, bảng bước S3–S4 |
| 1 | T1.3 | Đóng gói CENC AES-128-CTR, PSSH, manifest DASH (shaka-packager) | Segment `.m4s` mã hóa + `.mpd` | § Pipeline bước 2, § S1–S2 |
| 1 | T1.4 | License Server: JWT, entitlement, trả key mã hóa (RSA-OAEP), TLS | `license-server/` | § Quản lý quyền, § S6–S7, § Sải đặt License Server |
| 1 | T1.5 | Kiểm tra header mã hóa (tenc / `mp4dump`), xác minh KID/IV trên segment | Báo cáo rút gọn + log kiểm tra | § Cài đặt (Bước 3), mock manifest tham chiếu T1.5 |
| 1 | T1.6 | Mô phỏng CDN: phục vụ segment, Range request, tắt gzip `.m4s`, TLS (dev) | `cdn-sim/` | § Công nghệ, hardening streaming |
| 1 | T1.7 | Web player: Shaka + EME, load manifest thật/mock | `player/` | § Công nghệ (Shaka), § Cài đặt |
| 2 | E1 | Thực nghiệm: tải toàn bộ segment — chứng minh không phát/ghép được (ciphertext) | Ghi chép lệnh + kết quả | Bảng Thực nghiệm (E1) |
| 2 | E2 | PoC IV Reuse: XOR ciphertext khi lặp IV — chứng minh IV phải unique | Script Python, ảnh chụp kết quả | E2, § IV/Nonce |
| 2 | E3 | PoC trích xuất key trên Widevine L3 (Frida) | Log/minh họa rủi ro L3 | E3, § Kịch bản tấn công |
| 2 | E4 | Thử tương tự trên môi trường TEE/L1 (chứng minh không lấy được key) | Ghi chép môi trường + kết luận | E4 |
| 2 | E5 | Thử License replay / nonce một lần | Kết quả từ chối hợp lệ từ server | E5 |
| 2 | E6 | Đo throughput AES-128-CTR (MB/s) | Bảng số liệu | E6, § Hiệu năng |
| 2 | E7 | Watermark DCT: nhúng / trích, thử nén-crop (độ bền + hạn chế) | Số liệu recall/precision nếu có | E7, § Watermarking |
| 2 | E8 | (Tùy chọn nâng cao) FairPlay / `cbcs`, handshake SPC–CKC | Tài liệu hoặc PoC tối thiểu | E8, § cbcs / FairPlay |
| 3 | F | Tích hợp E2E: `docker compose`, demo một luồng xem hợp lệ | Video hoặc checklist demo | `infra/`, toàn bộ pipeline |
| 3 | R | Báo cáo, slide, tổng hợp kết quả thực nghiệm & metrics | Bản nộp đồ án | § Metrics, § Thực nghiệm |

Ghi chú: mã **T1.5–T1.7** trùng với gọi tên trong mã nguồn (`player` / `cdn-sim` / packager). **Task 3** trong script ingest tương ứng **T1.1** (transcode/ABR).

---

## 👥 Thành viên nhóm

| MSSV | Họ và tên | Vai trò |
| :--- | :--- | :--- |
| 2452xxxx | Trầm Tính Ấn | Trưởng nhóm |
| 2452022 | Trần Đức Chuẩn | Thành viên |
| 2452xxxx | Chung Hữu Lộc | Thành viên |

---

<div align="center">

**NT219.Q22.ANTT — Đồ án Mật mã học**

*Khoa Mạng máy tính & Truyền thông — Đại học Công nghệ Thông tin*

</div>
