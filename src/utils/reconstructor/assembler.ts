/**
 * assembler.ts - Binary Fragment Reassembly Engine for Cypher Reconstructor
 *
 * Reconstructs original file byte streams from tagged binary fragments (.bin / .frg).
 * Matches Python backend assembler.py specification:
 * Header: [FRG\x00 (4B)][File ID (4B)][Chunk Index (4B Big-Endian)][Total Chunks (4B Big-Endian)]
 */

export const FRG_MAGIC = new Uint8Array([0x46, 0x52, 0x47, 0x00]); // "FRG\0"
export const HEADER_SIZE = 16;

export interface ParsedFragment {
  fileIdHex: string;
  chunkIndex: number;
  totalChunks: number;
  payload: Uint8Array;
}

export class FragmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FragmentError';
  }
}

/**
 * Checks if a byte buffer starts with the custom 4-byte FRG\0 magic header.
 */
export function isFragmentBuffer(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < HEADER_SIZE) return false;
  return (
    bytes[0] === 0x46 &&
    bytes[1] === 0x52 &&
    bytes[2] === 0x47 &&
    bytes[3] === 0x00
  );
}

/**
 * Parses the 16-byte custom header of a fragment buffer.
 */
export function parseFragmentHeader(bytes: Uint8Array): ParsedFragment {
  if (!isFragmentBuffer(bytes)) {
    throw new FragmentError('Invalid fragment: Missing b"FRG\\x00" 4-byte magic header.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Extract 4-byte File ID as hex string
  const fileIdBytes = bytes.subarray(4, 8);
  const fileIdHex = Array.from(fileIdBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const chunkIndex = view.getUint32(8, false); // Big-Endian
  const totalChunks = view.getUint32(12, false); // Big-Endian
  const payload = bytes.subarray(HEADER_SIZE);

  if (chunkIndex >= totalChunks) {
    throw new FragmentError(`Invalid fragment chunk index ${chunkIndex} for total chunks ${totalChunks}.`);
  }

  return { fileIdHex, chunkIndex, totalChunks, payload };
}

/**
 * Stitches a collection of raw fragment Uint8Arrays into a single unified byte array.
 */
export function assembleFragments(fragmentBuffers: Uint8Array[]): {
  stitchedBytes: Uint8Array;
  totalChunks: number;
  fileIdHex: string;
} {
  if (!fragmentBuffers || fragmentBuffers.length === 0) {
    throw new FragmentError('No fragment buffers provided for reassembly.');
  }

  const parsedList: ParsedFragment[] = fragmentBuffers.map((buf, idx) => {
    try {
      return parseFragmentHeader(buf);
    } catch (err: any) {
      throw new FragmentError(`Fragment #${idx + 1} header parse error: ${err.message}`);
    }
  });

  const first = parsedList[0];
  const targetFileId = first.fileIdHex;
  const expectedTotal = first.totalChunks;

  // 1. Check File ID consistency
  for (let i = 0; i < parsedList.length; i++) {
    if (parsedList[i].fileIdHex !== targetFileId) {
      throw new FragmentError(
        `Fragment ID mismatch: fragment #${i + 1} has File ID [${parsedList[i].fileIdHex}], expected [${targetFileId}].`
      );
    }
    if (parsedList[i].totalChunks !== expectedTotal) {
      throw new FragmentError(
        `Fragment total chunks mismatch: fragment #${i + 1} claims ${parsedList[i].totalChunks}, expected ${expectedTotal}.`
      );
    }
  }

  // 2. Map chunks by index
  const chunkMap = new Map<number, Uint8Array>();
  for (const item of parsedList) {
    chunkMap.set(item.chunkIndex, item.payload);
  }

  // 3. Check for missing indices
  const missingIndices: number[] = [];
  for (let i = 0; i < expectedTotal; i++) {
    if (!chunkMap.has(i)) {
      missingIndices.push(i);
    }
  }

  if (missingIndices.length > 0) {
    throw new FragmentError(
      `Incomplete fragment set: missing chunk index(es) [${missingIndices.join(', ')}] out of ${expectedTotal} total chunks.`
    );
  }

  // 4. Calculate total payload length and concatenate
  let totalLength = 0;
  for (let i = 0; i < expectedTotal; i++) {
    totalLength += chunkMap.get(i)!.length;
  }

  const stitchedBytes = new Uint8Array(totalLength);
  let offset = 0;

  for (let i = 0; i < expectedTotal; i++) {
    const payload = chunkMap.get(i)!;
    stitchedBytes.set(payload, offset);
    offset += payload.length;
  }

  return { stitchedBytes, totalChunks: expectedTotal, fileIdHex: targetFileId };
}
