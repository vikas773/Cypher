"""
django_repair_backend.py - Django Web Backend File Repair Engine Service

Integrates:
  - file_scanner.py (Magic number detection & deep offset scanning)
  - pdf_repair.py (pikepdf XREF recovery + PyMuPDF fallback)
  - image_repair.py (Pillow metadata stripping & JPEG/PNG header grafting)
  - ml_repair_engine.py (Machine learning classification & severity regression)
  - fragmenter.py & assembler.py (Multi-part fragment packetizing & stitching)

Features:
  - Single POST endpoint (`/api/repair/`) accepting multipart/form-data file uploads.
  - Strict Memory Operation: Configured with MemoryFileUploadHandler to ensure files
    are NEVER spilled or saved to local disk storage.
  - Memory Streaming Response: Serves repaired files directly via FileResponse from io.BytesIO.
  - Production error handling with standard HTTP status codes (200, 400, 415, 422, 500).

Author: Cypher Engineering Team
"""

from __future__ import annotations

import io
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Tuple, Union

# Dynamic path resolution to support backend module imports
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_backend_dir)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

# Configure logging
logger = logging.getLogger(__name__)

import zipfile

# Import local repair & fragmenter/assembler modules
try:
    from file_scanner import deep_scan_signature, identify_file_type, scan_buried_signature
    from pdf_repair import (
        InvalidPDFInputError,
        PasswordProtectedError,
        UnrecoverablePDFError,
        repair_pdf,
    )
    from image_repair import (
        InvalidImageInputError,
        UnrecoverableImageError,
        repair_image_detailed,
    )
    from corruptor import (
        FileCorruptionError,
        InvalidInputError as CorruptorInvalidInputError,
        corrupt_file,
    )
    from ml_repair_engine import ml_engine, MLPredictionResult
    from fragmenter import (
        fragment_file,
        InvalidInputError as FragmenterInvalidInputError,
    )
    from assembler import (
        assemble_fragments,
        AssemblerError,
        InvalidFragmentError as AssemblerInvalidFragmentError,
        MismatchedFileIDError,
        MissingFragmentError,
    )
except ImportError:
    try:
        from backend.file_scanner import deep_scan_signature, identify_file_type, scan_buried_signature
        from backend.pdf_repair import (
            InvalidPDFInputError,
            PasswordProtectedError,
            UnrecoverablePDFError,
            repair_pdf,
        )
        from backend.image_repair import (
            InvalidImageInputError,
            UnrecoverableImageError,
            repair_image_detailed,
        )
        from backend.corruptor import (
            FileCorruptionError,
            InvalidInputError as CorruptorInvalidInputError,
            corrupt_file,
        )
        from backend.ml_repair_engine import ml_engine, MLPredictionResult
        from backend.fragmenter import (
            fragment_file,
            InvalidInputError as FragmenterInvalidInputError,
        )
        from backend.assembler import (
            assemble_fragments,
            AssemblerError,
            InvalidFragmentError as AssemblerInvalidFragmentError,
            MismatchedFileIDError,
            MissingFragmentError,
        )
    except ImportError as err:
        logger.error("Failed to import file repair, corruptor, ML, fragmenter, or assembler modules: %s", err)
        raise

# Import Django components
import django
from django.conf import settings

# ═══════════════════════════════════════════════════════════════════════════
# Programmatic Django Settings Initialization
# ═══════════════════════════════════════════════════════════════════════════

if not settings.configured:
    settings.configure(
        DEBUG=True,
        SECRET_KEY="cypher-file-repair-backend-secret-key-production-grade",
        ALLOWED_HOSTS=["*"],
        ROOT_URLCONF=__name__,
        MIDDLEWARE=[
            "django.middleware.common.CommonMiddleware",
        ],
        INSTALLED_APPS=[
            "django.contrib.contenttypes",
        ],
        # Force Django to keep all uploaded files entirely in memory (100MB limit).
        # Ensures uploaded payloads NEVER touch the local file system.
        FILE_UPLOAD_HANDLERS=[
            "django.core.files.uploadhandler.MemoryFileUploadHandler",
        ],
        FILE_UPLOAD_MAX_MEMORY_SIZE=104_857_600,  # 100 MB
        DATA_UPLOAD_MAX_MEMORY_SIZE=104_857_600,  # 100 MB
    )
    django.setup()

