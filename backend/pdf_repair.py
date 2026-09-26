"""
pdf_repair.py — Corrupted PDF Byte-Stream Repair Engine

Two-stage repair pipeline:
  1. Primary:  pikepdf opens the broken stream in recovery mode, ignoring XREF
               table corruption, rewriting with a healthy cross-reference table.
  2. Fallback: PyMuPDF (fitz) extracts raw text & images from the broken stream
               and assembles a brand-new PDF from the salvaged content.

Both stages accept and return raw byte streams (bytes), never file paths.

Author: Cypher Engineering Team
"""

from __future__ import annotations

import io
import logging
import os
import sys
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import List, Optional, Sequence, Union

# Ensure backend directory is present in sys.path
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# ---------------------------------------------------------------------------
# Library imports — guarded so the module can still be imported even if one of
# the optional backends is not installed.
# ---------------------------------------------------------------------------
try:
    import pikepdf
    from pikepdf import (
        PasswordError as PikePasswordError,
        PdfError as PikePdfError,
    )
    _HAS_PIKEPDF = True
except ImportError:
    _HAS_PIKEPDF = False

try:
    import pymupdf as fitz  # PyMuPDF (aliased for API compat)
    _HAS_FITZ = True
except ImportError:
    _HAS_FITZ = False

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Public data types
# ═══════════════════════════════════════════════════════════════════════════

class RepairStrategy(Enum):
    """Which backend actually succeeded in repairing the PDF."""
    PIKEPDF = auto()
    PYMUPDF_FALLBACK = auto()
    RAW_STREAM_SALVAGE = auto()


class PDFRepairError(Exception):
    """Base exception for all pdf_repair operations."""
    pass


class InvalidPDFInputError(PDFRepairError, TypeError):
    """Raised when the caller passes a non-bytes-like object."""
    pass


class UnrecoverablePDFError(PDFRepairError):
    """Raised when both pikepdf and PyMuPDF fail to salvage any content."""
    pass


class PasswordProtectedError(PDFRepairError):
    """Raised when the PDF requires a password that was not supplied."""
    pass


@dataclass(frozen=True)
class ExtractedImage:
    """An image extracted from a broken PDF page."""
    page_number: int
    image_bytes: bytes
    width: int
    height: int
    color_space: str


@dataclass(frozen=True)
class ExtractedPage:
    """Content salvaged from a single PDF page."""
    page_number: int
    text: str
    images: List[ExtractedImage] = field(default_factory=list)


@dataclass(frozen=True)
class RepairResult:
    """Structured outcome of a PDF repair attempt."""
    repaired_pdf: bytes
    strategy: RepairStrategy
    page_count: int
    pages_recovered: int
    warnings: List[str] = field(default_factory=list)

    @property
    def fully_recovered(self) -> bool:
        return self.pages_recovered == self.page_count

    def __str__(self) -> str:
        pct = (self.pages_recovered / self.page_count * 100) if self.page_count else 0
        return (
            f"RepairResult(strategy={self.strategy.name}, "
            f"pages={self.pages_recovered}/{self.page_count} [{pct:.0f}%], "
            f"size={len(self.repaired_pdf):,} bytes, "
            f"warnings={len(self.warnings)})"
        )


# ═══════════════════════════════════════════════════════════════════════════
# Input validation
# ═══════════════════════════════════════════════════════════════════════════

def _validate_bytes(data: Union[bytes, bytearray, memoryview], label: str = "data") -> bytes:
    """Validates and normalises raw byte input."""
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise InvalidPDFInputError(
            f"'{label}' must be bytes | bytearray | memoryview, "
            f"got {type(data).__name__!r}."
        )
    raw = bytes(data)
    if not raw:
        raise InvalidPDFInputError(f"'{label}' must not be empty.")
    return raw


# ═══════════════════════════════════════════════════════════════════════════
# Stage 1 — pikepdf recovery (XREF rebuild)
# ═══════════════════════════════════════════════════════════════════════════

