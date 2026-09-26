import React, { useState } from 'react';
import type { CorruptOptions } from '../types/fileTypes';
import { corruptBuffer } from '../utils/corruptionSimulator';
import { Zap, X, Play } from 'lucide-react';

interface CorruptionSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCorruptedFile: (corruptedBuffer: ArrayBuffer, name: string) => void;
  currentBuffer?: ArrayBuffer;
  currentName?: string;
}

export const CorruptionSimulatorModal: React.FC<CorruptionSimulatorModalProps> = ({
  isOpen,
  onClose,
  onRunCorruptedFile,
  currentBuffer,
  currentName,
}) => {
  const [options, setOptions] = useState<CorruptOptions>({
    wipeHeader: true,
    bitFlipPercentage: 2,
    truncatePercentage: 0,
    injectNulls: false,
    corruptSyntax: false,
  });

  if (!isOpen) return null;

  const handleSimulateAndRepair = () => {
    if (!currentBuffer) return;
    const corrupted = corruptBuffer(currentBuffer, options);
    onRunCorruptedFile(corrupted, `Corrupted_${currentName || 'file'}`);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <Zap size={20} className="text-yellow" />
            <span>Corruptor & Stress Tester Lab</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">
            Inject synthetic binary damage into <strong className="text-cyan">{currentName || 'target file'}</strong> to test Cypher's deep reconstruction algorithms.
          </p>

          <div className="control-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.wipeHeader}
                onChange={(e) => setOptions({ ...options, wipeHeader: e.target.checked })}
              />
              <span className="label-text font-bold">Wipe Header Magic Bytes (0x00)</span>
            </label>
            <p className="help-text">Zeroes out the first 32 bytes (removes PNG, JPEG, PDF, ZIP signature markers).</p>
          </div>

          <div className="control-group">
            <div className="slider-label-row">
              <span className="label-text font-bold">Bit Flip / Noise Injection Percentage</span>
              <span className="slider-value text-yellow">{options.bitFlipPercentage}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="1"
              value={options.bitFlipPercentage}
              onChange={(e) => setOptions({ ...options, bitFlipPercentage: Number(e.target.value) })}
              className="cypher-slider"
            />
            <p className="help-text">Randomly inverts bit values across the binary payload.</p>
          </div>

          <div className="control-group">
            <div className="slider-label-row">
              <span className="label-text font-bold">File Truncation Percentage</span>
              <span className="slider-value text-red">{options.truncatePercentage}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={options.truncatePercentage}
              onChange={(e) => setOptions({ ...options, truncatePercentage: Number(e.target.value) })}
              className="cypher-slider"
            />
            <p className="help-text">Cuts off trailing EOF markers or bytes from the buffer tail.</p>
          </div>

          <div className="control-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.injectNulls}
                onChange={(e) => setOptions({ ...options, injectNulls: e.target.checked })}
              />
              <span className="label-text font-bold">Inject Null Byte Bursts</span>
            </label>
            <p className="help-text">Inserts blocks of 0x00 null bytes mid-stream.</p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cypher-btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="cypher-btn btn-accent" onClick={handleSimulateAndRepair}>
            <Play size={16} />
            <span>Corrupt & Run Reconstructor</span>
          </button>
        </div>
      </div>
    </div>
  );
};
