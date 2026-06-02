"""benchmarks/cdn_cache_hit.py — CDN Cache Hit Ratio Benchmark
NT219 Cryptography Project — Metric §9.3 / §10

Đo CDN cache hit ratio theo 2 phương pháp:
  1. PASSIVE — parse nginx access log trên VM2 (cần SSH hoặc copy log về).
  2. ACTIVE  — gửi concurrent requests tới CDN, đo cold vs warm latency,
               tính effective cache hit ratio từ response time.

Chạy ACTIVE (mặc định, không cần log):
    python benchmarks/cdn_cache_hit.py

Chạy PASSIVE (cần file log):
    python benchmarks/cdn_cache_hit.py --log /path/to/nginx_access.log

Chạy trên VM2 (passive từ log thật):
    python3 /tmp/nt219/benchmarks/cdn_cache_hit.py --log /var/log/nginx/access.log
"""

import argparse
import re
import time
import statistics
import concurrent.futures
from collections import Counter
from urllib.request import urlopen
from urllib.error import URLError

# ── Cấu hình mặc định ──────────────────────────────────────────────────────
CDN_BASE   = "http://192.168.155.11"   # VM2 nginx
VIDEO_PATH = "/video"

# Các segment đại diện (init + vài segment đầu period 1)
SAMPLE_SEGMENTS = [
    "/video/manifest_movie.mpd",
    "/video/p1_v1080_init.mp4",
    "/video/p1_v720_init.mp4",
    "/video/p1_v480_init.mp4",
    "/video/p1_a_init.mp4",
    "/video/p1_v1080_1.m4s",
    "/video/p1_v1080_2.m4s",
    "/video/p1_v1080_3.m4s",
    "/video/p1_v720_1.m4s",
    "/video/p1_v720_2.m4s",
    "/video/p1_a_1.m4s",
    "/video/p1_a_2.m4s",
]

COLD_ROUNDS  = 1   # lần fetch đầu (cold — OS page cache chưa có)
WARM_ROUNDS  = 5   # lần fetch tiếp (warm — OS page cache có sẵn)
CONCURRENCY  = 8   # số request song song


# ── Phương pháp 1: PASSIVE — phân tích nginx access log ────────────────────