def _repair_with_pikepdf(
    raw_pdf: bytes,
    password: Optional[str] = None,
) -> RepairResult:
    """
    Attempts to open a corrupted PDF byte stream with pikepdf in recovery mode.
    """
    if not _HAS_PIKEPDF:
        raise RuntimeError("pikepdf is not installed. Install it with: pip install pikepdf")

    warnings: List[str] = []
    stream = io.BytesIO(raw_pdf)

    try:
        open_kwargs: dict = {"suppress_warnings": False}
        if password is not None:
            open_kwargs["password"] = password

        pdf = pikepdf.open(stream, **open_kwargs)

    except PikePasswordError:
        raise PasswordProtectedError("PDF is encrypted and requires a password for repair.")
    except PikePdfError as exc:
        logger.warning("pikepdf could not open stream: %s", exc)
        raise

    try:
        total_pages = len(pdf.pages)
        pages_ok = 0

        for idx, page in enumerate(pdf.pages):
            try:
                _ = page.mediabox
                pages_ok += 1
            except Exception as page_exc:
                warnings.append(f"Page {idx + 1}: skipped — {type(page_exc).__name__}: {page_exc}")

        out_buf = io.BytesIO()
        pdf.save(
            out_buf,
            linearize=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            compress_streams=True,
            preserve_pdfa=True,
        )
        pdf.close()

        return RepairResult(
            repaired_pdf=out_buf.getvalue(),
            strategy=RepairStrategy.PIKEPDF,
            page_count=total_pages,
            pages_recovered=pages_ok,
            warnings=warnings,
        )

    except PikePdfError as save_exc:
        logger.error("pikepdf save failed after successful open: %s", save_exc)
        raise
    except Exception as unexpected:
        logger.error("Unexpected error during pikepdf rewrite: %s", unexpected)
        raise


# ═══════════════════════════════════════════════════════════════════════════
# Stage 2 — PyMuPDF fallback (content extraction → new PDF construction)
# ═══════════════════════════════════════════════════════════════════════════

def _extract_content_with_fitz(raw_pdf: bytes) -> List[ExtractedPage]:
    """Uses PyMuPDF (fitz) to extract raw text and image objects from a broken PDF byte stream."""
    if not _HAS_FITZ:
        raise RuntimeError("PyMuPDF is not installed. Install it with: pip install PyMuPDF")

    pages: List[ExtractedPage] = []

    try:
        doc = fitz.open(stream=raw_pdf, filetype="pdf")
    except Exception as open_exc:
        logger.error("PyMuPDF failed to open stream: %s", open_exc)
        raise

    for page_idx in range(len(doc)):
        page_num = page_idx + 1
        page_text = ""
        page_images: List[ExtractedImage] = []

        try:
            page = doc[page_idx]
            page_text = page.get_text("text") or ""
        except Exception as text_exc:
            logger.warning("Page %d: text extraction failed — %s", page_num, text_exc)

        try:
            image_list = page.get_images(full=True)
            for img_meta in image_list:
                xref = img_meta[0]
                try:
                    base_image = doc.extract_image(xref)
                    if base_image and base_image.get("image"):
                        page_images.append(
                            ExtractedImage(
                                page_number=page_num,
                                image_bytes=base_image["image"],
                                width=base_image.get("width", 0),
                                height=base_image.get("height", 0),
                                color_space=base_image.get("colorspace", "unknown"),
                            )
                        )
                except Exception as img_exc:
                    logger.warning("Page %d, xref %d: image extraction failed — %s", page_num, xref, img_exc)
        except Exception as img_list_exc:
            logger.warning("Page %d: image list retrieval failed — %s", page_num, img_list_exc)

        pages.append(ExtractedPage(page_number=page_num, text=page_text, images=page_images))

    doc.close()
    return pages


