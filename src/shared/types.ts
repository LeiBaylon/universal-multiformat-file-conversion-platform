export type FormatCategory =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'audio'
  | 'video'
  | 'ebook'
  | 'archive'
  | 'vector'
  | 'model3d'
  | 'font'
  | 'subtitle'
  | 'data'
  | 'webdev'
  | 'scientific';

export type SupportLevel = 'full' | 'partial' | 'unavailable';

export type EngineId =
  | 'imagemagick'
  | 'ghostscript'
  | 'ffmpeg'
  | 'document-node'
  | 'spreadsheet-node'
  | 'presentation-node'
  | 'ebook-node'
  | 'archive-node'
  | 'vector-node'
  | 'mesh3d-node'
  | 'font-node'
  | 'subtitle-node'
  | 'data-node'
  | 'webdev-node'
  | 'scientific-node'
  | 'external-adapter';

export interface SmartRecommendation {
  format: string;
  badge: string;
  reason: string;
}

export interface FormatDefinition {
  ext: string;
  name: string;
  category: FormatCategory;
  mimeTypes: string[];
  supportLevel: SupportLevel;
  inputSupported: boolean;
  outputSupported: boolean;
  engine: EngineId;
  compatibleOutputs: string[];
  recommendedOutputs: SmartRecommendation[];
  notes?: string;
  operationKind?: 'conversion' | 'transpilation' | 'archive' | 'extraction';
}

export interface CategoryMeta {
  id: FormatCategory;
  label: string;
  shortLabel: string;
  description: string;
  engineSummary: string;
}

export interface ConversionOptions {
  // Image / Vector
  width?: number;
  height?: number;
  maintainAspect?: boolean;
  quality?: number;
  dpi?: number;
  rotate?: number; // 0, 90, 180, 270
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  stripMetadata?: boolean;
  removeBackground?: boolean;
  grayscale?: boolean;

  // Audio / Video
  bitrate?: string; // e.g. '192k', '320k', '2000k'
  sampleRate?: number; // e.g. 44100, 48000
  channels?: 1 | 2;
  trimStart?: string; // HH:MM:SS or seconds
  trimEnd?: string;
  volume?: number; // 1.0 = normal
  fadeInSec?: number;
  fadeOutSec?: number;
  fps?: number;
  crf?: number; // 18-35
  resolution?: string; // e.g. '1920x1080', '1280x720', 'original'
  extractAudioOnly?: boolean;
  metaTitle?: string;
  metaArtist?: string;

  // Document / Spreadsheet / Presentation / Ebook
  pageRange?: string; // e.g. '1-3'
  pdfPassword?: string;
  compressLevel?: 'low' | 'medium' | 'high';
  sheetName?: string;
  delimiter?: ',' | ';' | '\t' | '|';
  encoding?: 'utf8' | 'utf16le' | 'latin1';
  ebookTitle?: string;
  ebookAuthor?: string;

  // Archive
  archiveCompressionLevel?: number; // 1-9
  archivePassword?: string;

  // Subtitle
  timeOffsetMs?: number;

  // 3D
  scale?: number;

  // Data & Webdev
  prettyPrint?: boolean;
  minify?: boolean;
}

export interface IdentifiedFileMetadata {
  originalName: string;
  sizeBytes: number;
  detectedExt: string;
  detectedMime: string;
  magicSignature?: string;
  category: FormatCategory | 'unknown';
  supportLevel: SupportLevel;
  engine: EngineId | 'none';
  compatibleOutputs: string[];
  recommendedOutputs: SmartRecommendation[];
  details: Record<string, string | number | boolean | string[]>;
  previewUrl?: string;
  previewKind?: 'image' | 'audio' | 'video' | 'text' | 'pdf' | 'mesh3d' | 'archive' | 'font' | 'spreadsheet' | 'none';
  previewData?: unknown;
  notes?: string;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ConversionJob {
  id: string;
  batchId?: string;
  originalName: string;
  sourceExt: string;
  targetExt: string;
  category: FormatCategory;
  operationKind: 'conversion' | 'transpilation' | 'archive' | 'extraction';
  status: JobStatus;
  progress: number;
  inputSizeBytes: number;
  outputSizeBytes?: number;
  outputName?: string;
  error?: string;
  engineUsed?: string;
  createdAt: string;
  completedAt?: string;
  options: ConversionOptions;
  previewKind?: IdentifiedFileMetadata['previewKind'];
  previewUrl?: string;
  downloadUrl?: string;
  details?: Record<string, string | number | boolean | string[]>;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  defaultImageQuality: number;
  defaultVideoCrf: number;
  defaultAudioBitrate: string;
  stripMetadataByDefault: boolean;
  retentionMinutes: number;
  maxUploadMb: number;
  favoritePairs: string[]; // e.g. ['png->webp', 'mp4->gif']
  recentFormats: string[];
  defaultOutputFormats?: Record<string, string>;
}

export interface StorageStats {
  uploadBytes: number;
  outputBytes: number;
  fileCount: number;
  retentionMinutes: number;
  lastCleanupAt: string | null;
}
