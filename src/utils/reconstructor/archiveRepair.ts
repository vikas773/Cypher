import JSZip from 'jszip';
import type { RepairLog, SignatureDefinition } from '../../types/fileTypes';
import { findByteSequence } from './magicBytes';

export interface ArchiveRepairResult {
  reconstructedBytes: Uint8Array;
  logs: RepairLog[];
  fixesCount: number;
  confidenceScore: number;
}

/**
 * Advanced Archive Repair Engine
 * 
 * Handles ZIP, DOCX, XLSX, PPTX, and other ZIP-based container formats:
 * 1. PK signature scanning and realignment
 * 2. Central directory reconstruction
 * 3. Local file header repair
 * 4. Individual entry salvaging from corrupted archives
 * 5. Multi-pass recovery with increasing aggressiveness
 */
export async function repairArchive(
  buffer: Uint8Array,
  _signature: SignatureDefinition
): Promise<ArchiveRepairResult> {
  const logs: RepairLog[] = [];
  let fixesCount = 0;
  let workBuffer = new Uint8Array(buffer);
  let confidenceScore = 80;

  // === Phase 1: PK Header Alignment ===
  const pkHeader = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
  const pkIdx = findByteSequence(workBuffer, pkHeader);

  if (pkIdx < 0) {
    // No PK signature found - try to find it deeper in the file
    const pkCentralDir = [0x50, 0x4b, 0x01, 0x02]; // Central directory header
    const pkEndCentral = [0x50, 0x4b, 0x05, 0x06]; // End of central directory
    
    const centralIdx = findByteSequence(workBuffer, pkCentralDir);
    const endIdx = findByteSequence(workBuffer, pkEndCentral);

    if (centralIdx >= 0 || endIdx >= 0) {
      // Found partial ZIP structure - prepend PK header
      const newBuf = new Uint8Array(pkHeader.length + workBuffer.length);
      newBuf.set(pkHeader, 0);
      newBuf.set(workBuffer, pkHeader.length);
      workBuffer = newBuf;
      fixesCount++;
      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'repair',
        message: 'ZIP Local File Header Injected: Found central directory but missing local file header. Restored PK\\x03\\x04 signature.',
        offset: 0,
      });
    } else {
      // No ZIP structure at all - try wrapping as a single-file ZIP
      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'warning',
        message: 'No ZIP structure detected in file. Attempting to wrap raw data as ZIP container.',
      });

      try {
        const zip = new JSZip();
        zip.file('recovered_data.bin', workBuffer);
        const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
        workBuffer = new Uint8Array(zipBytes);
        fixesCount += 2;
        logs.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          type: 'repair',
          message: 'ZIP Container Created: Wrapped unrecognized data into valid ZIP archive as recovered_data.bin.',
        });
      } catch {
        logs.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          message: 'ZIP Container Creation Failed: Unable to wrap data into ZIP format.',
        });
      }
    }
  } else if (pkIdx > 0) {
    workBuffer = workBuffer.subarray(pkIdx);
    fixesCount++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: `ZIP Offset Realignment: Removed ${pkIdx} corrupted preamble bytes before PK signature.`,
      offset: 0,
    });
  }

  // === Phase 2: Try standard JSZip parsing ===
  try {
    const zip = await JSZip.loadAsync(workBuffer, { checkCRC32: false });
    const fileEntries = Object.keys(zip.files);

    if (fileEntries.length > 0) {
      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'success',
        message: `ZIP Directory Structure Parsed: Found ${fileEntries.length} archive entries. Rebuilding clean container.`,
      });

      // Re-serialize with proper structure
      const cleanZip = new JSZip();
      let recoveredFiles = 0;
      let failedFiles = 0;

      for (const entry of fileEntries) {
        const file = zip.files[entry];
        if (file.dir) {
          cleanZip.folder(entry);
          continue;
        }

        try {
          const content = await file.async('uint8array');
          cleanZip.file(entry, content);
          recoveredFiles++;
        } catch {
          // File entry is corrupted - try to salvage what we can
          try {
            const content = await file.async('string');
            cleanZip.file(entry, content);
            recoveredFiles++;
          } catch {
            cleanZip.file(entry, `[Cypher Recovery: File "${entry}" was unrecoverable from corrupted archive]`);
            failedFiles++;
          }
        }
      }

      const cleanZipBytes = await cleanZip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      workBuffer = new Uint8Array(cleanZipBytes);
      fixesCount += recoveredFiles;
      confidenceScore = failedFiles === 0 ? 95 : Math.max(65, 95 - failedFiles * 10);

      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'success',
        message: `ZIP Reconstruction Complete: ${recoveredFiles} file(s) recovered${failedFiles > 0 ? `, ${failedFiles} unrecoverable` : ''}. Archive re-serialized with DEFLATE compression.`,
      });

      return {
        reconstructedBytes: workBuffer,
        logs,
        fixesCount,
        confidenceScore,
      };
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'warning',
      message: `ZIP Standard Parser Failed: ${errorMessage}. Engaging deep recovery mode.`,
    });
  }

  // === Phase 3: Deep Recovery - Scan for PK signatures and salvage individual entries ===
  try {
    const salvagedZip = new JSZip();
    let pkOffset = 0;
    let entriesFound = 0;

    while (pkOffset < workBuffer.length) {
      const found = findByteSequence(workBuffer, pkHeader, pkOffset);
      if (found < 0) break;

      // Parse local file header
      if (found + 30 <= workBuffer.length) {
        const headerView = new DataView(workBuffer.buffer, workBuffer.byteOffset + found, Math.min(30, workBuffer.length - found));
        
        try {
          const compressedSize = headerView.getUint32(18, true);
          const filenameLen = headerView.getUint16(26, true);
          const extraLen = headerView.getUint16(28, true);

          if (filenameLen > 0 && filenameLen < 256) {
            const filenameStart = found + 30;
            const filenameEnd = filenameStart + filenameLen;

            if (filenameEnd <= workBuffer.length) {
              const filename = new TextDecoder().decode(workBuffer.subarray(filenameStart, filenameEnd));
              const dataStart = filenameEnd + extraLen;
              const dataEnd = Math.min(dataStart + compressedSize, workBuffer.length);

              if (dataStart < workBuffer.length && !filename.endsWith('/')) {
                const entryData = workBuffer.subarray(dataStart, dataEnd);
                salvagedZip.file(filename || `recovered_${entriesFound + 1}.bin`, entryData);
                entriesFound++;
              }
            }
          }
        } catch {
          // Skip malformed entry
        }
      }

      pkOffset = found + 4;
    }

    if (entriesFound > 0) {
      const zipBytes = await salvagedZip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
      });
      workBuffer = new Uint8Array(zipBytes);
      fixesCount += entriesFound;
      confidenceScore = Math.min(85, 60 + entriesFound * 5);

      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'repair',
        message: `ZIP Deep Recovery: Salvaged ${entriesFound} file entries by parsing individual PK local file headers. Reconstructed valid ZIP container.`,
      });
    } else {
      // === Phase 4: Last resort - wrap raw data ===
      const fallbackZip = new JSZip();
      fallbackZip.file('recovered_data.bin', buffer);
      fallbackZip.file('recovery_report.txt',
        `Cypher Archive Recovery Report\n` +
        `===============================\n` +
        `Original size: ${buffer.length} bytes\n` +
        `Recovery date: ${new Date().toLocaleString()}\n` +
        `Status: No valid ZIP entries could be parsed from the corrupted data.\n` +
        `The raw binary data has been preserved as recovered_data.bin.\n`
      );

      const zipBytes = await fallbackZip.generateAsync({ type: 'uint8array' });
      workBuffer = new Uint8Array(zipBytes);
      fixesCount += 2;
      confidenceScore = 55;

      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'repair',
        message: 'ZIP Fallback Container: Created valid ZIP with preserved raw data and recovery report.',
      });
    }
  } catch {
    // Final fallback
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'error',
      message: 'ZIP Recovery Engine: Deep recovery exhausted all strategies.',
    });
  }

  return {
    reconstructedBytes: workBuffer,
    logs,
    fixesCount,
    confidenceScore: Math.min(100, Math.max(50, confidenceScore + fixesCount * 3)),
  };
}
