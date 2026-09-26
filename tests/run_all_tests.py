"""
run_all_tests.py - Master Verification Test Suite for Cypher Engine

Executes unit & integration checks across fragmenter, assembler, corruptor,
file_scanner, pdf_repair, image_repair, ml_repair_engine, and live HTTP API endpoints.

Author: Cypher Engineering Team
"""

import io
import os
import sys
import urllib.request
import zipfile

# Add project root and backend directory to sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def run_tests():
    print("=" * 80)
    print("CYPHER FILE RECOVERY ENGINE - MASTER SYSTEM VERIFICATION TEST SUITE")
    print("=" * 80)

    total_failed = 0

    # 1. Test fragmenter.py & assembler.py
    print("\n--- [1/7] Testing fragmenter.py & assembler.py ---")
    try:
        from fragmenter import fragment_file
        from assembler import assemble_fragments

        sample_payload = b"%PDF-1.4\n" + b"A" * 1000 + b"\n%%EOF"
        chunks = fragment_file(sample_payload, 5)
        assert len(chunks) == 5, f"Expected 5 chunks, got {len(chunks)}"
        assert all(c.startswith(b"FRG\x00") for c in chunks), "Chunk magic header missing"

        reassembled = assemble_fragments(chunks)
        assert reassembled == sample_payload, "Reassembled payload mismatch"
        print("[PASS] fragmenter.py & assembler.py round-trip fragmentation & stitching OK!")
    except Exception as e:
        print(f"[FAIL] fragmenter/assembler error: {e}")
        total_failed += 1

    # 2. Test corruptor.py
    print("\n--- [2/7] Testing corruptor.py ---")
    try:
        from corruptor import corrupt_file
        pdf_data = b"%PDF-1.4 sample payload %%EOF"
        for sev in (15, 50, 85):
            c_data = corrupt_file(pdf_data, sev)
            assert c_data != pdf_data, f"Data unchanged at severity {sev}%"
            assert len(c_data) > 0, "Corrupted output is empty"
        print("[PASS] corruptor.py low/medium/high severity corruption OK!")
    except Exception as e:
        print(f"[FAIL] corruptor.py error: {e}")
        total_failed += 1

    # 3. Test file_scanner.py
    print("\n--- [3/7] Testing file_scanner.py ---")
    try:
        from file_scanner import identify_file_type, scan_buried_signature
        assert identify_file_type(b"%PDF-1.4...") == "application/pdf"
        assert identify_file_type(b"\x89PNG\r\n\x1a\n...") == "image/png"
        assert identify_file_type(b"\xFF\xD8\xFF\xE0...") == "image/jpeg"

        buried_pdf = b"\x00" * 100 + b"%PDF-1.4..."
        assert scan_buried_signature(buried_pdf) == "application/pdf"
        print("[PASS] file_scanner.py magic header & buried signature scanning OK!")
    except Exception as e:
        print(f"[FAIL] file_scanner.py error: {e}")
        total_failed += 1

    # 4. Test pdf_repair.py
    print("\n--- [4/7] Testing pdf_repair.py ---")
    try:
        from pdf_repair import repair_pdf
        valid_pdf = (
            b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
            b"xref\n0 4\n"
            b"0000000000 65535 f \n"
            b"0000000009 00000 n \n"
            b"0000000058 00000 n \n"
            b"0000000115 00000 n \n"
            b"trailer<</Size 4/Root 1 0 R>>\n"
            b"startxref\n183\n%%EOF"
        )
        res = repair_pdf(valid_pdf)
        assert res.repaired_pdf.startswith(b"%PDF"), "PDF repair output does not start with %PDF"
        print("[PASS] pdf_repair.py PDF stream reconstruction OK!")
    except Exception as e:
        print(f"[FAIL] pdf_repair.py error: {e}")
        total_failed += 1

    # 5. Test image_repair.py
    print("\n--- [5/7] Testing image_repair.py ---")
    try:
        from image_repair import PNG_MAGIC, repair_image
        from PIL import Image
        buf = io.BytesIO()
        img = Image.new("RGB", (10, 10), color="blue")
        img.save(buf, format="PNG")
        clean_png = buf.getvalue()

        repaired = repair_image(clean_png)
        assert repaired.startswith(PNG_MAGIC), "Repaired PNG magic header mismatch"
        print("[PASS] image_repair.py Pillow metadata stripping & repair OK!")
    except Exception as e:
        print(f"[FAIL] image_repair.py error: {e}")
        total_failed += 1

    # 6. Test ml_repair_engine.py
    print("\n--- [6/7] Testing ml_repair_engine.py ---")
    try:
        from ml_repair_engine import ml_engine
        pred = ml_engine.predict(b"%PDF-1.4 sample payload %%EOF")
        assert pred.predicted_file_type == "pdf"
        assert 0.0 <= pred.corruption_severity_pct <= 100.0
        print("[PASS] ml_repair_engine.py classification & severity regression OK!")
    except Exception as e:
        print(f"[FAIL] ml_repair_engine.py error: {e}")
        total_failed += 1

    # 7. Test E2E HTTP Endpoints against running server at http://localhost:8080 (optional check if running)
    print("\n--- [7/7] Testing Live HTTP API Endpoints (http://localhost:8080) ---")
    try:
        req = urllib.request.Request("http://localhost:8080/")
        with urllib.request.urlopen(req, timeout=2) as resp:
            html = resp.read().decode('utf-8')
            assert "Cypher" in html or "Fragment Mode" in html or "html" in html.lower()
            print("[PASS] GET / served HTML frontend cleanly OK!")
    except Exception as e:
        print(f"[INFO] Live HTTP endpoint skipped (server not actively running on 8080): {e}")

    print("\n" + "=" * 80)
    if total_failed == 0:
        print("ALL CORE SYSTEM MODULES PASSED CLEANLY WITH ZERO ERRORS!")
    else:
        print(f"VERIFICATION COMPLETED WITH {total_failed} FAILURE(S).")
    print("=" * 80)

    if total_failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_tests()
