import React, { useState } from 'react';
import type { ReconstructionResult } from '../types/fileTypes';
import { reconstructCorruptedFile } from '../utils/reconstructor/masterReconstructor';
import JSZip from 'jszip';
import { Layers, X, UploadCloud, Download, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface BatchRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BatchRepairModal: React.FC<BatchRepairModalProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ReconstructionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  const runBatchProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    const batchResults: ReconstructionResult[] = [];

    for (const file of files) {
      const res = await reconstructCorruptedFile(file);
      batchResults.push(res);
    }

    setResults(batchResults);
    setIsProcessing(false);
    confetti({ particleCount: 50, spread: 60 });
  };

  const downloadAllAsZip = async () => {
    if (results.length === 0) return;
    const zip = new JSZip();

    results.forEach((res) => {
      zip.file(res.fileName, res.reconstructedBuffer);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = 'Cypher_Batch_Repaired_Files.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-large">
        <div className="modal-header">
          <div className="modal-title">
            <Layers size={20} className="text-violet" />
            <span>Multi-File Batch Repair Queue</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="batch-drop-area">
            <input type="file" multiple onChange={handleFileDrop} id="batch-input" style={{ display: 'none' }} />
            <label htmlFor="batch-input" className="batch-drop-label">
              <UploadCloud size={32} className="text-cyan" />
              <span>Select or drop multiple corrupted files ({files.length} selected)</span>
            </label>
          </div>

          {files.length > 0 && (
            <div className="file-queue-list">
              <h4 className="queue-title">Selected Queue ({files.length} files)</h4>
              <div className="queue-items">
                {files.map((f, i) => {
                  const res = results[i];
                  return (
                    <div key={i} className="queue-item-row">
                      <span className="queue-filename font-mono">{f.name}</span>
                      <span className="queue-size font-mono font-small">{(f.size / 1024).toFixed(1)} KB</span>
                      {res ? (
                        <span className="queue-status text-green font-bold flex-center gap-1">
                          <CheckCircle2 size={14} /> Repaired ({res.appliedFixesCount} fixes)
                        </span>
                      ) : (
                        <span className="queue-status text-muted">Pending...</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cypher-btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {results.length > 0 ? (
            <button className="cypher-btn btn-primary" onClick={downloadAllAsZip}>
              <Download size={16} />
              <span>Download All Repaired (.ZIP)</span>
            </button>
          ) : (
            <button
              className="cypher-btn btn-primary"
              onClick={runBatchProcess}
              disabled={files.length === 0 || isProcessing}
            >
              {isProcessing ? <Loader2 size={16} className="spinner" /> : <Sparkles size={16} />}
              <span>{isProcessing ? 'Processing Queue...' : 'Run Batch Repair'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
