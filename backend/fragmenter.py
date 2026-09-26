"""
fragmenter.py - Binary File Stream Fragmentation & Packetizing Engine

Provides byte-level fragmentation and header tagging for file carving,
distributed packet repair, and stream reconstruction testing.

Author: Cypher Engineering Team
"""

from __future__ import annotations

import logging
import os
import struct
import sys
from typing import List, Optional, Tuple, Union

# Ensure backend directory is present in sys.path
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# Module logger
logger = logging.getLogger(__name__)

# Header Constants
FRAGMENT_MAGIC: bytes = b"FRG\x00"  # 4-byte custom magic identifier
HEADER_FORMAT: str = ">4s4sII"      # Magic (4B), File ID (4B), Chunk Index (4B), Total Chunks (4B)
HEADER_SIZE: int = struct.calcsize(HEADER_FORMAT)  # 16 bytes


# ═══════════════════════════════════════════════════════════════════════════
# Custom Exception Hierarchy
# ═══════════════════════════════════════════════════════════════════════════

class FragmenterError(Exception):
    """Base exception for fragmenter operations."""
    pass


class InvalidInputError(FragmenterError, ValueError):
    """Raised when provided input buffer or chunk parameters are invalid."""
    pass


# ═══════════════════════════════════════════════════════════════════════════
# Validation & ID Generation
# ═══════════════════════════════════════════════════════════════════════════

def _validate_inputs(
    data: Union[bytes, bytearray, memoryview],
    chunk_count: int
) -> Tuple[bytes, int]:
    """
    Validates and normalizes input byte array and chunk count.

    Args:
        data: Input byte array.
        chunk_count: Target number of chunks.

    Returns:
        Tuple of (immutable bytes, validated chunk count integer).

    Raises:
        InvalidInputError: If data is not bytes-like, is empty, or chunk_count < 1.
    """
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise InvalidInputError(
            f"Expected bytes-like object (bytes, bytearray, memoryview), "
            f"got {type(data).__name__}."
        )

    byte_data = bytes(data)
    if len(byte_data) == 0:
        raise InvalidInputError("Input byte array cannot be empty.")

    if isinstance(chunk_count, bool) or not isinstance(chunk_count, int):
        raise InvalidInputError(
            f"chunk_count must be an integer, got {type(chunk_count).__name__}."
        )

    if chunk_count < 1:
        raise InvalidInputError(f"chunk_count must be at least 1, got {chunk_count}.")

    return byte_data, chunk_count


def generate_file_id() -> bytes:
    """
    Generates a unique 4-byte File Identifier.

    Returns:
        Random 4-byte bytes instance.
    """
    return os.urandom(4)


# ═══════════════════════════════════════════════════════════════════════════
# Fragmentation & Packetizing Public API
# ═══════════════════════════════════════════════════════════════════════════

def fragment_file(
    data: Union[bytes, bytearray, memoryview],
    chunk_count: int,
    file_id: Optional[bytes] = None
) -> List[bytes]:
    """
    Splits a byte array into equal-sized chunks tagged with custom binary headers.

    Header Binary Format (16 bytes total):
      - 0..3:   Magic Identifier (b'FRG\\x00')
      - 4..7:   Unique File ID (4 bytes)
      - 8..11:  Current Chunk Index (0-based uint32, big-endian)
      - 12..15: Total Chunk Count (uint32, big-endian)

    Args:
        data: Raw byte stream (bytes, bytearray, memoryview).
        chunk_count: Target number of chunks.
        file_id: Optional 4-byte File ID. Auto-generated if None.

    Returns:
        List of header-prefixed chunk byte arrays (List[bytes]).

    Raises:
        InvalidInputError: If parameters are invalid.
    """
    byte_data, num_chunks = _validate_inputs(data, chunk_count)

    # Cap chunk_count to length of data if chunk_count > len(byte_data)
    num_chunks = min(num_chunks, len(byte_data))

    if file_id is None:
        file_id = generate_file_id()
    elif not isinstance(file_id, bytes) or len(file_id) != 4:
        raise InvalidInputError("file_id must be a 4-byte bytes object.")

    total_len = len(byte_data)
    base_chunk_size = total_len // num_chunks
    remainder = total_len % num_chunks

    chunks: List[bytes] = []
    offset = 0

    for idx in range(num_chunks):
        current_size = base_chunk_size + (1 if idx < remainder else 0)
        chunk_payload = byte_data[offset : offset + current_size]
        offset += current_size

        # Pack custom 16-byte binary header
        header = struct.pack(HEADER_FORMAT, FRAGMENT_MAGIC, file_id, idx, num_chunks)
        chunks.append(header + chunk_payload)

    logger.debug(
        "Fragmented %d bytes into %d chunks (File ID: %s)",
        total_len, len(chunks), file_id.hex()
    )
    return chunks


# Convenient alias matching standard module naming
fragment_bytes = fragment_file


# ═══════════════════════════════════════════════════════════════════════════
# Defragmentation & Reassembly Helper
# ═══════════════════════════════════════════════════════════════════════════

def defragment_file(chunks: List[bytes]) -> bytes:
    """
    Reassembles a list of header-prefixed chunk byte arrays into the original file.

    Args:
        chunks: List of header-prefixed chunk byte arrays.

    Returns:
        Reassembled raw bytes object.

    Raises:
        InvalidInputError: If chunks are empty, malformed, or have mismatched File IDs.
    """
    if not chunks:
        raise InvalidInputError("Chunk list cannot be empty.")

    parsed_chunks = []
    expected_file_id: Optional[bytes] = None

    for i, chunk in enumerate(chunks):
        if not isinstance(chunk, (bytes, bytearray, memoryview)):
            raise InvalidInputError(f"Chunk at index {i} is not a bytes-like object.")
        chunk_bytes = bytes(chunk)

        if len(chunk_bytes) < HEADER_SIZE:
            raise InvalidInputError(
                f"Chunk at index {i} length ({len(chunk_bytes)} bytes) is smaller "
                f"than header size ({HEADER_SIZE} bytes)."
            )

        magic, fid, c_idx, total_cnt = struct.unpack(HEADER_FORMAT, chunk_bytes[:HEADER_SIZE])
        if magic != FRAGMENT_MAGIC:
            raise InvalidInputError(f"Chunk at index {i} has invalid magic header {magic!r}.")

        if expected_file_id is None:
            expected_file_id = fid
        elif fid != expected_file_id:
            raise InvalidInputError(
                f"Chunk at index {i} File ID mismatch: expected {expected_file_id.hex()}, got {fid.hex()}."
            )

        payload = chunk_bytes[HEADER_SIZE:]
        parsed_chunks.append((c_idx, payload))

    # Reorder by chunk index and join payloads
    parsed_chunks.sort(key=lambda item: item[0])
    return b"".join(payload for _, payload in parsed_chunks)
