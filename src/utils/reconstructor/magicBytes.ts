import type { EntropyPoint, SignatureDefinition } from '../../types/fileTypes';

export const KNOWN_SIGNATURES: SignatureDefinition[] = [
  {
    name: 'PNG Image',
    category: 'image',
    mime: 'image/png',
    extension: 'png',
    headerHex: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    footerHex: [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82],
  },
  {
    name: 'JPEG Image',
    category: 'image',
    mime: 'image/jpeg',
    extension: 'jpg',
    headerHex: [0xff, 0xd8, 0xff],
    footerHex: [0xff, 0xd9],
  },
  {
    name: 'GIF Image',
    category: 'image',
    mime: 'image/gif',
    extension: 'gif',
    headerHex: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    footerHex: [0x00, 0x3b],
  },
  {
    name: 'WebP Image',
    category: 'image',
    mime: 'image/webp',
    extension: 'webp',
    headerHex: [0x52, 0x49, 0x46, 0x46],
  },
  {
    name: 'Bitmap Image',
    category: 'image',
    mime: 'image/bmp',
    extension: 'bmp',
    headerHex: [0x42, 0x4d],
  },
  {
    name: 'PDF Document',
    category: 'pdf',
    mime: 'application/pdf',
    extension: 'pdf',
    headerHex: [0x25, 0x50, 0x44, 0x46],
    footerHex: [0x25, 0x25, 0x45, 0x4f, 0x46],
  },
  {
    name: 'ZIP / Office Container',
    category: 'archive',
    mime: 'application/zip',
    extension: 'zip',
    headerHex: [0x50, 0x4b, 0x03, 0x04],
    footerHex: [0x50, 0x4b, 0x05, 0x06],
  },
  {
    name: 'WAV Audio',
    category: 'audio',
    mime: 'audio/wav',
    extension: 'wav',
    headerHex: [0x52, 0x49, 0x46, 0x46],
  },
  {
    name: 'MP3 Audio (ID3 Tag)',
    category: 'audio',
    mime: 'audio/mpeg',
    extension: 'mp3',
    headerHex: [0x49, 0x44, 0x33],
  },
  {
    name: 'MP3 Audio (Raw Sync)',
    category: 'audio',
    mime: 'audio/mpeg',
    extension: 'mp3',
    headerHex: [0xff, 0xfb],
  },
  {
    name: 'JSON File',
    category: 'document',
    mime: 'application/json',
    extension: 'json',
    headerHex: [0x7b],
  },
  {
    name: 'XML Document',
    category: 'document',
    mime: 'text/xml',
    extension: 'xml',
    headerHex: [0x3c, 0x3f, 0x78, 0x6d, 0x6c],
  },
];

export function calculateShannonEntropy(buffer: Uint8Array, chunkSize = 256): EntropyPoint[] {
  const points: EntropyPoint[] = [];
  const len = buffer.length;

  if (len === 0) return points;

  const numChunks = Math.min(64, Math.ceil(len / chunkSize));
  const step = Math.max(1, Math.floor(len / numChunks));
  const byteCounts = new Uint32Array(256);

  for (let i = 0; i < len; i += step) {
    const chunkEnd = Math.min(i + step, len);
    const chunkLen = chunkEnd - i;
    byteCounts.fill(0);

    for (let j = i; j < chunkEnd; j++) {
      byteCounts[buffer[j]]++;
    }

    let entropy = 0;
    for (let c = 0; c < 256; c++) {
      if (byteCounts[c] > 0) {
        const p = byteCounts[c] / chunkLen;
        entropy -= p * Math.log2(p);
      }
    }

    points.push({ offset: i, entropy: Math.round(entropy * 1000) / 1000 });
  }

  return points;
}

export function findByteSequence(buffer: Uint8Array, pattern: number[], startOffset = 0): number {
  const maxSearch = buffer.length - pattern.length;
  for (let i = startOffset; i <= maxSearch; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (buffer[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

export function detectFormat(buffer: Uint8Array, filenameHint?: string): SignatureDefinition | null {
  // 1. Direct header match
  for (const sig of KNOWN_SIGNATURES) {
    if (buffer.length >= sig.headerHex.length) {
      let matches = true;
      for (let i = 0; i < sig.headerHex.length; i++) {
        if (buffer[i] !== sig.headerHex[i]) {
          matches = false;
          break;
        }
      }
      if (matches && sig.headerHex[0] === 0x52 && sig.headerHex[1] === 0x49) {
        if (buffer.length >= 12) {
          const sub8 = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
          if (sig.extension === 'webp' && sub8 === 'WEBP') return sig;
          if (sig.extension === 'wav' && sub8 === 'WAVE') return sig;
        }
      } else if (matches) {
        return sig;
      }
    }
  }

  // 2. Filename Extension match
  if (filenameHint) {
    const ext = filenameHint.split('.').pop()?.toLowerCase();
    const matchByExt = KNOWN_SIGNATURES.find((s) => s.extension === ext);
    if (matchByExt) return matchByExt;

    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'bmp') {
      return {
        name: `${ext.toUpperCase()} Image`,
        category: 'image',
        mime: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        extension: ext,
        headerHex: ext === 'png' ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] : [0xff, 0xd8, 0xff],
      };
    }
    if (ext === 'pdf') {
      return KNOWN_SIGNATURES.find((s) => s.extension === 'pdf')!;
    }
    if (ext === 'json' || ext === 'txt' || ext === 'html' || ext === 'csv' || ext === 'js' || ext === 'ts' || ext === 'md') {
      return {
        name: 'Text Document',
        category: 'document',
        mime: ext === 'json' ? 'application/json' : 'text/plain',
        extension: ext,
        headerHex: [0x7b],
      };
    }
    if (ext === 'zip' || ext === 'docx' || ext === 'xlsx') {
      return KNOWN_SIGNATURES.find((s) => s.extension === 'zip')!;
    }
    if (ext === 'mp3' || ext === 'wav') {
      return KNOWN_SIGNATURES.find((s) => s.extension === ext) || KNOWN_SIGNATURES[7];
    }
  }

  // 3. Deep Scan: search buffer for signature patterns
  const scanLimit = Math.min(buffer.length, 8192);
  for (const sig of KNOWN_SIGNATURES) {
    if (sig.headerHex.length >= 3) {
      const foundIdx = findByteSequence(buffer.subarray(0, scanLimit), sig.headerHex);
      if (foundIdx >= 0) {
        return sig;
      }
    }
  }

  // 4. Content Character Analysis (Text vs Binary Heuristics)
  let printableAsciiCount = 0;
  const sampleLen = Math.min(buffer.length, 1024);
  for (let i = 0; i < sampleLen; i++) {
    const b = buffer[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      printableAsciiCount++;
    }
  }

  if (sampleLen > 0 && printableAsciiCount / sampleLen > 0.75) {
    return {
      name: 'Plain Text Document',
      category: 'document',
      mime: 'text/plain',
      extension: 'txt',
      headerHex: [],
    };
  }

  return null;
}
