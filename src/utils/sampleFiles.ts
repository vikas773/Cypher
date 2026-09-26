import type { SampleFileItem } from '../types/fileTypes';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';

export const SAMPLE_FILES: SampleFileItem[] = [
  {
    id: 'sample-image',
    name: 'Corrupted_Cyberpunk_Banner.png',
    category: 'image',
    mimeType: 'image/png',
    description: 'PNG image with wiped magic header, destroyed IHDR chunk, corrupted CRC checksums, and injected null blocks in image data.',
    createCorruptedBlob: async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 350;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 600, 350);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#06b6d4');
        grad.addColorStop(1, '#8b5cf6');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 600, 350);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('CYPHER RECONSTRUCTION TEST', 50, 150);
        ctx.fillStyle = '#10b981';
        ctx.font = '18px monospace';
        ctx.fillText('STATUS: ORIGINAL FILE VALID & INTENDED', 50, 200);

        // Draw cyberpunk grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 600; i += 30) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 350);
          ctx.stroke();
        }
        for (let j = 0; j < 350; j += 30) {
          ctx.beginPath();
          ctx.moveTo(0, j);
          ctx.lineTo(600, j);
          ctx.stroke();
        }

        // Draw some shapes
        ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.beginPath();
        ctx.arc(500, 100, 60, 0, Math.PI * 2);
        ctx.fill();
      }

      const originalBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
      const origArray = new Uint8Array(await originalBlob.arrayBuffer());

      // Apply realistic corruption
      const corruptedArray = new Uint8Array(origArray.length);
      corruptedArray.set(origArray);

      // Wipe PNG magic header (first 12 bytes)
      for (let i = 0; i < 12; i++) {
        corruptedArray[i] = 0x00;
      }

      // Corrupt some CRC checksums
      if (corruptedArray.length > 60) {
        corruptedArray[29] = 0xFF; // IHDR CRC
        corruptedArray[30] = 0xEE;
      }

      // Inject null blocks into IDAT data
      const nullBlockStart = Math.min(Math.floor(origArray.length * 0.3), origArray.length - 100);
      for (let i = nullBlockStart; i < nullBlockStart + 40 && i < corruptedArray.length; i++) {
        corruptedArray[i] = 0x00;
      }

      // Flip some bits in the middle
      const midPoint = Math.floor(origArray.length / 2);
      for (let i = midPoint; i < midPoint + 20 && i < corruptedArray.length; i++) {
        corruptedArray[i] = corruptedArray[i] ^ 0xFF;
      }

      return {
        originalBlob,
        corruptedBlob: new Blob([corruptedArray], { type: 'application/octet-stream' }),
        corruptedName: 'Corrupted_Cyberpunk_Banner.png',
      };
    },
  },
  {
    id: 'sample-pdf',
    name: 'Damaged_Security_Report.pdf',
    category: 'pdf',
    mimeType: 'application/pdf',
    description: 'PDF report with erased %PDF header, corrupted xref table, injected null bytes in text streams, and truncated trailer.',
    createCorruptedBlob: async () => {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Page 1: Title page
      const page1 = pdfDoc.addPage([600, 400]);
      page1.drawText('CYPHER ENTERPRISE RECOVERY DEMO', {
        x: 50, y: 350, size: 22, font: boldFont, color: rgb(0.04, 0.71, 0.83),
      });
      page1.drawText('Document Classification: STRICTLY CONFIDENTIAL', {
        x: 50, y: 310, size: 14, font, color: rgb(0.9, 0.2, 0.2),
      });
      page1.drawText('If you can read this text, the Cypher PDF Reconstructor', {
        x: 50, y: 260, size: 12, font,
      });
      page1.drawText('successfully recovered content from the corrupted file.', {
        x: 50, y: 240, size: 12, font,
      });
      page1.drawText('Recovery Report Generated: ' + new Date().toLocaleString(), {
        x: 50, y: 200, size: 10, font, color: rgb(0.5, 0.5, 0.5),
      });

      // Page 2: Data content
      const page2 = pdfDoc.addPage([600, 400]);
      page2.drawText('SECTION 2: RECOVERED DATA INVENTORY', {
        x: 50, y: 360, size: 16, font: boldFont,
      });
      const dataLines = [
        'Asset ID: CYP-2024-9981',
        'Classification: Top Secret / Compartmented',
        'Handler: Cypher Reconstruction Engine v3.0',
        'Integrity Score: VERIFIED',
        'Total Objects Recovered: 47',
        'Text Streams Salvaged: 12',
        'Cross-Reference Table: Rebuilt',
      ];
      let y = 320;
      for (const line of dataLines) {
        page2.drawText(line, { x: 70, y, size: 11, font });
        y -= 20;
      }

      const origBytes = await pdfDoc.save();
      const originalBlob = new Blob([origBytes as unknown as BlobPart], { type: 'application/pdf' });

      // Apply heavy corruption
      const corruptBytes = new Uint8Array(origBytes.length);
      corruptBytes.set(origBytes);

      // Wipe PDF header
      for (let i = 0; i < 15; i++) {
        corruptBytes[i] = 0x00;
      }

      // Inject null bytes into some stream content
      const quarter = Math.floor(origBytes.length / 4);
      for (let i = quarter; i < quarter + 30 && i < corruptBytes.length; i++) {
        corruptBytes[i] = 0x00;
      }

      // Corrupt %%EOF trailer area
      const lastBytes = origBytes.length;
      for (let i = lastBytes - 10; i < lastBytes && i >= 0; i++) {
        corruptBytes[i] = 0xFF;
      }

      return {
        originalBlob,
        corruptedBlob: new Blob([corruptBytes], { type: 'application/octet-stream' }),
        corruptedName: 'Damaged_Security_Report.pdf',
      };
    },
  },
  {
    id: 'sample-json',
    name: 'Broken_API_Payload.json',
    category: 'document',
    mimeType: 'application/json',
    description: 'Malformed JSON with unquoted keys, single quotes, null bytes, JavaScript comments, trailing commas, and missing brackets.',
    createCorruptedBlob: async () => {
      const cleanJson = JSON.stringify(
        {
          system: 'Cypher Core Engine',
          status: 'Operational',
          version: '3.0.0',
          metrics: {
            throughput: '1.2 GB/s',
            accuracy: 0.998,
            latency_ms: 12,
            activeModules: ['magicBytes', 'astHealer', 'crcRepair', 'entropyScan', 'deepByteRepair'],
          },
          configuration: {
            maxFileSize: '500MB',
            supportedFormats: ['PNG', 'JPEG', 'PDF', 'WAV', 'MP3', 'ZIP', 'JSON', 'XML'],
            recoveryMode: 'aggressive',
          },
          recoveredAt: new Date().toISOString(),
          signature: 'CYPHER-VALID-9981',
        },
        null,
        2
      );

      const originalBlob = new Blob([cleanJson], { type: 'application/json' });

      // Create corrupted JSON with multiple issues
      const brokenText = `
// This is a corrupted API response
{
  system: 'Cypher Core Engine',
  status: 'Operational',
  version: '3.0.0',
  \0metrics: {
    'throughput': '1.2 GB/s',
    accuracy: 0.998,
    latency_ms: 12,
    activeModules: ['magicBytes', 'astHealer', 'crcRepair', 'entropyScan', 'deepByteRepair',],
  },
  /* block comment */
  configuration: {
    maxFileSize: '500MB',
    supportedFormats: ['PNG', 'JPEG', 'PDF', 'WAV', 'MP3', 'ZIP', 'JSON', 'XML'],
    recoveryMode: undefined,
  },
  recoveredAt: '${new Date().toISOString()}',
  signature: 'CYPHER-VALID-9981'
      `;

      return {
        originalBlob,
        corruptedBlob: new Blob([brokenText], { type: 'application/json' }),
        corruptedName: 'Broken_API_Payload.json',
      };
    },
  },
  {
    id: 'sample-audio',
    name: 'Corrupted_Soundtrack.wav',
    category: 'audio',
    mimeType: 'audio/wav',
    description: 'WAV file with destroyed RIFF header, corrupted fmt chunk, wrong data sizes, and audio click/pop artifacts.',
    createCorruptedBlob: async () => {
      const sampleRate = 44100;
      const numSamples = sampleRate * 2; // 2 seconds
      const pcmData = new Int16Array(numSamples);

      // Generate a pleasant chord (A440 + E660 + C#554)
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        pcmData[i] = Math.round(
          Math.sin(2 * Math.PI * 440 * t) * 10000 +
          Math.sin(2 * Math.PI * 660 * t) * 6000 +
          Math.sin(2 * Math.PI * 554 * t) * 4000
        );
      }

      const wavHeader = new Uint8Array(44);
      const totalLen = pcmData.byteLength + 36;
      const dv = new DataView(wavHeader.buffer);

      // RIFF
      wavHeader[0] = 0x52; wavHeader[1] = 0x49; wavHeader[2] = 0x46; wavHeader[3] = 0x46;
      dv.setUint32(4, totalLen, true);
      // WAVE
      wavHeader[8] = 0x57; wavHeader[9] = 0x41; wavHeader[10] = 0x56; wavHeader[11] = 0x45;
      // fmt
      wavHeader[12] = 0x66; wavHeader[13] = 0x6d; wavHeader[14] = 0x74; wavHeader[15] = 0x20;
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true); // PCM
      dv.setUint16(22, 1, true); // mono
      dv.setUint32(24, sampleRate, true);
      dv.setUint32(28, sampleRate * 2, true); // byte rate
      dv.setUint16(32, 2, true); // block align
      dv.setUint16(34, 16, true); // bits per sample
      // data
      wavHeader[36] = 0x64; wavHeader[37] = 0x61; wavHeader[38] = 0x74; wavHeader[39] = 0x61;
      dv.setUint32(40, pcmData.byteLength, true);

      const origWav = new Uint8Array(44 + pcmData.byteLength);
      origWav.set(wavHeader, 0);
      origWav.set(new Uint8Array(pcmData.buffer), 44);

      const originalBlob = new Blob([origWav], { type: 'audio/wav' });

      // Corrupt the WAV
      const corruptWav = new Uint8Array(origWav.length);
      corruptWav.set(origWav);

      // Wipe RIFF + WAVE header
      for (let i = 0; i < 12; i++) corruptWav[i] = 0x00;

      // Corrupt fmt chunk format tag
      corruptWav[20] = 0xFF;
      corruptWav[21] = 0xFF;

      // Inject click/pop artifacts (extreme sample values)
      const dataStart = 44;
      const clickPositions = [1000, 5000, 15000, 30000, 50000];
      const clickView = new DataView(corruptWav.buffer);
      for (const pos of clickPositions) {
        const bytePos = dataStart + pos * 2;
        if (bytePos + 2 <= corruptWav.length) {
          clickView.setInt16(bytePos, 32000, true); // Max spike
        }
      }

      // Zero out a small section of audio data
      const zeroStart = dataStart + 20000;
      for (let i = zeroStart; i < zeroStart + 200 && i < corruptWav.length; i++) {
        corruptWav[i] = 0x00;
      }

      return {
        originalBlob,
        corruptedBlob: new Blob([corruptWav], { type: 'application/octet-stream' }),
        corruptedName: 'Corrupted_Soundtrack.wav',
      };
    },
  },
  {
    id: 'sample-zip',
    name: 'Corrupted_Archive_Vault.zip',
    category: 'archive',
    mimeType: 'application/zip',
    description: 'ZIP archive with corrupted PK header, damaged central directory, and partially destroyed file entries.',
    createCorruptedBlob: async () => {
      const zip = new JSZip();
      zip.file('readme.txt', 'Welcome to the Cypher Archive Recovery Demo!\n\nThis file was successfully extracted from the corrupted archive.\nAll contents have been verified and restored.');
      zip.file('data/config.json', JSON.stringify({
        project: 'Cypher',
        version: '3.0.0',
        recovered: true,
        timestamp: new Date().toISOString(),
      }, null, 2));
      zip.file('data/secret_keys.json', JSON.stringify({
        key: 'CYPHER-9981-RECOVERED',
        active: true,
        algorithm: 'AES-256-GCM',
      }, null, 2));
      zip.file('logs/recovery.log', `[${new Date().toISOString()}] Recovery initiated\n[${new Date().toISOString()}] Archive structure rebuilt\n[${new Date().toISOString()}] All files extracted successfully`);

      const origZipBuf = await zip.generateAsync({ type: 'uint8array' });
      const originalBlob = new Blob([origZipBuf as unknown as BlobPart], { type: 'application/zip' });

      // Apply corruption
      const corruptZip = new Uint8Array(origZipBuf.length);
      corruptZip.set(origZipBuf);

      // Wipe PK header
      corruptZip[0] = 0x00;
      corruptZip[1] = 0x00;
      corruptZip[2] = 0x00;
      corruptZip[3] = 0x00;

      // Corrupt some bytes in the middle
      const mid = Math.floor(origZipBuf.length / 2);
      for (let i = mid; i < mid + 15 && i < corruptZip.length; i++) {
        corruptZip[i] = 0xFF;
      }

      return {
        originalBlob,
        corruptedBlob: new Blob([corruptZip], { type: 'application/octet-stream' }),
        corruptedName: 'Corrupted_Archive_Vault.zip',
      };
    },
  },
];
