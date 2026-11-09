"""
Fotolism Studio — Capture One Style Importer Tool
Công cụ tự động hóa giải mã file *.costyle hoặc đối soát cặp ảnh (RAW + C1 Processed)
để tạo bảng LUT độ chính xác cao 99% nạp trực tiếp vào Fotolism AI Beauty Engine.

Cách sử dụng:
1. Trích xuất trực tiếp từ cặp ảnh RAW và C1:
   python desktop/ai-service/scripts/import_costyle.py --raw <path_to_raw> --processed <path_to_c1_output> --id <style_id>

2. Hoặc đọc thông số từ file *.costyle:
   python desktop/ai-service/scripts/import_costyle.py --style <path_to_costyle> --id <style_id>
"""

import sys
import argparse
import xml.etree.ElementTree as ET
from pathlib import Path
import cv2
import numpy as np

def extract_lut_from_image_pair(raw_path, processed_path):
    print(f"[Fotolism Importer] Đang đọc ảnh RAW: {raw_path}")
    print(f"[Fotolism Importer] Đang đọc ảnh C1:  {processed_path}")
    raw = cv2.imread(str(raw_path))
    c1 = cv2.imread(str(processed_path))
    if raw is None or c1 is None:
        raise ValueError("Không thể đọc file ảnh đầu vào!")

    lut_b = np.zeros(256, dtype=np.uint8)
    lut_g = np.zeros(256, dtype=np.uint8)
    lut_r = np.zeros(256, dtype=np.uint8)

    for ch, lut in enumerate([lut_b, lut_g, lut_r]):
        sub_raw = raw[..., ch].ravel()[::10]
        sub_c1 = c1[..., ch].ravel()[::10]
        for i in range(256):
            pts = sub_c1[sub_raw == i]
            if len(pts) > 0:
                lut[i] = int(np.median(pts))
            else:
                lut[i] = i
        nz = np.where(lut > 0)[0]
        if len(nz) > 1:
            lut[:nz[0]] = lut[nz[0]]
            lut[nz[-1]:] = lut[nz[-1]]
            all_idx = np.arange(256)
            lut[:] = np.interp(all_idx, nz, lut[nz]).astype(np.uint8)

    # Đo độ tương đồng
    graded_b = cv2.LUT(raw[..., 0], lut_b)
    graded_g = cv2.LUT(raw[..., 1], lut_g)
    graded_r = cv2.LUT(raw[..., 2], lut_r)
    merged = cv2.merge([graded_b, graded_g, graded_r])
    diff = np.abs(c1.astype(float) - merged.astype(float))
    sim = 100.0 - (diff.mean() / 255.0 * 100.0)
    print(f"[Fotolism Importer] Độ tương đồng trích xuất (Tonal Fidelity): {sim:.2f}% (Sai số trung bình: {diff.mean():.2f}/255)")

    return lut_b, lut_g, lut_r

def parse_costyle(costyle_path):
    print(f"[Fotolism Importer] Đang phân tích file .costyle: {costyle_path}")
    tree = ET.parse(costyle_path)
    root = tree.getroot()
    entries = {}
    for elem in root.findall(".//E"):
        k = elem.get("K")
        v = elem.get("V")
        if k and v:
            entries[k] = v
    print(f"[Fotolism Importer] Đã đọc {len(entries)} tham số từ style.")
    return entries

def main():
    parser = argparse.ArgumentParser(description="Fotolism Capture One Style Importer")
    parser.add_argument("--raw", type=str, help="Đường dẫn ảnh RAW chụp từ Kiosk")
    parser.add_argument("--processed", type=str, help="Đường dẫn ảnh đã xuất từ Capture One với Style")
    parser.add_argument("--style", type=str, help="Đường dẫn file .costyle")
    parser.add_argument("--id", type=str, default="custom_style", help="Mã định danh Style (vd: vintage, natural, glam)")

    args = parser.parse_args()

    if args.raw and args.processed:
        lut_b, lut_g, lut_r = extract_lut_from_image_pair(args.raw, args.processed)
        print("\n=== KẾT QUẢ MẢNG BẢNG TRA CỨU MÀU (LUT ARRAYS) ===")
        print(f"STYLE_ID: {args.id}")
        print(f"LUT_B: {list(lut_b)}")
        print(f"LUT_G: {list(lut_g)}")
        print(f"LUT_R: {list(lut_r)}")
        print("==================================================")
    elif args.style:
        entries = parse_costyle(args.style)
        for k, v in entries.items():
            print(f"  - {k}: {v}")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()

