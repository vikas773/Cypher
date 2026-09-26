import React, { useState } from 'react';
import type { RepairLog } from '../types/fileTypes';
import { Terminal, Copy, Check, Sparkles, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

interface RepairLogsPanelProps {
  logs: RepairLog[];
}

export const RepairLogsPanel: React.FC<RepairLogsPanelProps> = ({ logs }) => {
  const [copied, setCopied] = useState(false);

  const copyLogsToClipboard = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="logs-card">
      <div className="card-header">
        <div className="card-title">
          <Terminal size={18} className="text-cyan" />
          <span>Real-time Reconstruction Diagnostic Logs</span>
        </div>

        <button className="cypher-btn btn-small" onClick={copyLogsToClipboard}>
          {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
          <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
        </button>
      </div>

      <div className="card-body">
        <div className="logs-terminal">
          {logs.map((log) => (
            <div key={log.id} className={`log-entry log-${log.type}`}>
              <span className="log-timestamp">[{log.timestamp}]</span>
              <span className="log-badge font-mono">
                {log.type === 'repair' && <Sparkles size={12} className="text-cyan" />}
                {log.type === 'success' && <CheckCircle2 size={12} className="text-green" />}
                {log.type === 'warning' && <AlertTriangle size={12} className="text-yellow" />}
                {log.type === 'info' && <Info size={12} className="text-blue" />}
                {log.type.toUpperCase()}
              </span>
              <span className="log-msg">{log.message}</span>
              {log.offset !== undefined && (
                <span className="log-offset font-mono">@ offset 0x{log.offset.toString(16).toUpperCase()}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