def _rebuild_pdf_from_content(extracted_pages: Sequence[ExtractedPage]) -> bytes:
    """Constructs a brand-new, structurally valid PDF from extracted text and images using PyMuPDF."""
    if not _HAS_FITZ:
        raise RuntimeError("PyMuPDF is required for fallback PDF construction.")

    new_doc = fitz.open()
    pages_with_content = 0

    for ep in extracted_pages:
        page = new_doc.new_page(width=595, height=842)
        has_content = False

        if ep.text.strip():
            try:
                text_rect = fitz.Rect(50, 50, 545, 792)
                rc = page.insert_textbox(
                    text_rect,
                    ep.text,
                    fontsize=10,
                    fontname="helv",
                    align=fitz.TEXT_ALIGN_LEFT,
                )
                has_content = True
            except Exception as text_ins_exc:
                logger.warning("Page %d: text insertion failed — %s", ep.page_number, text_ins_exc)

        for img in ep.images:
            try:
                img_rect = fitz.Rect(50, 50, min(545, 50 + img.width), min(792, 50 + img.height))
                page.insert_image(img_rect, stream=img.image_bytes)
                has_content = True
            except Exception as img_ins_exc:
                logger.warning("Page %d: image insertion failed — %s", ep.page_number, img_ins_exc)

        if has_content:
            pages_with_content += 1

    if pages_with_content == 0:
        new_doc.close()
        raise UnrecoverablePDFError("Fallback extracted zero usable content from the corrupted PDF.")

    out_bytes = new_doc.tobytes(deflate=True, garbage=4, clean=True)
    new_doc.close()
    return out_bytes


