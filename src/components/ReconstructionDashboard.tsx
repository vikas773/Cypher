import React, { useState } from 'react';
import type { ReconstructionResult } from '../types/fileTypes';
import { BeforeAfterPreview } from './BeforeAfterPreview';
import { HexViewer } from './HexViewer';
import { EntropyVisualizer } from './EntropyVisualizer';
import { RepairLogsPanel } from './RepairLogsPanel';
import { ForensicAssessmentPanel } from './ForensicAssessmentPanel';
import { RefreshCw, Sparkles, CheckCircle2, Cpu, FileCheck, Layers, FolderDown } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ReconstructionDashboardProps {
  result: ReconstructionResult;
  onReset: () => void;
  onOpenSimulator: () => void;
}

export const ReconstructionDashboard: React.FC<ReconstructionDashboardProps> = ({
  result,
  onReset,
  onOpenSimulator,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'forensic' | 'hex' | 'entropy' | 'logs'>('preview');

  const handleDownload = async () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#06b6d4', '#10b981', '#8b5cf6', '#3b82f6'],
    });

    if ('showSaveFilePicker' in window) {
      try {
        const ext = result.fileName.split('.').pop() || 'bin';
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: result.fileName,
          types: [
            {
              description: `${result.detectedSignature} (*.${ext})`,
              accept: {
                [result.targetMimeType || 'application/octet-stream']: ['.' + ext],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(result.reconstructedBuffer);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    const link = document.createElement('a');
    link.href = result.reconstructedUrl;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="dashboard-container">
      <div className="metrics-summary-bar">
        <div className="metric-badge-item">
          <div className="metric-icon-circle bg-cyan">
            <Sparkles size={20} className="text-dark" />
          </div>
          <div className="metric-text">
            <span className="metric-label">RECONSTRUCTION STATUS</span>
            <span className="metric-value text-cyan">
              {result.appliedFixesCount > 0 ? `${result.appliedFixesCount} BYTE FIXES APPLIED` : 'CONTAINER VALIDATED'}
            </span>
          </div>
        </div>

        <div className="metric-badge-item">
          <div className="metric-icon-circle bg-green">
            <CheckCircle2 size={20} className="text-dark" />
          </div>
          <div className="metric-text">
            <span className="metric-label">REPAIR CONFIDENCE</span>
            <span className="metric-value text-green">{result.confidenceScore}% SCORE</span>
          </div>
        </div>

        <div className="metric-badge-item">
          <div className="metric-icon-circle bg-violet">
            <FileCheck size={20} className="text-dark" />
          </div>
          <div className="metric-text">
            <span className="metric-label">DETECTED FORMAT</span>
            <span className="metric-value text-violet">{result.detectedSignature}</span>
          </div>
        </div>

        <div className="metric-badge-item">
          <div className="metric-icon-circle bg-yellow">
            <Cpu size={20} className="text-dark" />
          </div>
          <div className="metric-text">
            <span className="metric-label">PAYLOAD SIZE</span>
            <span className="metric-value text-yellow">{(result.reconstructedSize / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      </div>

      <div className="dashboard-action-bar">
        <div className="file-info-title">
          <h2 className="file-name">{result.fileName}</h2>
          <span className="mime-badge font-mono">{result.targetMimeType}</span>
        </div>

        <div className="action-buttons-row">
          <button className="cypher-btn btn-secondary" onClick={onReset}>
            <RefreshCw size={16} />
            <span>Scan Another File</span>
          </button>

          <button className="cypher-btn btn-secondary" onClick={onOpenSimulator}>
            <Layers size={16} />
            <span>Stress Test In Lab</span>
          </button>

          <button className="cypher-btn btn-primary" onClick={handleDownload} title="Save Reconstructed File to Desired Target Folder">
            <FolderDown size={18} />
            <span>Save to Selected Folder</span>
          </button>
        </div>
      </div>

      <div className="dashboard-nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Visual & Structure Preview
        </button>

        <button
          className={`nav-tab ${activeTab === 'forensic' ? 'active' : ''}`}
          onClick={() => setActiveTab('forensic')}
        >
          Forensic Evidence Assessment
        </button>

        <button
          className={`nav-tab ${activeTab === 'hex' ? 'active' : ''}`}
          onClick={() => setActiveTab('hex')}
        >
          Binary Hex Inspector
        </button>

        <button
          className={`nav-tab ${activeTab === 'entropy' ? 'active' : ''}`}
          onClick={() => setActiveTab('entropy')}
        >
          Shannon Entropy Density
        </button>

        <button
          className={`nav-tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Diagnostic Audit Logs ({result.repairLogs.length})
        </button>
      </div>

      <div className="tab-content-panel">
        {activeTab === 'preview' && <BeforeAfterPreview result={result} />}
        {activeTab === 'forensic' && <ForensicAssessmentPanel result={result} />}
        {activeTab === 'hex' && <HexViewer result={result} />}
        {activeTab === 'entropy' && <EntropyVisualizer result={result} />}
        {activeTab === 'logs' && <RepairLogsPanel logs={result.repairLogs} />}
      </div>
    </div>
  );
};
