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

export type NavView =
  | 'dashboard'
  | 'recent-activity'
  | 'explorer'
  | 'organizer'
  | 'duplicates'
  | 'large-files'
  | 'renamer'
  | 'inspector'
  | 'storage-analyzer'
  | 'cleanup'
  | 'converter'
  | 'bg-remover'
  | 'compressor'
  | 'archive'
  | 'batch'
  | 'presets'
  | 'workflow-builder'
  | 'history'
  | 'settings';

export type ToolKind = 'converter' | 'bg-remover' | 'compressor' | 'archive' | 'workflow';

export type SupportLevel = 'full' | 'partial' | 'unavailable';

export type EngineId =
  | 'imagemagick'
  | 'sharp'
  | 'imgly-isnet'
  | 'ghostscript'
  | 'ffmpeg'
  | 'document-node'
  | 'spreadsheet-node'
  | 'presentation-node'
  | 'ebook-node'
  | 'archive-node'
  | '7zip-bin'
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
  operationKind?: 'conversion' | 'transpilation' | 'archive' | 'extraction' | 'compression' | 'segmentation';
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
  rotate?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  stripMetadata?: boolean;
  removeBackground?: boolean;
  grayscale?: boolean;

  // Audio / Video
  bitrate?: string;
  sampleRate?: number;
  channels?: 1 | 2;
  trimStart?: string;
  trimEnd?: string;
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  fps?: number;
  crf?: number;
  resolution?: string;
  extractAudioOnly?: boolean;
  metaTitle?: string;
  metaArtist?: string;

  // Document / Spreadsheet / Presentation / Ebook
  pageRange?: string;
  pdfPassword?: string;
  compressLevel?: 'low' | 'medium' | 'high';
  sheetName?: string;
  delimiter?: ',' | ';' | '\t' | '|';
  encoding?: 'utf8' | 'utf16le' | 'latin1';
  ebookTitle?: string;
  ebookAuthor?: string;

  // Archive
  archiveCompressionLevel?: number;
  archivePassword?: string;

  // Subtitle
  timeOffsetMs?: number;

  // 3D
  scale?: number;

  // Data & Webdev
  prettyPrint?: boolean;
  minify?: boolean;
}

export type BgBackgroundMode = 'transparent' | 'solid' | 'gradient' | 'blur' | 'custom';

export interface BgRemovalOptions {
  modelPrecision: 'fast' | 'high';
  outputFormat: 'png' | 'webp';
  quality: number;
  featherRadius: number;
  edgeRefinement: number;
  backgroundMode: BgBackgroundMode;
  backgroundColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  backgroundBlurRadius: number;
  customBackgroundToken?: string;
  shadowEnabled: boolean;
  shadowOpacity: number;
  shadowBlur: number;
  subjectScale: number;
  offsetX: number;
  offsetY: number;
  cropAspect: 'original' | '1:1' | '4:3' | '16:9' | '3:4';
  brightness: number;
  contrast: number;
  saturation: number;
  maskOverlayDataUrl?: string;
}

export interface BgRemovalAnalysis {
  foregroundCoveragePct: number;
  semiTransparentEdgePct: number;
  edgeComplexityLabel: 'clean' | 'moderate' | 'intricate';
  subjectLossRisk: 'none' | 'low' | 'elevated';
  qualityScoreLabel: string;
  warnings: string[];
  width: number;
  height: number;
  geminiInsights?: {
    subjectSummary: string;
    difficultEdgesDetected: string[];
    recommendation: string;
  };
}

export type CompressionGoal = 'balanced' | 'smallest' | 'best-quality' | 'lossless' | 'target-size';

export interface CompressionOptions {
  goal: CompressionGoal;
  targetSizeKb?: number;
  quality?: number;
  maxWidth?: number;
  stripMetadata?: boolean;
  preserveDimensions?: boolean;
  videoCodec?: 'libx264' | 'libvpx-vp9';
  videoCrf?: number;
  videoResolution?: string;
  audioBitrate?: string;
  audioSampleRate?: number;
  pdfPreset?: 'screen' | 'ebook' | 'printer' | 'prepress';
  archiveLevel?: number;
}

export interface CompressionStats {
  originalBytes: number;
  outputBytes: number;
  savedBytes: number;
  percentDelta: number;
  durationMs: number;
  strategyUsed: string;
  targetAchieved?: boolean;
}

export interface ArchiveEntryMetadata {
  name: string;
  size: number;
  compressedSize?: number;
  isDirectory: boolean;
  encrypted?: boolean;
  crc?: string;
  modifiedAt?: string;
}

export interface ArchiveInspectReport {
  format: string;
  engine: string;
  fileSizeBytes: number;
  entryCount: number;
  totalUncompressedBytes: number;
  compressionRatioPct: number;
  hasEncryptedEntries: boolean;
  duplicateGroups: { signature: string; names: string[]; size: number }[];
  bombRiskWarning?: string;
  entries: ArchiveEntryMetadata[];
}

