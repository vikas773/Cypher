import type { CorruptOptions } from '../types/fileTypes';

/**
 * Intentionally corrupts a clean binary buffer according to user options
 */
export function corruptBuffer(buffer: ArrayBuffer, options: CorruptOptions): ArrayBuffer {
  const bytes = new Uint8Array(buffer.slice(0));
  const len = bytes.length;

  if (options.wipeHeader) {
    const wipeLen = Math.min(len, 32);
    for (let i = 0; i < wipeLen; i++) {
      bytes[i] = 0x00;
    }
  }

  if (options.bitFlipPercentage > 0) {
    const corruptCount = Math.floor((len * options.bitFlipPercentage) / 100);
    for (let c = 0; c < corruptCount; c++) {
      const idx = Math.floor(Math.random() * len);
      bytes[idx] = bytes[idx] ^ Math.floor(Math.random() * 255);
    }
  }

  if (options.injectNulls) {
    const nullCount = Math.min(len, Math.floor(len * 0.1));
    for (let c = 0; c < nullCount; c++) {
      const idx = Math.floor(Math.random() * len);
      bytes[idx] = 0x00;
    }
  }

  if (options.truncatePercentage > 0) {
    const keepLen = Math.max(16, Math.floor((len * (100 - options.truncatePercentage)) / 100));
    const sliced = bytes.subarray(0, keepLen);
    return sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength) as ArrayBuffer;
  }

  const resultBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return resultBuf;
}
