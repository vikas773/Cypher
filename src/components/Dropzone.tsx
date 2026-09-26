import React, { useRef, useState } from 'react';
import { UploadCloud, File, Image, FileText, Music, Archive, Zap, ArrowRight, Sparkles } from 'lucide-react';
import { SAMPLE_FILES } from '../utils/sampleFiles';
import type { SampleFileItem } from '../types/fileTypes';

interface DropzoneProps {
  onFileSelected: (files: File | File[] | Blob, nameHint?: string) => void;
  onSelectSample: (sample: SampleFileItem) => void;
  isProcessing: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFileSelected,
  onSelectSample,
  isProcessing,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFileSelected(filesArray.length === 1 ? filesArray[0] : filesArray);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFileSelected(filesArray.length === 1 ? filesArray[0] : filesArray);
    }
  };

  return (
    <div className="dropzone-section">
      <div className="hero-banner">
        <div className="hero-badge">
          <Sparkles size={14} className="text-cyan" />
          <span>UNIVERSAL FILE RECONSTRUCTION & BINARY HEALER</span>
        </div>
        <h2 className="hero-title">
          Restore Damaged & Corrupted Files to <span className="gradient-text">Original Readability</span>
        </h2>
        <p className="hero-description">
          Upload any unreadable image, corrupted PDF, broken JSON, ruined audio, or invalid archive.
          Cypher analyzes binary magic signatures, repairs headers, recalculates checksums, and restores file structure in seconds.
        </p>
      </div>

      <div
        className={`dropzone-card ${isDragOver ? 'drag-over' : ''} ${isProcessing ? 'processing' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept=".bin, .frg, .pdf, .png, .jpg, .jpeg, .gif, .webp, .bmp, .zip, .rar, .mp3, .wav, .json, .docx, .xml, .txt, .corrupted"
          style={{ display: 'none' }}
        />

        <div className="dropzone-content">
          <div className="icon-pulse-container">
            <UploadCloud className="upload-icon text-cyan" />
            <div className="scan-line"></div>
          </div>

          <h3 className="dropzone-heading">
            {isProcessing ? 'Reconstructing Binary Payload...' : 'Drop your corrupted file here or click to browse'}
          </h3>
          <p className="dropzone-subtext">
            Supports all formats: PNG, JPEG, PDF, JSON, DOCX, ZIP, WAV, MP3, XML, TXT & Raw Binaries
          </p>

          <div className="supported-formats-pills">
            <span className="format-pill"><Image size={14} /> Images (PNG, JPG, WEBP, GIF, BMP)</span>
            <span className="format-pill"><FileText size={14} /> Documents & PDF (%PDF, DOCX)</span>
            <span className="format-pill"><File size={14} /> Structured Data (JSON, XML, CSV)</span>
            <span className="format-pill"><Music size={14} /> Audio Streams (WAV, MP3)</span>
            <span className="format-pill"><Archive size={14} /> Containers (ZIP, RAR, TAR)</span>
          </div>
        </div>
      </div>

      <div className="samples-container">
        <div className="samples-header">
          <div className="samples-title">
            <Zap size={16} className="text-yellow" />
            <span>Don't have a corrupted file handy? Test with Live Corrupted Samples:</span>
          </div>
        </div>

        <div className="sample-cards-grid">
          {SAMPLE_FILES.map((sample) => (
            <div
              key={sample.id}
              className="sample-card"
              onClick={() => onSelectSample(sample)}
            >
              <div className="sample-card-header">
                {sample.category === 'image' && <Image size={20} className="text-cyan" />}
                {sample.category === 'pdf' && <FileText size={20} className="text-red" />}
                {sample.category === 'document' && <File size={20} className="text-yellow" />}
                {sample.category === 'audio' && <Music size={20} className="text-green" />}
                {sample.category === 'archive' && <Archive size={20} className="text-violet" />}
                <span className="sample-name">{sample.name}</span>
              </div>
              <p className="sample-desc">{sample.description}</p>
              <div className="sample-action">
                <span>Test Reconstruction</span>
                <ArrowRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
