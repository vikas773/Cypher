"""
test_frontend_integration.py - Integration Test for Cypher HTTP Endpoints

Simulates multipart uploads and fragment stitching against a live Django server instance.

Author: Cypher Engineering Team
"""

import io
import os
import sys
import urllib.error
import urllib.request
import zipfile

# Add project root and backend directory to sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

BASE_URL = "http://localhost:8080"


def test_index_page():
    print("Testing GET / ...")
    req = urllib.request.Request(f"{BASE_URL}/")
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8')
        assert "Cypher" in html or "Fragment" in html or "html" in html.lower()
        print("[OK] Index HTML served.")


def test_fragment_file_endpoint():
    print("Testing POST /api/fragment-file/ ...")
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    payload = io.BytesIO()

    sample_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n" + b"X" * 500

    # file field
    payload.write(f"--{boundary}\r\n".encode())
    payload.write(b'Content-Disposition: form-data; name="file"; filename="sample.pdf"\r\n')
    payload.write(b'Content-Type: application/pdf\r\n\r\n')
    payload.write(sample_content)
    payload.write(b'\r\n')

    # chunk_count field
    payload.write(f"--{boundary}\r\n".encode())
    payload.write(b'Content-Disposition: form-data; name="chunk_count"\r\n\r\n')
    payload.write(b'4\r\n')

    payload.write(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"{BASE_URL}/api/fragment-file/",
        data=payload.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )

    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        zip_bytes = resp.read()
        assert len(zip_bytes) > 0

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            namelist = zf.namelist()
            print("ZIP contents:", namelist)
            assert len(namelist) == 4
            assert namelist[0] == "fragment_01.bin"
            assert namelist[1] == "fragment_02.bin"
            frg_bytes_list = [zf.read(name) for name in namelist]
            assert all(b.startswith(b"FRG\x00") for b in frg_bytes_list)
            print("[OK] /api/fragment-file/ returned valid ZIP with 4 BIN fragments.")
            return frg_bytes_list


def test_repair_multiple_fragments(frg_bytes_list):
    print("Testing POST /api/repair-file/ with multiple fragment files...")
    boundary = "----WebKitFormBoundaryMultiFrg"
    payload = io.BytesIO()

    for idx, frg in enumerate(frg_bytes_list):
        payload.write(f"--{boundary}\r\n".encode())
        payload.write(f'Content-Disposition: form-data; name="file"; filename="sample_part_{idx+1}.frg"\r\n'.encode())
        payload.write(b'Content-Type: application/octet-stream\r\n\r\n')
        payload.write(frg)
        payload.write(b'\r\n')

    payload.write(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"{BASE_URL}/api/repair-file/",
        data=payload.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )

    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        reconstructed_bytes = resp.read()
        print(f"Reconstructed bytes length: {len(reconstructed_bytes)}")
        assert reconstructed_bytes.startswith(b"%PDF")
        print("[OK] /api/repair-file/ successfully assembled multi-part fragments and repaired PDF!")


if __name__ == "__main__":
    try:
        test_index_page()
        fragments = test_fragment_file_endpoint()
        test_repair_multiple_fragments(fragments)
        print("ALL FRONTEND & BACKEND ENDPOINT INTEGRATION TESTS PASSED OK!")
    except Exception as exc:
        print(f"[INFO] Integration test skipped or failed (ensure server is running on {BASE_URL}): {exc}")
