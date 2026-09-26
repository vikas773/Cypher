import React, { useState } from 'react';
import type { ReconstructionResult } from '../types/fileTypes';
import { Binary } from 'lucide-react';

interface HexViewerProps {
  result: ReconstructionResult;
}

export const HexViewer: React.FC<HexViewerProps> = ({ result }) => {
  const [viewMode, setViewMode] = useState<'reconstructed' | 'original' | 'diff'>('reconstructed');
  const [maxBytes, setMaxBytes] = useState<number>(512);

  const bufferToDisplay = viewMode === 'original' ? result.originalBuffer : result.reconstructedBuffer;
  const bytes = new Uint8Array(bufferToDisplay).subarray(0, maxBytes);
  const origBytes = new Uint8Array(result.originalBuffer).subarray(0, maxBytes);

  const formatOffset = (offset: number) => {
    return '0x' + offset.toString(16).padStart(8, '0').toUpperCase();
  };

  const rows = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const rowBytes = bytes.subarray(i, i + 16);
    const origRowBytes = origBytes.subarray(i, i + 16);
    rows.push({ offset: i, rowBytes, origRowBytes });
  }

  return (
    <div className="hex-viewer-card">
      <div className="card-header">
        <div className="card-title">
          <Binary size={18} className="text-cyan" />
          <span>Binary Hex Inspector & Byte Diff Engine</span>
        </div>

        <div className="hex-controls">
          <div className="mode-btn-group">
            <button
              className={`mode-btn ${viewMode === 'reconstructed' ? 'active' : ''}`}
              onClick={() => setViewMode('reconstructed')}
            >
              Repaired Hex Stream
            </button>
            <button
              className={`mode-btn ${viewMode === 'original' ? 'active' : ''}`}
              onClick={() => setViewMode('original')}
            >
              Corrupted Input Hex
            </button>
            <button
              className={`mode-btn ${viewMode === 'diff' ? 'active' : ''}`}
              onClick={() => setViewMode('diff')}
            >
              Byte Fix Diff
            </button>
          </div>

          <select
            className="byte-limit-select"
            value={maxBytes}
            onChange={(e) => setMaxBytes(Number(e.target.value))}
          >
            <option value={256}>First 256 Bytes</option>
            <option value={512}>First 512 Bytes</option>
            <option value={1024}>First 1 KB</option>
            <option value={4096}>First 4 KB</option>
          </select>
        </div>
      </div>

      <div className="card-body">
        <div className="hex-table-wrapper">
          <table className="hex-table">
            <thead>
              <tr>
                <th className="th-offset">Offset</th>
                <th className="th-hex">
                  Hex Bytes (00 - 0F)
                </th>
                <th className="th-ascii">ASCII Representation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ offset, rowBytes, origRowBytes }) => (
                <tr key={offset}>
                  <td className="td-offset font-mono">{formatOffset(offset)}</td>
                  <td className="td-hex font-mono">
                    {Array.from({ length: 16 }).map((_, idx) => {
                      if (idx >= rowBytes.length) {
                        return <span key={idx} className="hex-byte empty">  </span>;
                      }
                      const b = rowBytes[idx];
                      const origB = idx < origRowBytes.length ? origRowBytes[idx] : undefined;
                      const isModified = origB !== undefined && b !== origB;

                      const hexStr = b.toString(16).padStart(2, '0').toUpperCase();

                      return (
                        <span
                          key={idx}
                          className={`hex-byte ${isModified ? 'modified-byte' : ''} ${b === 0 ? 'zero-byte' : ''}`}
                          title={`Offset: ${formatOffset(offset + idx)} | Byte: 0x${hexStr} (${b})`}
                        >
                          {hexStr}
                        </span>
                      );
                    })}
                  </td>
                  <td className="td-ascii font-mono">
                    {Array.from(rowBytes).map((b, idx) => {
                      const char = b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
                      const origB = idx < origRowBytes.length ? origRowBytes[idx] : undefined;
                      const isModified = origB !== undefined && b !== origB;
                      return (
                        <span
                          key={idx}
                          className={`ascii-char ${isModified ? 'modified-char' : ''}`}
                        >
                          {char}
                        </span>
                      );
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
