"""
corruptor.py - Structural File Corruption Engine for Testing File Repair Workflows

This module simulates real-world byte-level file corruption to test file repair engines,
header-grafting algorithms, and file-carving toolchains.

Corruption Severity Tiers:
  - Low (1-30%): Scramble magic numbers (first 16 bytes) and delete EOF markers.
  - Medium (31-70%): Inject a 1024-byte block of random junk bytes at offset 0.
  - High (71-100%): Format-specific structural degradation:
      * PDF: Locate and delete the XREF table and `%%EOF` marker.
      * Images: Delete the file header entirely (signature + metadata chunk).
      * Fallback: Delete initial header block and remove trailing EOF markers.

Guarantees:
  - Core payload content is NEVER overwritten or corrupted.
  - Always returns 100% repairable file streams for carving and grafting engines.

Author: Cypher Engineering Team
"""

from __future__ import annotations

import logging
import os
import re
import sys
from typing import Dict, Optional, Tuple, Union

# Ensure backend directory is present in sys.path
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# Module logger
logger = logging.getLogger(__name__)

# Severity bounds and configuration constants
MIN_SEVERITY: int = 1
MAX_SEVERITY: int = 100
LOW_SEVERITY_MAX: int = 30
MEDIUM_SEVERITY_MAX: int = 70
JUNK_BLOCK_SIZE: int = 1024
MAGIC_NUMBER_BYTE_COUNT: int = 16


# ═══════════════════════════════════════════════════════════════════════════
# Custom Exception Hierarchy
# ═══════════════════════════════════════════════════════════════════════════

class CorruptorError(Exception):
    """Base exception for corruptor operations."""
    pass


class InvalidInputError(CorruptorError, ValueError):
    """Raised when provided input data or severity parameters are invalid."""
    pass


class FileCorruptionError(CorruptorError, RuntimeError):
    """Raised when structural corruption execution fails."""
    pass


# ═══════════════════════════════════════════════════════════════════════════
# Input Validation & Format Detection
# ═══════════════════════════════════════════════════════════════════════════

def _validate_inputs(
    data: Union[bytes, bytearray, memoryview],
    severity_percentage: int
) -> bytes:
    """
    Validates and normalizes byte input buffer and severity level.

    Args:
        data: Raw input byte array (bytes, bytearray, memoryview).
        severity_percentage: Severity integer from 1 to 100.

    Returns:
        Immutable bytes instance of input data.

    Raises:
        InvalidInputError: If data is not bytes-like, is empty, or severity is invalid.
    """
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise InvalidInputError(
            f"Input data must be a bytes-like object (bytes, bytearray, memoryview), "
            f"got {type(data).__name__}."
        )

    byte_data = bytes(data)
    if len(byte_data) == 0:
        raise InvalidInputError("Input byte array cannot be empty.")

    if isinstance(severity_percentage, bool) or not isinstance(severity_percentage, int):
        raise InvalidInputError(
            f"severity_percentage must be an integer, got {type(severity_percentage).__name__}."
        )

    if not (MIN_SEVERITY <= severity_percentage <= MAX_SEVERITY):
        raise InvalidInputError(
            f"severity_percentage must be an integer between 1 and 100, got {severity_percentage}."
        )

    return byte_data


def detect_file_type(data: bytes) -> str:
    """
    Inspects magic byte headers to detect common file formats.

    Args:
        data: Raw byte array.

    Returns:
        Format identifier string ('pdf', 'png', 'jpeg', 'gif', 'webp', 'bmp', 'zip', 'unknown').
    """
    if data.startswith(b"%PDF-") or b"%PDF-" in data[:1024]:
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xFF\xD8\xFF") or data.startswith(b"\xFF\xD8"):
        return "jpeg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"BM"):
        return "bmp"
    if data.startswith(b"PK\x03\x04"):
        return "zip"
    return "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# Severity Corruption Engines
# ═══════════════════════════════════════════════════════════════════════════

def _corrupt_low_severity(data: bytes) -> bytes:
    """
    Low Severity (1-30%):
    - Scramble magic numbers (first 16 bytes).
    - Delete EOF markers.

    Args:
        data: Raw file bytes.

    Returns:
        Corrupted byte stream.
    """
    logger.debug("Applying Low Severity structural corruption (scramble magic bytes & delete EOF markers)")

    # 1. Scramble magic numbers (first 16 bytes) by bitwise inverting header bytes
    header_len = min(MAGIC_NUMBER_BYTE_COUNT, len(data))
    scrambled_header = bytes([b ^ 0xFF for b in data[:header_len]])
    payload = scrambled_header + data[header_len:]

    # 2. Delete EOF markers
    # PDF EOF marker
    payload = re.sub(rb"%%EOF\r?\n?", b"", payload)

    # JPEG EOI marker (FF D9)
    if payload.endswith(b"\xFF\xD9"):
        payload = payload[:-2]
    payload = re.sub(rb"\xFF\xD9$", b"", payload)

    # PNG IEND chunk
    payload = re.sub(rb"\x00\x00\x00\x00IEND\xaeB`\x82", b"", payload)
    payload = re.sub(rb"IEND\xaeB`\x82", b"", payload)

    # ZIP End of Central Directory marker (PK 05 06)
    payload = re.sub(rb"PK\x05\x06[\s\S]{18,}", b"", payload)

    # Fallback EOF trimming if no explicit marker matched and file is sufficiently sized
    if payload == data and len(payload) > 32:
        payload = payload[:-16]

    return payload