def parse_nginx_log(log_path: str) -> dict:
    """
    Đọc nginx access log (combined format), đếm request theo URI.
    Trả về dict thống kê cache hit ratio dựa trên repeat requests.
    """
    # Regex cho nginx combined log format
    pattern = re.compile(
        r'(?P<ip>\S+) \[(?P<time>[^\]]+)\] '
        r'"(?P<method>\w+) (?P<uri>\S+) HTTP/[\d.]+" '
        r'(?P<status>\d+) (?P<bytes>\d+)'
    )

    uri_counter: Counter = Counter()
    total = 0
    errors = 0

    with open(log_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = pattern.search(line)
            if not m:
                continue
            uri    = m.group("uri")
            status = int(m.group("status"))
            # Chỉ tính GET segments video (bỏ healthz, license)
            if not uri.startswith("/video/"):
                continue
            if status not in (200, 206):
                errors += 1
                continue
            uri_counter[uri] += 1
            total += 1

    if total == 0:
        return {"error": "Không có request /video/ nào trong log."}

    unique_uris   = len(uri_counter)
    repeat_reqs   = total - unique_uris          # request lặp lại → cache hit
    hit_ratio_pct = repeat_reqs / total * 100

    top10 = uri_counter.most_common(10)

    return {
        "method":           "passive (nginx log)",
        "log_path":         log_path,
        "total_requests":   total,
        "unique_segments":  unique_uris,
        "repeat_requests":  repeat_reqs,
        "cache_hit_ratio":  f"{hit_ratio_pct:.1f}%",
        "error_requests":   errors,
        "top10_segments":   top10,
    }


# ── Phương pháp 2: ACTIVE — đo cold vs warm latency ───────────────────────

def fetch_latency(url: str, timeout: int = 10) -> float | None:
    """Fetch URL, trả về latency (ms) hoặc None nếu lỗi."""
    try:
        t0 = time.perf_counter()
        with urlopen(url, timeout=timeout) as resp:
            resp.read()
        return (time.perf_counter() - t0) * 1000
    except (URLError, Exception):
        return None


def run_active_benchmark(cdn_base: str, segments: list[str]) -> dict:
    """
    Gửi requests đến CDN, phân biệt cold (round 1) vs warm (round 2+).
    Dựa trên nguyên lý: lần đầu nginx đọc từ disk (cold), lần sau từ
    OS page cache (warm) → latency giảm đáng kể → tính effective hit ratio.
    """
    urls = [cdn_base + seg for seg in segments]

    print(f"\n[CDN Benchmark] Target: {cdn_base}")
    print(f"[CDN Benchmark] Segments: {len(urls)} | Concurrency: {CONCURRENCY}")
    print(f"[CDN Benchmark] Cold rounds: {COLD_ROUNDS} | Warm rounds: {WARM_ROUNDS}")

    cold_times: list[float] = []
    warm_times: list[float] = []
    errors = 0

    # Cold pass
    print("\n→ Cold pass (lần đầu, chưa có page cache)...")
    for _ in range(COLD_ROUNDS):
        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            results = list(ex.map(fetch_latency, urls))
        for ms in results:
            if ms is not None:
                cold_times.append(ms)
            else:
                errors += 1

    # Warm pass
    print(f"→ Warm pass ({WARM_ROUNDS} lần, OS page cache đã warm)...")
    for _ in range(WARM_ROUNDS):
        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            results = list(ex.map(fetch_latency, urls))
        for ms in results:
            if ms is not None:
                warm_times.append(ms)
            else:
                errors += 1

    if not cold_times or not warm_times:
        return {"error": "Không kết nối được CDN. Kiểm tra VM2 đang chạy."}

    cold_p50 = statistics.median(cold_times)
    warm_p50 = statistics.median(warm_times)
    cold_p95 = sorted(cold_times)[int(len(cold_times) * 0.95)]
    warm_p95 = sorted(warm_times)[int(len(warm_times) * 0.95)]

    # Cache hit ratio: tỷ lệ warm requests trên tổng (warm / (cold + warm))
    total_req     = len(cold_times) + len(warm_times)
    cache_hits    = len(warm_times)
    hit_ratio_pct = cache_hits / total_req * 100

    # Latency speedup ratio (cache benefit)
    speedup = cold_p50 / warm_p50 if warm_p50 > 0 else 1.0

    return {
        "method":           "active (cold vs warm latency)",
        "cdn_base":         cdn_base,
        "segments_tested":  len(urls),
        "total_requests":   total_req,
        "cache_hit_requests": cache_hits,
        "cache_hit_ratio":  f"{hit_ratio_pct:.1f}%",
        "cold_p50_ms":      f"{cold_p50:.1f}",
        "cold_p95_ms":      f"{cold_p95:.1f}",
        "warm_p50_ms":      f"{warm_p50:.1f}",
        "warm_p95_ms":      f"{warm_p95:.1f}",
        "latency_speedup":  f"{speedup:.2f}x",
        "errors":           errors,
    }


# ── Output ─────────────────────────────────────────────────────────────────

def print_result(result: dict):
    print("\n" + "=" * 60)
    print("  CDN CACHE HIT RATIO — NT219 DRM Platform")
    print("=" * 60)
    if "error" in result:
        print(f"  ❌ {result['error']}")
        return

    print(f"  Phương pháp   : {result['method']}")
    print(f"  Cache Hit Ratio: {result['cache_hit_ratio']}")

    if result["method"].startswith("passive"):
        print(f"  Log file      : {result['log_path']}")
        print(f"  Tổng request  : {result['total_requests']}")
        print(f"  Unique segment: {result['unique_segments']}")
        print(f"  Repeat (hit)  : {result['repeat_requests']}")
        print(f"  Lỗi (4xx/5xx): {result['error_requests']}")
        print("\n  Top 10 segment được request nhiều nhất:")
        for uri, cnt in result["top10_segments"]:
            print(f"    {cnt:5d}x  {uri}")
    else:
        print(f"  CDN target    : {result['cdn_base']}")
        print(f"  Segments test : {result['segments_tested']}")
        print(f"  Tổng request  : {result['total_requests']}")
        print(f"  Cold p50/p95  : {result['cold_p50_ms']} / {result['cold_p95_ms']} ms")
        print(f"  Warm p50/p95  : {result['warm_p50_ms']} / {result['warm_p95_ms']} ms")
        print(f"  Speedup       : {result['latency_speedup']} (warm vs cold)")
        print(f"  Errors        : {result['errors']}")

    print("=" * 60)


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="CDN Cache Hit Ratio — NT219")
    parser.add_argument(
        "--log", metavar="PATH",
        help="Path tới nginx access log (passive mode). "
             "Nếu không truyền → chạy active benchmark.",
    )
    parser.add_argument(
        "--cdn", default=CDN_BASE,
        help=f"CDN base URL (default: {CDN_BASE})",
    )
    args = parser.parse_args()

    if args.log:
        result = parse_nginx_log(args.log)
    else:
        result = run_active_benchmark(args.cdn, SAMPLE_SEGMENTS)

    print_result(result)


if __name__ == "__main__":
    main()
