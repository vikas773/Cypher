export type FileCategory = 'image' | 'pdf' | 'document' | 'audio' | 'archive' | 'unknown';

export interface SignatureDefinition {
  name: string;
  category: FileCategory;
  mime: string;
  extension: string;
  headerHex: number[];
  footerHex?: number[];
  offset?: number;
}

export interface RepairLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'repair';
  message: string;
  offset?: number;
  details?: string;
}

export interface EntropyPoint {
  offset: number;
  entropy: number;
}

export interface FragmentRelationship {
  fileIdHex: string;
  totalChunks: number;
  assembledChunks: number;
  missingChunks: number[];
  sequenceStatus: 'COMPLETE' | 'PARTIAL' | 'SINGLE_PAYLOAD';
}

export interface ForensicAssessment {
  integrityScore: number; // 0 to 100%
  investigationPriority: 'HIGH_PRIORITY_EVIDENCE' | 'MEDIUM_PRIORITY_EVIDENCE' | 'CRITICAL_DEGRADATION';
  recoverablePercentage: number;
  evidenceCategoryLabel: string;
  fragmentRelationship?: FragmentRelationship;
  sha256Hash: string;
}

export interface ReconstructionResult {
  fileName: string;
  fileCategory: FileCategory;
  originalSize: number;
  reconstructedSize: number;
  originalBuffer: ArrayBuffer;
  reconstructedBuffer: ArrayBuffer;
  reconstructedBlob: Blob;
  reconstructedUrl: string;
  confidenceScore: number; // 0 to 100
  repairLogs: RepairLog[];
  appliedFixesCount: number;
  detectedSignature: string;
  targetMimeType: string;
  entropyBefore: EntropyPoint[];
  entropyAfter: EntropyPoint[];
  isSuccessfullyRepaired: boolean;
  originalUrl?: string;
  forensicAssessment?: ForensicAssessment;
}

export interface CorruptOptions {
  wipeHeader: boolean;
  bitFlipPercentage: number;
  truncatePercentage: number;
  injectNulls: boolean;
  corruptSyntax: boolean;
}

export interface SampleFileItem {
  id: string;
  name: string;
  category: FileCategory;
  mimeType: string;
  description: string;
  createCorruptedBlob: () => Promise<{ corruptedBlob: Blob; originalBlob: Blob; corruptedName: string }>;
}
