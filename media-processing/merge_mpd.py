#!/usr/bin/env python3
"""merge_mpd.py — Gộp nhiều single-period MPD thành multi-period MPD.

Dùng sau khi shaka-packager tạo MPD riêng cho từng period.
Xử lý đúng presentationTimeOffset và Period@start/duration.

Chạy:
    python3 merge_mpd.py p1.mpd p2.mpd p3.mpd p4.mpd \
        --out manifest_movie.mpd \
        --period-durations 1575 1575 1575 1574
"""

import argparse
import re
import xml.etree.ElementTree as ET

NS_MPD  = 'urn:mpeg:dash:schema:mpd:2011'
NS_CENC = 'urn:mpeg:cenc:2013'

ET.register_namespace('',     NS_MPD)
ET.register_namespace('cenc', NS_CENC)


def parse_duration(s: str) -> float:
    if not s:
        return 0.0
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?', s)
    if not m:
        return 0.0
    h, mn, sc = (float(x or 0) for x in m.groups())
    return h * 3600 + mn * 60 + sc


def fmt_duration(s: float) -> str:
    h  = int(s // 3600); s -= h * 3600
    mn = int(s // 60);   s -= mn * 60
    if h:
        return f'PT{h}H{mn}M{s:.3f}S'
    if mn:
        return f'PT{mn}M{s:.3f}S'
    return f'PT{s:.3f}S'


def main():
    parser = argparse.ArgumentParser(description='Merge multi-period MPD')
    parser.add_argument('mpds', nargs='+', help='MPD files theo thứ tự period')
    parser.add_argument('--out', required=True, help='Output MPD path')
    parser.add_argument('--period-durations', nargs='+', type=float,
                        help='Duration (giây) từng period (ghi đè giá trị từ MPD)')
    args = parser.parse_args()

    trees = [ET.parse(p) for p in args.mpds]
    roots = [t.getroot() for t in trees]

    # Tính duration từng period
    if args.period_durations:
        durations = args.period_durations
        # Pad với duration từ MPD nếu ít hơn số period
        while len(durations) < len(trees):
            durations.append(parse_duration(roots[len(durations)].get('mediaPresentationDuration', 'PT0S')))
    else:
        durations = [parse_duration(r.get('mediaPresentationDuration', 'PT0S')) for r in roots]

    total_dur   = sum(durations)
    period_starts = [sum(durations[:i]) for i in range(len(durations))]

    # Dùng root của period 1 làm base
    base_root = roots[0]
    base_root.set('type', 'static')
    base_root.set('mediaPresentationDuration', fmt_duration(total_dur))
    base_root.set('minBufferTime', 'PT4S')

    # Xoá thuộc tính live
    for attr in ['minimumUpdatePeriod', 'availabilityStartTime',
                 'timeShiftBufferDepth', 'suggestedPresentationDelay',
                 'publishTime']:
        base_root.attrib.pop(attr, None)

    # Cập nhật Period 1
    p1 = base_root.find(f'{{{NS_MPD}}}Period')
    p1.set('id', 'p1')
    p1.set('start', 'PT0S')
    p1.set('duration', fmt_duration(durations[0]))

    # Thêm Period 2-N
    for i, (root, start, dur) in enumerate(zip(roots[1:], period_starts[1:], durations[1:]), 2):
        period_node = root.find(f'{{{NS_MPD}}}Period')
        if period_node is None:
            print(f'[WARN] period {i}: không tìm thấy <Period>')
            continue
        period_node.set('id', f'p{i}')
        period_node.set('start', fmt_duration(start))
        period_node.set('duration', fmt_duration(dur))
        base_root.append(period_node)

    # Ghi output
    tree_out = ET.ElementTree(base_root)
    ET.indent(tree_out, space='  ')
    tree_out.write(args.out, xml_declaration=True, encoding='UTF-8')
    print(f'[MPD] Merged {len(trees)} periods → {args.out}')
    print(f'[MPD] Total duration: {fmt_duration(total_dur)}')
    for i, (s, d) in enumerate(zip(period_starts, durations), 1):
        print(f'      Period {i}: start={fmt_duration(s)} dur={fmt_duration(d)}')


if __name__ == '__main__':
    main()