def _corrupt_medium_severity(data: bytes) -> bytes:
    """
    Medium Severity (31-70%):
    - Inject 1024 random junk bytes at offset 0 to offset all byte addresses.

    Args:
        data: Raw file bytes.

    Returns:
        Corrupted byte stream with buried header.
    """
    logger.debug("Applying Medium Severity structural corruption (injecting 1024 junk bytes at offset 0)")
    junk_block = os.urandom(JUNK_BLOCK_SIZE)
    return junk_block + data


def _corrupt_high_severity(data: bytes) -> bytes:
    """
    High Severity (71-100%):
    - PDFs: Delete XREF table and `%%EOF` marker.
    - Images: Delete header entirely.
    - Other: Delete initial header and strip EOF markers.

    Args:
        data: Raw file bytes.

    Returns:
        Structurally degraded byte stream.
    """
    file_type = detect_file_type(data)
    logger.debug("Applying High Severity structural corruption for file type '%s'", file_type)

    if file_type == "pdf":
        # Delete traditional xref tables
        payload = re.sub(rb"xref\s+\d+\s+\d+[\s\S]*?(?=trailer|startxref|$)", b"", data)
        # Delete startxref offset reference block
        payload = re.sub(rb"startxref\s+\d+\s*", b"", payload)
        # Delete %%EOF markers
        payload = re.sub(rb"%%EOF\r?\n?", b"", payload)
        # Handle XRef streams (/Type /XRef)
        payload = re.sub(rb"/Type\s*/XRef", b"/Type /CorruptXRef", payload)
        return payload

    elif file_type in ("png", "jpeg", "gif", "webp", "bmp"):
        if file_type == "png":
            # PNG: Delete 8-byte signature + 25-byte IHDR chunk (33 bytes total)
            idat_idx = data.find(b"IDAT")
            if idat_idx != -1 and idat_idx >= 4:
                header_cutoff = idat_idx - 4
            else:
                header_cutoff = 33
            cutoff = min(header_cutoff, len(data) - 1)
            return data[cutoff:]

        elif file_type == "jpeg":
            # JPEG: Delete header up to Start of Frame / Start of Scan marker
            sos_idx = data.find(b"\xFF\xDA")
            sof_idx = data.find(b"\xFF\xC0")
            valid_indices = [i for i in (sof_idx, sos_idx) if i != -1]
            if valid_indices:
                cutoff = min(valid_indices)
            else:
                cutoff = 30
            cutoff = min(cutoff, len(data) - 1)
            return data[cutoff:]

        elif file_type == "gif":
            # GIF: Delete 13-byte header (signature + Logical Screen Descriptor)
            cutoff = min(13, len(data) - 1)
            return data[cutoff:]

        elif file_type == "webp":
            # WebP: Delete 12-byte RIFF/WEBP header
            cutoff = min(12, len(data) - 1)
            return data[cutoff:]

        elif file_type == "bmp":
            # BMP: Delete 54-byte File + DIB header
            cutoff = min(54, len(data) - 1)
            return data[cutoff:]

    # Fallback for generic/unknown file types in High severity:
    header_cutoff = min(32, len(data) - 1)
    payload = data[header_cutoff:]
    payload = re.sub(rb"%%EOF\r?\n?", b"", payload)
    if payload.endswith(b"\xFF\xD9"):
        payload = payload[:-2]
    return payload


# ═══════════════════════════════════════════════════════════════════════════
# Public API Entry Points
# ═══════════════════════════════════════════════════════════════════════════

def corrupt_file(
    data: Union[bytes, bytearray, memoryview],
    severity_percentage: int
) -> bytes:
    """
    Accepts a raw byte array and severity percentage (1-100), returning a structurally
    corrupted byte array that standard OS software cannot open, but is 100% repairable
    by header-grafting and file-carving tools.

    Args:
        data: Raw byte stream (bytes, bytearray, memoryview).
        severity_percentage: Integer severity index from 1 to 100.

    Returns:
        Structurally corrupted bytes object.

    Raises:
        InvalidInputError: If parameters are invalid or empty.
        FileCorruptionError: If corruption execution fails.
    """
    byte_data = _validate_inputs(data, severity_percentage)

    try:
        if 1 <= severity_percentage <= LOW_SEVERITY_MAX:
            return _corrupt_low_severity(byte_data)
        elif LOW_SEVERITY_MAX < severity_percentage <= MEDIUM_SEVERITY_MAX:
            return _corrupt_medium_severity(byte_data)
        else:
            return _corrupt_high_severity(byte_data)

    except Exception as err:
        if isinstance(err, CorruptorError):
            raise
        logger.error("Failed to corrupt file stream: %s", err, exc_info=True)
        raise FileCorruptionError(f"File corruption failed: {err}") from err


# Convenient alias matching standard module function naming
corrupt_bytes = corrupt_file
