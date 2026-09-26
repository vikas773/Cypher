import React, { useState, useEffect } from 'react';
import type { ReconstructionResult } from '../types/fileTypes';
import { Music, Archive, Eye, CheckCircle2, Play, Pause, AlertTriangle, Download, FolderDown, Sparkles, Check } from 'lucide-react';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';

interface BeforeAfterPreviewProps {
  result: ReconstructionResult;
}

export const BeforeAfterPreview: React.FC<BeforeAfterPreviewProps> = ({ result }) => {
  const [sliderPos, setSliderPos] = useState(50);
  const [activeTab, setActiveTab] = useState<'preview' | 'textDiff' | 'archiveContents'>('preview');
  const [textBefore, setTextBefore] = useState<string>('');
  const [textAfter, setTextAfter] = useState<string>('');
  const [zipFileList, setZipFileList] = useState<{ name: string; size: number }[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (result.fileCategory === 'document' || result.detectedSignature.includes('JSON') || result.detectedSignature.includes('Text')) {
      try {
        const dec = new TextDecoder('utf-8', { fatal: false });
        setTextBefore(dec.decode(new Uint8Array(result.originalBuffer).subarray(0, 5000)));
        setTextAfter(dec.decode(new Uint8Array(result.reconstructedBuffer).subarray(0, 5000)));
      } catch {
        setTextBefore('[Binary stream could not be converted to UTF-8 text]');
        setTextAfter('[Reconstructed binary stream output]');
      }
    }

    if (result.fileCategory === 'archive' || result.detectedSignature.includes('ZIP')) {
      JSZip.loadAsync(result.reconstructedBuffer)
        .then((zip) => {
          const list: { name: string; size: number }[] = [];
          zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
              list.push({ name: relativePath, size: (zipEntry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 1024 });
            }
          });
          setZipFileList(list);
        })
        .catch(() => {
          setZipFileList([]);
        });
    }
  }, [result]);

  const toggleAudio = () => {
    if (!audioElement) {
      const audio = new Audio(result.reconstructedUrl);
      audio.onended = () => setIsPlayingAudio(false);
      setAudioElement(audio);
      audio.play();
      setIsPlayingAudio(true);
    } else {
      if (isPlayingAudio) {
        audioElement.pause();
        setIsPlayingAudio(false);
      } else {
        audioElement.play();
        setIsPlayingAudio(true);
      }
    }
  };

  const triggerStandardDownload = () => {
    confetti({ particleCount: 70, spread: 60, colors: ['#06b6d4', '#10b981', '#8b5cf6'] });
    const link = document.createElement('a');
    link.href = result.reconstructedUrl;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSaveToCustomFolder = async () => {
    confetti({ particleCount: 80, spread: 70, colors: ['#06b6d4', '#10b981', '#f59e0b'] });
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
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          triggerStandardDownload();
        }
      }
    } else {
      triggerStandardDownload();
    }
  };

  return (
    <div className="before-after-card">
      <div className="card-header">
        <div className="card-title">
          <Eye size={18} className="text-cyan" />
          <span>Interactive Visual & Structure Comparison</span>
        </div>
        <div className="view-toggle-tabs">
          <button
            className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Visual Output Preview
          </button>
          {(result.fileCategory === 'document' || textAfter.length > 0) && (
            <button
              className={`tab-btn ${activeTab === 'textDiff' ? 'active' : ''}`}
              onClick={() => setActiveTab('textDiff')}
            >
              Text & Syntax Diff
            </button>
          )}
          {result.fileCategory === 'archive' && (
            <button
              className={`tab-btn ${activeTab === 'archiveContents' ? 'active' : ''}`}
              onClick={() => setActiveTab('archiveContents')}
            >
              Salvaged File Directory ({zipFileList.length})
            </button>
          )}
        </div>
      </div>

      <div className="card-body">
        {activeTab === 'preview' && (
          <div className="preview-container">
            {result.fileCategory === 'image' ? (
              <div className="image-comparison-wrapper">
                <div className="split-comparison-container" onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                  setSliderPos((x / rect.width) * 100);
                }}>
                  <img
                    src={result.reconstructedUrl}
                    alt="Reconstructed"
                    className="comparison-image repaired-img"
                  />

                  {result.originalUrl && (
                    <div
                      className="corrupted-img-wrapper"
                      style={{ width: `${sliderPos}%` }}
                    >
                      <img
                        src={result.originalUrl}
                        alt="Corrupted Original"
                        className="comparison-image corrupted-img"
                      />
                    </div>
                  )}

                  <div className="slider-handle" style={{ left: `${sliderPos}%` }}>
                    <div className="handle-line"></div>
                    <div className="handle-button">
                      <span>‹›</span>
                    </div>
                  </div>

                  <div className="badge-overlay left">Corrupted Original</div>
                  <div className="badge-overlay right">Reconstructed (Repaired)</div>
                </div>
              </div>
            ) : result.fileCategory === 'pdf' ? (
              <div className="pdf-preview-box">
                <iframe
                  src={result.reconstructedUrl}
                  title="PDF Reconstructed Preview"
                  className="pdf-iframe"
                />
              </div>
            ) : result.fileCategory === 'audio' ? (
              <div className="audio-preview-box">
                <div className="audio-visualizer-card">
                  <div className="audio-icon-pulse">
                    <Music size={40} className="text-cyan" />
                  </div>
                  <div className="audio-details">
                    <h4>{result.fileName}</h4>
                    <p className="text-muted">Reconstructed PCM Waveform Stream (44.1 kHz)</p>
                    <div className="waveform-bars">
                      {[40, 70, 30, 90, 60, 100, 45, 80, 55, 95, 30, 75, 50, 85, 65, 40].map((h, i) => (
                        <div
                          key={i}
                          className={`wave-bar ${isPlayingAudio ? 'animating' : ''}`}
                          style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
                        ></div>
                      ))}
                    </div>
                  </div>
                  <button className="audio-play-btn" onClick={toggleAudio}>
                    {isPlayingAudio ? <Pause size={24} /> : <Play size={24} />}
                  </button>
                </div>
              </div>
            ) : result.fileCategory === 'archive' ? (
              <div className="archive-preview-box">
                <div className="archive-summary-badge">
                  <Archive size={24} className="text-violet" />
                  <div>
                    <h4>ZIP Archive Container Restored</h4>
                    <p>{zipFileList.length} uncompressed internal file streams salvaged.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="generic-text-box">
                <pre className="code-block">{textAfter || 'Binary data stream successfully repaired.'}</pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'textDiff' && (
          <div className="text-diff-grid">
            <div className="diff-column">
              <div className="diff-header text-red">
                <AlertTriangle size={14} /> Corrupted Input
              </div>
              <pre className="diff-content corrupted">{textBefore || '[Unreadable binary bytes]'}</pre>
            </div>
            <div className="diff-column">
              <div className="diff-header text-green">
                <CheckCircle2 size={14} /> Repaired Syntax & Data AST
              </div>
              <pre className="diff-content repaired">{textAfter || '[Repaired Data Payload]'}</pre>
            </div>
          </div>
        )}

        {activeTab === 'archiveContents' && (
          <div className="archive-tree-view">
            <table className="cypher-table">
              <thead>
                <tr>
                  <th>Salvaged File Path</th>
                  <th>Uncompressed Size</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {zipFileList.map((item, idx) => (
                  <tr key={idx}>
                    <td className="font-mono text-cyan">{item.name}</td>
                    <td>{(item.size / 1024).toFixed(1)} KB</td>
                    <td><span className="badge badge-success">Recovered</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Dedicated Download & Folder Selector Bar Below Reconstructed View */}
        <div className="reconstructed-download-footer-bar">
          <div className="download-footer-info">
            <div className="success-icon-badge">
              {savedSuccess ? <Check size={20} className="text-green" /> : <Sparkles size={20} className="text-cyan" />}
            </div>
            <div>
              <h4 className="download-footer-title">
                {savedSuccess ? 'Reconstructed File Saved Successfully!' : 'Reconstructed File Ready for Export'}
              </h4>
              <p className="download-footer-subtext">
                Target Payload: <strong className="text-cyan font-mono">{result.fileName}</strong> ({(result.reconstructedSize / 1024).toFixed(1)} KB)
              </p>
            </div>
          </div>

          <div className="download-footer-actions">
            <button className="cypher-btn btn-secondary" onClick={triggerStandardDownload} title="Save to default browser Downloads folder">
              <Download size={16} />
              <span>Default Download</span>
            </button>

            <button className="cypher-btn btn-primary" onClick={handleSaveToCustomFolder} title="Open File Explorer / Manager to choose exact destination directory">
              <FolderDown size={18} />
              <span>Select Destination Folder & Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