def _repair_with_fitz(raw_pdf: bytes) -> RepairResult:
    """Full fallback pipeline: extract content with PyMuPDF, then rebuild."""
    warnings: List[str] = []
    extracted = _extract_content_with_fitz(raw_pdf)

    if not extracted:
        raise UnrecoverablePDFError("PyMuPDF could not extract any pages from the stream.")

    total_pages = len(extracted)
    pages_with_data = sum(1 for ep in extracted if ep.text.strip() or ep.images)

    if pages_with_data == 0:
        raise UnrecoverablePDFError("PyMuPDF opened the file but every page was empty or unreadable.")

    empty_pages = total_pages - pages_with_data
    if empty_pages > 0:
        warnings.append(f"{empty_pages} of {total_pages} page(s) had no recoverable content.")

    rebuilt_bytes = _rebuild_pdf_from_content(extracted)

    return RepairResult(
        repaired_pdf=rebuilt_bytes,
        strategy=RepairStrategy.PYMUPDF_FALLBACK,
        page_count=total_pages,
        pages_recovered=pages_with_data,
        warnings=warnings,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Public API — Orchestrator
# ═══════════════════════════════════════════════════════════════════════════

def repair_pdf(
    raw_pdf: Union[bytes, bytearray, memoryview],
    *,
    password: Optional[str] = None,
    skip_pikepdf: bool = False,
    skip_fitz: bool = False,
) -> RepairResult:
    """
    Main entry point — attempts to repair a corrupted PDF byte stream.

    Pipeline:
      1. pikepdf (QPDF engine): opens broken stream in recovery mode, ignors XREF errors, rewrites.
      2. PyMuPDF fallback: extracts raw text and images from stream and constructs new PDF.
      3. Deep Raw Byte Stream Salvage: Emergency salvage parser.
    """
    data = _validate_bytes(raw_pdf, label="raw_pdf")

    if b"%PDF" not in data[:1024]:
        logger.warning("Input does not contain a %%PDF header within the first 1024 bytes. Proceeding anyway.")

    pikepdf_exc: Optional[Exception] = None
    fitz_exc: Optional[Exception] = None

    if not skip_pikepdf and _HAS_PIKEPDF:
        try:
            return _repair_with_pikepdf(data, password=password)
        except PasswordProtectedError:
            raise
        except Exception as exc:
            pikepdf_exc = exc
            logger.warning("Stage 1 (pikepdf) failed: %s. Falling back to PyMuPDF.", exc)

    if not skip_fitz and _HAS_FITZ:
        try:
            result = _repair_with_fitz(data)
            if pikepdf_exc is not None:
                result.warnings.append(f"pikepdf stage failed ({type(pikepdf_exc).__name__}); recovered via PyMuPDF.")
            return result
        except Exception as exc:
            fitz_exc = exc
            logger.error("Stage 2 (PyMuPDF) also failed: %s", exc)

    try:
        result = _repair_with_raw_byte_salvage(data)
        if pikepdf_exc is not None:
            result.warnings.append(f"pikepdf stage: {pikepdf_exc}")
        if fitz_exc is not None:
            result.warnings.append(f"PyMuPDF stage: {fitz_exc}")
        return result
    except Exception as salvage_exc:
        logger.error("Stage 3 salvage failed: %s", salvage_exc)

    detail_parts: List[str] = []
    if pikepdf_exc:
        detail_parts.append(f"pikepdf: {pikepdf_exc}")
    if fitz_exc:
        detail_parts.append(f"PyMuPDF: {fitz_exc}")

    raise UnrecoverablePDFError("All repair strategies exhausted.\n" + "\n".join(f"  • {d}" for d in detail_parts))


def _extract_zlib_chunks(data: bytes) -> List[bytes]:
    """Scans for zlib compressed chunks in raw bytes and decompresses them."""
    import zlib
    decompressed_buffers: List[bytes] = []
    for idx in range(len(data) - 4):
        if data[idx : idx + 2] in (b"\x78\x01", b"\x78\x9c", b"\x78\xda"):
            try:
                dec = zlib.decompress(data[idx:], zlib.MAX_WBITS)
                if len(dec) > 10:
                    decompressed_buffers.append(dec)
            except Exception:
                try:
                    dec = zlib.decompress(data[idx:], -zlib.MAX_WBITS)
                    if len(dec) > 10:
                        decompressed_buffers.append(dec)
                except Exception:
                    pass
    return decompressed_buffers


def _repair_with_raw_byte_salvage(data: bytes) -> RepairResult:
    """Stage 3: Scans raw byte stream for text operators and reconstructs clean PDF."""
    import re

    warnings: List[str] = ["Salvaged content via deep raw byte stream parser."]
    zlib_buffers = _extract_zlib_chunks(data)
    all_buffers = [data] + zlib_buffers
    extracted_lines: List[str] = []

    for buf in all_buffers:
        tj_matches = re.findall(rb"\((.*?)\)\s*Tj", buf)
        parentheses_matches = re.findall(rb"\(([^\(\)]{3,})\)", buf)
        for match in tj_matches + parentheses_matches:
            try:
                decoded = match.decode("utf-8", errors="ignore").strip()
                if len(decoded) >= 2 and not decoded.startswith("/"):
                    extracted_lines.append(decoded)
            except Exception:
                pass

        ascii_matches = re.findall(rb"[\x20-\x7E\t\r\n]{4,}", buf)
        for line in ascii_matches:
            s = line.decode("ascii", errors="ignore").strip()
            if s and not any(s.startswith(kw) for kw in ("obj", "endobj", "stream", "endstream", "xref", "trailer", "startxref", "%%EOF")):
                if len(s) >= 4 and s not in extracted_lines:
                    extracted_lines.append(s)

    unique_lines: List[str] = []
    seen = set()
    for line in extracted_lines:
        if line not in seen and len(line.strip()) > 0:
            seen.add(line)
            unique_lines.append(line)

    page_count = 1
    if _HAS_FITZ:
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 40), "Cypher File Repair Engine — Salvaged PDF Stream Data", fontsize=11, fontname="helv", color=(0.2, 0.4, 0.8))

        if unique_lines:
            text_content = "\n".join(unique_lines[:400])
            rect = fitz.Rect(50, 60, 545, 790)
            page.insert_textbox(rect, text_content, fontsize=9, fontname="helv", color=(0.1, 0.1, 0.1))
        else:
            hex_summary = f"Payload Size: {len(data):,} bytes\nFirst 256 Bytes Hex Dump:\n" + " ".join(f"{b:02X}" for b in data[:256])
            page.insert_textbox(fitz.Rect(50, 60, 545, 790), hex_summary, fontsize=8, fontname="courier")

        rebuilt_bytes = doc.tobytes(deflate=True, clean=True)
        doc.close()
    else:
        rebuilt_bytes = (
            b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
            b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
            b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n183\n%%EOF"
        )

    return RepairResult(
        repaired_pdf=rebuilt_bytes,
        strategy=RepairStrategy.RAW_STREAM_SALVAGE,
        page_count=page_count,
        pages_recovered=page_count,
        warnings=warnings,
    )


def repair_pdf_to_bytes(raw_pdf: Union[bytes, bytearray, memoryview], *, password: Optional[str] = None) -> bytes:
    return repair_pdf(raw_pdf, password=password).repaired_pdf
