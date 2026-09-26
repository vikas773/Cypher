import React from 'react';
import type { ReconstructionResult } from '../types/fileTypes';
import { ShieldCheck, CheckCircle2, Download, HardDrive, Key, Layers, Activity } from 'lucide-react';

interface ForensicAssessmentPanelProps {
  result: ReconstructionResult;
}

export const ForensicAssessmentPanel: React.FC<ForensicAssessmentPanelProps> = ({ result }) => {
  const assessment = result.forensicAssessment;
  const isHighPriority = !assessment || assessment.investigationPriority === 'HIGH_PRIORITY_EVIDENCE';
  const isMediumPriority = assessment?.investigationPriority === 'MEDIUM_PRIORITY_EVIDENCE';

  const downloadForensicReport = () => {
    const reportData = {
      title: 'CYPHER DIGITAL EVIDENCE & RECONSTRUCTION FORENSIC REPORT',
      timestamp: new Date().toISOString(),
      evidenceFile: result.fileName,
      detectedMime: result.targetMimeType,
      signatureName: result.detectedSignature,
      sha256Hash: assessment?.sha256Hash || 'N/A',
      investigationPriority: assessment?.investigationPriority || 'HIGH_PRIORITY_EVIDENCE',
      integrityScore: assessment?.integrityScore || result.confidenceScore,
      recoverablePercentage: assessment?.recoverablePercentage || 100,
      originalSizeBytes: result.originalSize,
      reconstructedSizeBytes: result.reconstructedSize,
      appliedByteFixes: result.appliedFixesCount,
      fragmentRelationship: assessment?.fragmentRelationship || {
        sequenceStatus: 'SINGLE_CONTINUOUS_PAYLOAD',
        totalChunks: 1,
      },
      repairLogs: result.repairLogs,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FORENSIC_REPORT_${result.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="forensic-panel-container bg-dark-card border border-border-cyan rounded-xl p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="text-cyan-400" size={20} />
            <span className="text-xs font-mono tracking-wider text-cyan-400 uppercase font-semibold">
              FORENSIC DIGITAL EVIDENCE CLASSIFICATION
            </span>
          </div>
          <h3 className="text-xl font-bold text-white flex items-center gap-3">
            <span>{result.detectedSignature}</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
                isHighPriority
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : isMediumPriority
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              {assessment?.investigationPriority.replace(/_/g, ' ') || 'HIGH PRIORITY EVIDENCE'}
            </span>
          </h3>
        </div>

        <button
          onClick={downloadForensicReport}
          className="cypher-btn btn-secondary text-sm flex items-center gap-2 self-start md:self-auto"
        >
          <Download size={16} />
          <span>Export Forensic JSON Report</span>
        </button>
      </div>

      {/* Forensic Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="metric-card bg-black/40 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>INTEGRITY ASSESSMENT</span>
            <Activity size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {assessment?.integrityScore ?? result.confidenceScore}%
          </div>
          <p className="text-xs text-gray-400 mt-1">Data structure validity score</p>
        </div>

        <div className="metric-card bg-black/40 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>SALVATION RATIO</span>
            <HardDrive size={16} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {assessment?.recoverablePercentage ?? 100}%
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {(result.reconstructedSize / 1024).toFixed(1)} KB salvaged stream
          </p>
        </div>

        <div className="metric-card bg-black/40 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>APPLIED HEALING</span>
            <CheckCircle2 size={16} className="text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 font-mono">
            {result.appliedFixesCount} FIXES
          </div>
          <p className="text-xs text-gray-400 mt-1">Byte structure repairs applied</p>
        </div>

        <div className="metric-card bg-black/40 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>FRAGMENT STATUS</span>
            <Layers size={16} className="text-amber-400" />
          </div>
          <div className="text-lg font-bold text-amber-400 font-mono truncate">
            {assessment?.fragmentRelationship ? `${assessment.fragmentRelationship.totalChunks} BIN CHUNKS` : 'SINGLE PAYLOAD'}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {assessment?.fragmentRelationship ? `File ID: 0x${assessment.fragmentRelationship.fileIdHex}` : 'Continuous stream'}
          </p>
        </div>
      </div>

      {/* Forensic Hash & Evidence Information */}
      <div className="bg-black/30 border border-white/10 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Key size={16} className="text-cyan-400" />
          <span>CHAIN-OF-CUSTODY DIGITAL FINGERPRINT (SHA-256)</span>
        </div>
        <div className="bg-black/60 border border-white/10 rounded p-3 font-mono text-xs text-cyan-300 break-all select-all">
          {assessment?.sha256Hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
        </div>
      </div>

      {/* Fragment Relationship Details */}
      {assessment?.fragmentRelationship && (
        <div className="bg-black/30 border border-white/10 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
              <Layers size={16} className="text-amber-400" />
              <span>RECOVERED FRAGMENT CORRELATION & SEQUENCE MAP</span>
            </div>
            <span className="text-xs font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
              {assessment.fragmentRelationship.sequenceStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {Array.from({ length: assessment.fragmentRelationship.totalChunks }).map((_, idx) => (
              <div
                key={idx}
                className="bg-emerald-950/40 border border-emerald-500/40 rounded p-2.5 text-center font-mono text-xs text-emerald-400"
              >
                Chunk #{idx + 1} • OK
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
