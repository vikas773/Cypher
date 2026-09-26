"""
file_scanner.py - High-Performance Byte-Array File Signature & Magic Number Scanner

Designed for file repair applications to identify true file types even in the presence of
leading byte corruption, header truncation, or wrapped payloads.

Author: Cypher Engineering Team
"""

import logging
import os
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Union

# Ensure backend directory is present in sys.path
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# Configure module-level logging
logger = logging.getLogger(__name__)

# Constants defining search windows
PRIMARY_SCAN_DEPTH: int = 32
FALLBACK_SCAN_DEPTH: int = 2048


class FileScannerError(Exception):
    """Base exception for file scanner operations."""
    pass


class InvalidInputError(FileScannerError, TypeError):
    """Raised when the provided input is not a valid bytes-like object."""
    pass


@dataclass(frozen=True)
class SignatureSpec:
    """Represents a file signature definition."""
    mime_type: str
    extension: str
    magic_bytes: bytes
    offset: int = 0  # Standard offset relative to header


@dataclass(frozen=True)
class ScanResult:
    """Structured result from a signature scan."""
    mime_type: str
    extension: str
    offset: int
    is_buried: bool
    confidence: float

    def __str__(self) -> str:
        status = "buried" if self.is_buried else "clean header"
        return f"{self.mime_type} ({self.extension}) at offset {self.offset} [{status}, confidence: {self.confidence:.0%}]"


# Pre-defined database of file signatures prioritized by required types (PDF, JPEG, PNG)
KNOWN_SIGNATURES: List[SignatureSpec] = [
    # Explicitly requested format signatures
    SignatureSpec(
        mime_type="image/png",
        extension="png",
        magic_bytes=b"\x89PNG\r\n\x1a\n",
    ),
    SignatureSpec(
        mime_type="image/jpeg",
        extension="jpg",
        magic_bytes=b"\xFF\xD8\xFF",
    ),
    SignatureSpec(
        mime_type="application/pdf",
        extension="pdf",
        magic_bytes=b"%PDF-",
    ),
    # Additional common media format signatures for robust coverage
    SignatureSpec(
        mime_type="image/gif",
        extension="gif",
        magic_bytes=b"GIF89a",
    ),
    SignatureSpec(
        mime_type="image/gif",
        extension="gif",
        magic_bytes=b"GIF87a",
    ),
    SignatureSpec(
        mime_type="image/webp",
        extension="webp",
        magic_bytes=b"WEBP",
        offset=8,
    ),
    SignatureSpec(
        mime_type="image/bmp",
        extension="bmp",
        magic_bytes=b"BM",
    ),
    SignatureSpec(
        mime_type="application/zip",
        extension="zip",
        magic_bytes=b"PK\x03\x04",
    ),
]


def _validate_raw_bytes(data: Union[bytes, bytearray, memoryview]) -> bytes:
    """
    Validates and normalizes raw byte input.

    Args:
        data: The input byte array.

    Returns:
        bytes: Converted immutable bytes object.

    Raises:
        InvalidInputError: If data is not bytes, bytearray, or memoryview.
    """
    if isinstance(data, (bytes, bytearray, memoryview)):
        return bytes(data)
    
    raise InvalidInputError(
        f"Input must be a bytes-like object (bytes, bytearray, memoryview), got '{type(data).__name__}'."
    )


def identify_file_type(raw_bytes: Union[bytes, bytearray, memoryview]) -> Optional[str]:
    """
    Scans the first 32 bytes of a raw byte array to identify the file's true magic number.

    Args:
        raw_bytes: The raw file payload as a byte array.

    Returns:
        Optional[str]: The MIME type string if a valid signature is found within 
                       the first 32 bytes, or None if unidentified.

    Raises:
        InvalidInputError: If input is not a valid bytes-like object.
    """
    try:
        data = _validate_raw_bytes(raw_bytes)
    except InvalidInputError as err:
        logger.error(f"Validation failed in identify_file_type: {err}")
        raise

    if not data:
        return None

    # Slice the primary header window (first 32 bytes)
    header = data[:PRIMARY_SCAN_DEPTH]

    for spec in KNOWN_SIGNATURES:
        sig = spec.magic_bytes
        expected_offset = spec.offset

        # Check at standard offset first
        if len(header) >= expected_offset + len(sig):
            if header[expected_offset : expected_offset + len(sig)] == sig:
                return spec.mime_type

        # Check if signature exists anywhere within the 32-byte header window
        pos = header.find(sig)
        if pos != -1:
            return spec.mime_type

    return None


def scan_buried_signature(
    raw_bytes: Union[bytes, bytearray, memoryview],
    max_scan_depth: int = FALLBACK_SCAN_DEPTH,
) -> Optional[str]:
    """
    Fallback function scanning up to 2048 bytes (or specified depth) to discover 
    a valid magic signature that may be buried due to leading byte corruption or prepended garbage.

    Args:
        raw_bytes: The raw file payload as a byte array.
        max_scan_depth: Maximum number of bytes to inspect from start (default: 2048).

    Returns:
        Optional[str]: The detected MIME type string, or None if no signature is found.

    Raises:
        InvalidInputError: If input is not a valid bytes-like object.
    """
    result = deep_scan_signature(raw_bytes, max_scan_depth=max_scan_depth)
    return result.mime_type if result else None


def deep_scan_signature(
    raw_bytes: Union[bytes, bytearray, memoryview],
    max_scan_depth: int = FALLBACK_SCAN_DEPTH,
) -> Optional[ScanResult]:
    """
    Deep scanner returning comprehensive diagnostic details regarding signature location,
    offset distance, and header corruption status.

    Args:
        raw_bytes: The raw file payload as a byte array.
        max_scan_depth: Maximum bytes from start to scan (default 2048).

    Returns:
        Optional[ScanResult]: Struct containing MIME type, extension, offset, 
                              and confidence metrics, or None if no match.
    """
    try:
        data = _validate_raw_bytes(raw_bytes)
    except InvalidInputError as err:
        logger.error(f"Validation failed in deep_scan_signature: {err}")
        raise

    if not data:
        return None

    search_window = data[:max_scan_depth]

    best_result: Optional[ScanResult] = None
    earliest_offset: int = max_scan_depth + 1

    for spec in KNOWN_SIGNATURES:
        pos = search_window.find(spec.magic_bytes)
        if pos != -1:
            # We found a buried magic number!
            actual_file_offset = max(0, pos - spec.offset)
            
            # Prioritize signatures that appear earlier in the payload
            if actual_file_offset < earliest_offset:
                earliest_offset = actual_file_offset
                is_buried = actual_file_offset > PRIMARY_SCAN_DEPTH
                
                # Confidence calculation based on proximity to byte offset 0
                if actual_file_offset == 0:
                    confidence = 1.0
                elif actual_file_offset <= PRIMARY_SCAN_DEPTH:
                    confidence = 0.95
                else:
                    # Decay confidence gracefully as offset increases
                    decay = (actual_file_offset - PRIMARY_SCAN_DEPTH) / (max_scan_depth - PRIMARY_SCAN_DEPTH)
                    confidence = max(0.50, 0.90 - (decay * 0.40))

                best_result = ScanResult(
                    mime_type=spec.mime_type,
                    extension=spec.extension,
                    offset=actual_file_offset,
                    is_buried=is_buried,
                    confidence=round(confidence, 2),
                )

    return best_result
