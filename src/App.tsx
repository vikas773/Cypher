import React, { useState } from 'react';
import type { ReconstructionResult, SampleFileItem } from './types/fileTypes';
import { reconstructCorruptedFile } from './utils/reconstructor/masterReconstructor';
import { Navbar } from './components/Navbar';
import { Dropzone } from './components/Dropzone';
import { ReconstructionDashboard } from './components/ReconstructionDashboard';
import { CorruptionSimulatorModal } from './components/CorruptionSimulatorModal';
import { BatchRepairModal } from './components/BatchRepairModal';
import { HexMatrixBackground } from './components/HexMatrixBackground';

export const App: React.FC = () => {
  const [reconstructionResult, setReconstructionResult] = useState<ReconstructionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeBuffer, setActiveBuffer] = useState<ArrayBuffer | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>('');

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);

  const processFileOrBuffer = async (
    fileOrBuffer: File | File[] | Blob | ArrayBuffer | ArrayBuffer[],
    nameHint?: string
  ) => {
    setIsProcessing(true);
    try {
      let name = nameHint || 'corrupted_file';
      if (Array.isArray(fileOrBuffer)) {
        if (fileOrBuffer.length > 0 && fileOrBuffer[0] instanceof File) {
          name = fileOrBuffer[0].name;
        }
      } else if (fileOrBuffer instanceof File) {
        name = fileOrBuffer.name;
      }

      const result = await reconstructCorruptedFile(fileOrBuffer as any, name);
      setActiveBuffer(result.reconstructedBuffer);
      setActiveFileName(result.fileName);
      setReconstructionResult(result);
    } catch (err) {
      console.error('Reconstruction error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectSample = async (sample: SampleFileItem) => {
    setIsProcessing(true);
    try {
      const { corruptedBlob, originalBlob, corruptedName } = await sample.createCorruptedBlob();
      const corruptBuf = await corruptedBlob.arrayBuffer();
      const origBuf = await originalBlob.arrayBuffer();

      setActiveBuffer(origBuf);
      setActiveFileName(sample.name);

      const result = await reconstructCorruptedFile(corruptBuf, corruptedName);
      result.originalUrl = URL.createObjectURL(originalBlob);
      result.originalBuffer = origBuf;
      setReconstructionResult(result);
    } catch (err) {
      console.error('Sample corruption error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setReconstructionResult(null);
    setActiveBuffer(null);
    setActiveFileName('');
  };

  return (
    <div className="app-container relative">
      <HexMatrixBackground />
      <Navbar
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onOpenBatchRepair={() => setIsBatchOpen(true)}
        onReset={handleReset}
        hasActiveFile={!!reconstructionResult}
      />

      <main className="app-main-content">
        {!reconstructionResult ? (
          <Dropzone
            onFileSelected={processFileOrBuffer}
            onSelectSample={handleSelectSample}
            isProcessing={isProcessing}
          />
        ) : (
          <ReconstructionDashboard
            result={reconstructionResult}
            onReset={handleReset}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
          />
        )}
      </main>

      <CorruptionSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onRunCorruptedFile={(corruptedBuf, name) => processFileOrBuffer(corruptedBuf, name)}
        currentBuffer={activeBuffer || undefined}
        currentName={activeFileName}
      />

      <BatchRepairModal
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
      />
    </div>
  );
};

export default App;
