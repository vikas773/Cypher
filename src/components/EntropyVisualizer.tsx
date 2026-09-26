import React, { useEffect, useRef } from 'react';
import type { ReconstructionResult } from '../types/fileTypes';
import { BarChart2, Info } from 'lucide-react';

interface EntropyVisualizerProps {
  result: ReconstructionResult;
}

export const EntropyVisualizer: React.FC<EntropyVisualizerProps> = ({ result }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = canvas.parentElement?.clientWidth || 700);
    const height = (canvas.height = 180);

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 30; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const beforePts = result.entropyBefore;
    const afterPts = result.entropyAfter;

    if (beforePts.length === 0) return;

    ctx.beginPath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;

    const stepX = width / Math.max(1, beforePts.length - 1);

    beforePts.forEach((pt, i) => {
      const x = i * stepX;
      const y = height - (pt.entropy / 8) * (height - 40) - 20;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    if (afterPts.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;

      const stepXAfter = width / Math.max(1, afterPts.length - 1);
      afterPts.forEach((pt, i) => {
        const x = i * stepXAfter;
        const y = height - (pt.entropy / 8) * (height - 40) - 20;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText('8.0 Bits (High Information / Encrypted)', 10, 20);
    ctx.fillText('0.0 Bits (Null / Wiped Bytes)', 10, height - 5);
  }, [result]);

  return (
    <div className="entropy-card">
      <div className="card-header">
        <div className="card-title">
          <BarChart2 size={18} className="text-cyan" />
          <span>Shannon Entropy Spectrum (Density Distribution)</span>
        </div>
        <div className="entropy-legend">
          <span className="legend-item"><span className="dot red"></span> Input Corrupted Stream</span>
          <span className="legend-item"><span className="dot cyan"></span> Repaired Stream Output</span>
        </div>
      </div>

      <div className="card-body">
        <div className="canvas-wrapper">
          <canvas ref={canvasRef} className="entropy-canvas" />
        </div>
        <p className="entropy-footer-note">
          <Info size={14} className="text-cyan" />
          Shannon Entropy measures randomness per 256-byte window. Drop-offs to 0 bits highlight wiped header blocks repaired by Cypher.
        </p>
      </div>
    </div>
  );
};