export interface ArchiveFormatCapabilityRow {
  ext: string;
  name: string;
  supportLevel: SupportLevel;
  create: boolean;
  extract: boolean;
  inspect: boolean;
  modify: boolean;
  encrypt: boolean;
  split: boolean;
  engine: string;
  notes?: string;
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
  tool?: ToolKind;
  batchId?: string;
  originalName: string;
  sourceExt: string;
  targetExt: string;
  category: FormatCategory | 'ecosystem';
  operationKind: 'conversion' | 'transpilation' | 'archive' | 'extraction' | 'compression' | 'segmentation';
  status: JobStatus;
  progress: number;
  inputSizeBytes: number;
  outputSizeBytes?: number;
  outputName?: string;
  durationMs?: number;
  error?: string;
  engineUsed?: string;
  createdAt: string;
  completedAt?: string;
  options: ConversionOptions | Record<string, unknown>;
  previewKind?: IdentifiedFileMetadata['previewKind'];
  previewUrl?: string;
  downloadUrl?: string;
  details?: Record<string, string | number | boolean | string[]>;
  compressionStats?: CompressionStats;
  qualityMetrics?: BgRemovalAnalysis;
}

// ===========================================================================
// WORKFLOW SEQUENCE BUILDER & EXPANDED PRESETS
// ===========================================================================

export type WorkflowOperationTool = 'bg-remover' | 'resize' | 'compress' | 'convert' | 'archive';

export interface WorkflowStep {
  id: string;
  tool: WorkflowOperationTool;
  operationName: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface WorkflowCompatibilityIssue {
  stepIndex: number;
  stepId: string;
  severity: 'error' | 'warning';
  message: string;
  suggestion: string;
  suggestedPatch?: {
    config?: Record<string, unknown>;
    disableStep?: boolean;
  };
}

export type PresetKind = 'tool' | 'workflow' | 'batch';

export interface PresetOutputRule {
  namingPattern?: string;
  destinationMode?: 'download-queue' | 'workspace-folder';
  destinationFolder?: string;
}

export interface SavedPreset {
  id: string;
  name: string;
  tool: ToolKind;
  kind: PresetKind;
  description: string;
  categoryTag?: string;
  createdAt: string;
  updatedAt?: string;
  lastUsedAt?: string;
  useCount?: number;
  outputRule?: PresetOutputRule;
  batchSettings?: {
    continueOnError?: boolean;
  };
  steps?: WorkflowStep[];
  config: Record<string, unknown>;
}

// ===========================================================================
// FILE MANAGEMENT & STORAGE INTELLIGENCE TYPES
// ===========================================================================

export interface WorkspaceFileEntry {
  relPath: string;
  name: string;
  ext: string;
  category: FormatCategory | 'unknown';
  sizeBytes: number;
  modifiedAt: string;
  isDirectory: boolean;
  sha256?: string;
}

export interface WorkspaceTreeSummary {
  rootLabel: string;
  totalFiles: number;
  totalFolders: number;
  totalBytes: number;
  entries: WorkspaceFileEntry[];
}

export interface DuplicateGroup {
  hash: string;
  sizeBytes: number;
  wastedBytes: number;
  files: WorkspaceFileEntry[];
}

export interface StorageAnalysisReport {
  workspaceBytes: number;
  workspaceFiles: number;
  duplicateWastedBytes: number;
  duplicateGroupCount: number;
  largeFilesBytes: number;
  largeFileCount: number;
  tempUploadBytes: number;
  tempOutputBytes: number;
  tempFileCount: number;
  byCategory: { category: string; files: number; bytes: number; sharePct: number }[];
  topFolders: { folder: string; files: number; bytes: number }[];
}

export interface ActivityEvent {
  id: string;
  kind: 'workflow' | 'batch' | 'organize' | 'cleanup' | 'rename' | 'conversion' | 'preset';
  title: string;
  detail: string;
  timestamp: string;
  status: 'completed' | 'failed' | 'cancelled';
}

export interface UserSettings {
  theme: 'dark' | 'light';
  defaultImageQuality: number;
  defaultVideoCrf: number;
  defaultAudioBitrate: string;
  stripMetadataByDefault: boolean;
  retentionMinutes: number;
  maxUploadMb: number;
  favoritePairs: string[];
  recentFormats: string[];
  defaultOutputFormats?: Record<string, string>;
  defaultNamingPattern?: string;
  defaultDestinationFolder?: string;
}

export interface StorageStats {
  uploadBytes: number;
  outputBytes: number;
  fileCount: number;
  retentionMinutes: number;
  lastCleanupAt: string | null;
}

export interface SystemResourceStats {
  storage: StorageStats;
  activeJobs: number;
  totalJobs: number;
  memoryRssMb: number;
  uptimeSec: number;
  engines: Record<string, boolean>;
}