from django.http import (
    FileResponse,
    HttpRequest,
    HttpResponse,
    HttpResponseBadRequest,
    HttpResponseServerError,
    JsonResponse,
)
from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST


# ═══════════════════════════════════════════════════════════════════════════
# MIME Type & Extension Mapping Utilities
# ═══════════════════════════════════════════════════════════════════════════

MIME_EXTENSION_MAP: Dict[str, str] = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
}


def _get_repaired_filename(original_filename: str, mime_type: str) -> str:
    """Generates a clean 'repaired_' filename with appropriate extension."""
    base_name = os.path.splitext(original_filename)[0] if original_filename else "file"
    ext = MIME_EXTENSION_MAP.get(mime_type, "bin")
    return f"repaired_{base_name}.{ext}"


# ═══════════════════════════════════════════════════════════════════════════
# Single POST Endpoint View
# ═══════════════════════════════════════════════════════════════════════════

@csrf_exempt
@require_POST
def repair_file_view(request: HttpRequest) -> HttpResponse:
    """
    POST /api/repair/ or /api/repair-file/

    Accepts a multipart/form-data file upload under key 'file' or 'files'.
    Reads payload directly into memory, scans magic bytes to identify true MIME type,
    routes to appropriate repair engine, and streams repaired file as a response.
    """
    uploaded_files = request.FILES.getlist("file") or request.FILES.getlist("files")
    if not uploaded_files and request.FILES:
        uploaded_files = list(request.FILES.values())

    if not uploaded_files:
        return JsonResponse(
            {
                "error": "Bad Request",
                "message": "Missing file upload parameter 'file' in multipart form data.",
            },
            status=400,
        )

    # Inspect Files & Check for .bin / .frg Extensions & b'FRG\x00' Custom Magic Headers
    fragment_buffers: List[bytes] = []
    non_fragment_buffers: List[bytes] = []
    original_filenames: List[str] = []

    for up_file in uploaded_files:
        fname = up_file.name or "uploaded_file"
        original_filenames.append(fname)
        try:
            content = up_file.read()
        except Exception as exc:
            logger.error("Failed reading uploaded file bytes into memory: %s", exc)
            return JsonResponse(
                {"error": "Read Error", "message": f"Could not read upload payload '{fname}': {exc}"},
                status=400,
            )

        if not content:
            continue

        ext_lower = os.path.splitext(fname)[1].lower()
        has_bin_ext = ext_lower in (".bin", ".frg")
        has_frg_magic = content[:4] == b"FRG\x00"

        if has_frg_magic or (has_bin_ext and has_frg_magic):
            fragment_buffers.append(content)
        elif len(uploaded_files) == 1 and (content[:4] == b"PK\x03\x04" or ext_lower == ".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
                    zip_frgs: List[bytes] = []
                    for zname in sorted(zf.namelist()):
                        zdata = zf.read(zname)
                        if zdata[:4] == b"FRG\x00":
                            zip_frgs.append(zdata)
                    if zip_frgs:
                        fragment_buffers.extend(zip_frgs)
                    else:
                        non_fragment_buffers.append(content)
            except Exception:
                non_fragment_buffers.append(content)
        else:
            non_fragment_buffers.append(content)

    if fragment_buffers and len(fragment_buffers) >= 1:
        try:
            stitched_payload = assemble_fragments(fragment_buffers)
            original_filename = f"stitched_{original_filenames[0]}"
            file_bytes = stitched_payload
        except (AssemblerInvalidFragmentError, MismatchedFileIDError, MissingFragmentError, AssemblerError) as exc:
            return JsonResponse(
                {
                    "error": "Fragment Assembly Error",
                    "message": f"Failed assembling packetized .bin/.frg fragments: {exc}",
                },
                status=400,
            )
    elif non_fragment_buffers:
        file_bytes = non_fragment_buffers[0]
        original_filename = original_filenames[0]
    else:
        return JsonResponse(
            {"error": "Bad Request", "message": "Uploaded files contained zero byte payloads."},
            status=400,
        )

    # Deep Scan for true file format
    mime_type = identify_file_type(file_bytes) or scan_buried_signature(file_bytes)

    if not mime_type:
        mime_type = "application/pdf"

    try:
        if mime_type == "application/pdf":
            repair_result = repair_pdf(file_bytes)
            repaired_bytes = repair_result.repaired_pdf
            out_mime = "application/pdf"

        elif mime_type in ("image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"):
            fmt_hint = MIME_EXTENSION_MAP.get(mime_type, "png").upper()
            image_result = repair_image_detailed(file_bytes, preferred_format=fmt_hint)
            repaired_bytes = image_result.repaired_bytes
            out_mime = f"image/{image_result.format.lower()}"

        else:
            repair_result = repair_pdf(file_bytes)
            repaired_bytes = repair_result.repaired_pdf
            out_mime = "application/pdf"

    except (InvalidPDFInputError, InvalidImageInputError) as exc:
        return JsonResponse({"error": "Bad Request", "message": str(exc)}, status=400)
    except PasswordProtectedError as exc:
        return JsonResponse({"error": "Unauthorized", "message": str(exc)}, status=401)
    except (UnrecoverablePDFError, UnrecoverableImageError) as exc:
        return JsonResponse({"error": "Unprocessable Entity", "message": str(exc)}, status=422)
    except Exception as exc:
        logger.exception("Unexpected error during file repair processing: %s", exc)
        return JsonResponse({"error": "Internal Server Error", "message": str(exc)}, status=500)

    download_filename = _get_repaired_filename(original_filename, out_mime)
    memory_stream = io.BytesIO(repaired_bytes)

    response = FileResponse(
        memory_stream,
        content_type=out_mime,
        as_attachment=True,
        filename=download_filename,
    )
    response["Content-Length"] = str(len(repaired_bytes))
    response["X-Repaired-By"] = "Cypher-Engine/1.0"
    return response


@csrf_exempt
@require_POST
def corrupt_file_view(request: HttpRequest) -> HttpResponse:
    """POST /api/corrupt-file/ - Simulates structural corruption."""
    if "file" not in request.FILES:
        return JsonResponse({"error": "Bad Request", "message": "Missing file upload parameter 'file'."}, status=400)

    up_file = request.FILES["file"]
    severity_str = request.POST.get("severity") or request.GET.get("severity")

    if not severity_str:
        return JsonResponse({"error": "Bad Request", "message": "Missing required parameter 'severity' (1-100)."}, status=400)

    try:
        severity = int(severity_str)
    except ValueError:
        return JsonResponse({"error": "Bad Request", "message": f"Invalid severity value '{severity_str}'."}, status=400)

    try:
        raw_bytes = up_file.read()
        corrupted_bytes = corrupt_file(raw_bytes, severity)
    except CorruptorInvalidInputError as exc:
        return JsonResponse({"error": "Bad Request", "message": str(exc)}, status=400)
    except FileCorruptionError as exc:
        return JsonResponse({"error": "Internal Server Error", "message": str(exc)}, status=500)

    base_name = os.path.splitext(up_file.name or "file")[0]
    out_name = f"{base_name}.corrupted"
    stream = io.BytesIO(corrupted_bytes)

    response = FileResponse(stream, content_type="application/octet-stream", as_attachment=True, filename=out_name)
    response["Content-Length"] = str(len(corrupted_bytes))
    return response


@csrf_exempt
@require_POST
def ml_classify_view(request: HttpRequest) -> HttpResponse:
    """POST /api/ml-classify/ - Runs ML diagnostics."""
    if "file" not in request.FILES:
        return JsonResponse({"error": "Bad Request", "message": "Missing file parameter 'file'."}, status=400)

    up_file = request.FILES["file"]
    raw_bytes = up_file.read()
    pred_res: MLPredictionResult = ml_engine.predict(raw_bytes)
    return JsonResponse(pred_res.to_dict(), status=200)


@csrf_exempt
@require_POST
def fragment_file_view(request: HttpRequest) -> HttpResponse:
    """POST /api/fragment-file/ - Splits binary file into packetized .frg fragments."""
    if "file" not in request.FILES:
        return JsonResponse({"error": "Bad Request", "message": "Missing file upload parameter 'file'."}, status=400)

    up_file = request.FILES["file"]
    chunk_count_str = request.POST.get("chunk_count") or request.GET.get("chunk_count") or "3"

    try:
        chunk_count = int(chunk_count_str)
    except ValueError:
        return JsonResponse({"error": "Bad Request", "message": f"Invalid chunk_count value '{chunk_count_str}'."}, status=400)

    raw_bytes = up_file.read()
    original_filename = up_file.name or "file"

    try:
        chunks = fragment_file(raw_bytes, chunk_count)
    except FragmenterInvalidInputError as exc:
        return JsonResponse({"error": "Invalid Input", "message": str(exc)}, status=400)

    base_name = os.path.splitext(original_filename)[0] or "sample"
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, chunk_data in enumerate(chunks):
            chunk_filename = f"fragment_{idx+1:02d}.bin"
            zf.writestr(chunk_filename, chunk_data)

    zip_bytes = zip_buffer.getvalue()
    zip_download_name = f"{base_name}_fragments.zip"

    response = FileResponse(io.BytesIO(zip_bytes), content_type="application/zip", as_attachment=True, filename=zip_download_name)
    response["Content-Length"] = str(len(zip_bytes))
    return response


def index_view(request: HttpRequest) -> HttpResponse:
    """Serves the single-page web app frontend (index.html or dist/index.html)."""
    candidate_paths = [
        os.path.join(_project_root, "dist", "index.html"),
        os.path.join(_project_root, "index.html"),
        os.path.join(_backend_dir, "index.html"),
    ]
    for path_candidate in candidate_paths:
        if os.path.exists(path_candidate):
            with open(path_candidate, "rb") as f:
                return HttpResponse(f.read(), content_type="text/html; charset=utf-8")
    return HttpResponse("<h1>Cypher File Repair Engine Backend</h1><p>API Endpoint: <code>POST /api/repair/</code></p>")


urlpatterns = [
    path("", index_view, name="index"),
    path("index.html", index_view, name="index_html"),
    path("api/repair/", repair_file_view, name="repair_file"),
    path("repair/", repair_file_view, name="repair_file_alt"),
    path("api/repair-file/", repair_file_view, name="repair_file_legacy"),
    path("repair-file/", repair_file_view, name="repair_file_legacy_alt"),
    path("api/corrupt-file/", corrupt_file_view, name="corrupt_file"),
    path("corrupt-file/", corrupt_file_view, name="corrupt_file_alt"),
    path("api/fragment-file/", fragment_file_view, name="fragment_file"),
    path("fragment-file/", fragment_file_view, name="fragment_file_alt"),
    path("api/ml-classify/", ml_classify_view, name="ml_classify"),
    path("ml-classify/", ml_classify_view, name="ml_classify_alt"),
]


if __name__ == "__main__":
    import unittest
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.test import Client, RequestFactory
    from PIL import Image

    def _generate_test_png_bytes() -> bytes:
        buf = io.BytesIO()
        img = Image.new("RGB", (20, 20), color="green")
        img.save(buf, format="PNG")
        return buf.getvalue()

    class TestDjangoRepairBackend(unittest.TestCase):

        def setUp(self) -> None:
            self.client = Client()
            self.factory = RequestFactory()
            self.clean_png = _generate_test_png_bytes()

        def test_post_missing_file_parameter(self) -> None:
            response = self.client.post("/api/repair/")
            self.assertEqual(response.status_code, 400)
            data = response.json()
            self.assertEqual(data["error"], "Bad Request")

        def test_post_successful_png_repair(self) -> None:
            corrupted_png_bytes = b"\x00" * 150 + self.clean_png
            upload = SimpleUploadedFile("corrupted_sample.png", corrupted_png_bytes, content_type="image/png")
            response = self.client.post("/api/repair/", {"file": upload})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "image/png")

    if len(sys.argv) > 1 and sys.argv[1] == "runserver":
        from django.core.management import execute_from_command_line
        execute_from_command_line(sys.argv)
    else:
        print("=" * 72)
        print("django_repair_backend.py - Integration Test Suite")
        print("  Django version:", django.get_version())
        print("  To launch live server: python backend/django_repair_backend.py runserver 8000")
        print("=" * 72)

        suite = unittest.TestLoader().loadTestsFromTestCase(TestDjangoRepairBackend)
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)

        if result.wasSuccessful():
            print("\n[PASS] All Django repair backend tests passed successfully!")
        else:
            print("\n[FAIL] Some Django integration tests failed.")
            sys.exit(1)
