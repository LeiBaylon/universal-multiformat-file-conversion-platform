import { getFormatByExtension } from '../shared/formats';
import type { WorkflowCompatibilityIssue, WorkflowOperationTool, WorkflowStep } from '../shared/types';

export interface OperationCatalogEntry {
  tool: WorkflowOperationTool;
  toolLabel: string;
  operationName: string;
  description: string;
  acceptedInputsLabel: string;
  defaultConfig: Record<string, unknown>;
}

export const WORKFLOW_OPERATION_CATALOG: OperationCatalogEntry[] = [
  {
    tool: 'bg-remover',
    toolLabel: 'Background Remover',
    operationName: 'Remove Image Background',
    description: 'Isolate foreground subject with ISNet neural segmentation and optional backdrop.',
    acceptedInputsLabel: 'Raster images (PNG, JPG, WEBP, AVIF, TIFF)',
    defaultConfig: {
      modelPrecision: 'fast',
      outputFormat: 'png',
      backgroundMode: 'transparent',
      backgroundColor: '#ffffff',
      shadowEnabled: false,
      featherRadius: 1,
    },
  },
  {
    tool: 'resize',
    toolLabel: 'Image Transform',
    operationName: 'Resize Image',
    description: 'Scale dimensions to target width and height preserving aspect or cropping to fit.',
    acceptedInputsLabel: 'Raster images (PNG, JPG, WEBP, AVIF, TIFF)',
    defaultConfig: {
      width: 1200,
      height: 1200,
      fit: 'inside',
      maintainAspect: true,
    },
  },
  {
    tool: 'compress',
    toolLabel: 'File Compressor',
    operationName: 'Compress File',
    description: 'Optimize file footprint with goal-based encoding or a target KB budget.',
    acceptedInputsLabel: 'Images, PDFs, audio, video, web assets, archives',
    defaultConfig: {
      goal: 'balanced',
      quality: 80,
      stripMetadata: true,
    },
  },
  {
    tool: 'convert',
    toolLabel: 'Universal Converter',
    operationName: 'Convert Format',
    description: 'Transcode or transform to a compatible output format.',
    acceptedInputsLabel: 'Any supported format category',
    defaultConfig: {
      targetFormat: 'webp',
      quality: 88,
      stripMetadata: true,
    },
  },
  {
    tool: 'archive',
    toolLabel: 'ZIP & Archive Manager',
    operationName: 'Package Into Archive',
    description: 'Bundle processed outputs into a compressed or encrypted container.',
    acceptedInputsLabel: 'All file types',
    defaultConfig: {
      format: 'zip',
      level: 7,
      password: '',
    },
  },
];

const RASTER_INPUTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'tif', 'bmp', 'heic', 'heif', 'svg']);
const ALPHA_CAPABLE_FORMATS = new Set(['png', 'webp', 'avif', 'tiff', 'tif', 'gif', 'ico', 'svg']);
const COMPRESSIBLE_FORMATS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'tif', 'gif', 'pdf',
  'mp4', 'webm', 'mkv', 'mov', 'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus',
  'docx', 'xlsx', 'pptx', 'epub', 'svg', 'css', 'js', 'json', 'html', 'xml',
  'zip', '7z', 'gz', 'tgz', 'bz2', 'xz',
]);

export interface StepFlowPrediction {
  stepId: string;
  inputFormatLabel: string;
  outputFormatLabel: string;
  preservesAlpha: boolean;
}

export interface WorkflowAnalysisResult {
  valid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  issues: WorkflowCompatibilityIssue[];
  predictions: StepFlowPrediction[];
  predictedFinalFormat: string;
}

export function createWorkflowStep(tool: WorkflowOperationTool, idSuffix?: string): WorkflowStep {
  const entry = WORKFLOW_OPERATION_CATALOG.find((c) => c.tool === tool) || WORKFLOW_OPERATION_CATALOG[0];
  return {
    id: `step_${Date.now()}_${idSuffix || Math.random().toString(36).slice(2, 7)}`,
    tool: entry.tool,
    operationName: entry.operationName,
    enabled: true,
    config: { ...entry.defaultConfig },
  };
}

export function moveWorkflowStep(
  steps: WorkflowStep[],
  index: number,
  direction: 'up' | 'down'
): WorkflowStep[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  return reorderWorkflowSteps(steps, index, target);
}

export function reorderWorkflowSteps(
  steps: WorkflowStep[],
  fromIndex: number,
  toIndex: number
): WorkflowStep[] {
  if (fromIndex < 0 || fromIndex >= steps.length || toIndex < 0 || toIndex >= steps.length || fromIndex === toIndex) {
    return steps;
  }
  const next = [...steps];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function analyzeWorkflowCompatibility(
  steps: WorkflowStep[],
  inputExts: string[]
): WorkflowAnalysisResult {
  const normalizedInputs = inputExts.length > 0 ? inputExts.map((e) => e.toLowerCase()) : ['png'];
  let currentFormats = Array.from(new Set(normalizedInputs));
  let hasTransparentSubject = normalizedInputs.some((e) => e === 'png' || e === 'webp' || e === 'svg');
  let insideArchive = false;

  const issues: WorkflowCompatibilityIssue[] = [];
  const predictions: StepFlowPrediction[] = [];

  steps.forEach((step, idx) => {
    const inputLabel = currentFormats.map((f) => f.toUpperCase()).join(' / ');

    if (!step.enabled) {
      predictions.push({
        stepId: step.id,
        inputFormatLabel: inputLabel,
        outputFormatLabel: `${inputLabel} (Skipped)`,
        preservesAlpha: hasTransparentSubject,
      });
      return;
    }

    if (insideArchive && step.tool !== 'archive') {
      issues.push({
        stepIndex: idx,
        stepId: step.id,
        severity: 'error',
        message: `Step ${idx + 1} (${step.operationName}) cannot operate on an already-packaged archive (${inputLabel}).`,
        suggestion: 'Move the Archive step to the end of the sequence or remove this step.',
      });
      predictions.push({
        stepId: step.id,
        inputFormatLabel: inputLabel,
        outputFormatLabel: 'Incompatible',
        preservesAlpha: false,
      });
      return;
    }

    if (step.tool === 'bg-remover') {
      const nonImages = currentFormats.filter((f) => !RASTER_INPUTS.has(f));
      if (nonImages.length > 0) {
        issues.push({
          stepIndex: idx,
          stepId: step.id,
          severity: 'error',
          message: `Background Remover only accepts image files, but receives ${nonImages.map((x) => x.toUpperCase()).join(', ')}.`,
          suggestion: 'Exclude non-image files from the batch or disable Background Remover.',
          suggestedPatch: { disableStep: true },
        });
      }
      const outFmt = step.config.outputFormat === 'webp' ? 'webp' : 'png';
      const bgMode = String(step.config.backgroundMode || 'transparent');
      hasTransparentSubject = bgMode === 'transparent';
      currentFormats = [outFmt];
      predictions.push({
        stepId: step.id,
        inputFormatLabel: inputLabel,
        outputFormatLabel: `${outFmt.toUpperCase()}${hasTransparentSubject ? ' (Alpha)' : ''}`,
        preservesAlpha: hasTransparentSubject,
      });
      return;
    }

    if (step.tool === 'resize') {
      const nonImages = currentFormats.filter((f) => !RASTER_INPUTS.has(f));
      if (nonImages.length > 0) {
        issues.push({
          stepIndex: idx,
          stepId: step.id,
          severity: 'error',
          message: `Resize Image requires raster image input, but receives ${nonImages.map((x) => x.toUpperCase()).join(', ')}.`,
          suggestion: 'Place Resize before converting to PDF/Archive, or filter non-image files.',
        });
      }
      // SVG input gets rasterized to PNG if resized directly
      currentFormats = currentFormats.map((f) => (f === 'svg' ? 'png' : f));
      predictions.push({
        stepId: step.id,
        inputFormatLabel: inputLabel,
        outputFormatLabel: `${currentFormats.map((f) => f.toUpperCase()).join(' / ')} (${Number(step.config.width || 1200)}×${Number(step.config.height || 1200)})`,
        preservesAlpha: hasTransparentSubject,
      });
      return;
    }

    if (step.tool === 'compress') {
      const unsupported = currentFormats.filter((f) => !COMPRESSIBLE_FORMATS.has(f));
      if (unsupported.length > 0) {
        issues.push({
          stepIndex: idx,
          stepId: step.id,
          severity: 'warning',
          message: `Compression has limited or no effect on ${unsupported.map((x) => x.toUpperCase()).join(', ')}.`,
          suggestion: 'Convert to WebP, AVIF, MP4, or ZIP before compressing, or skip this step for raw text.',
        });
      }
      predictions.push({
        stepId: step.id,
        inputFormatLabel: inputLabel,
        outputFormatLabel: `${currentFormats.map((f) => f.toUpperCase()).join(' / ')} (Optimized)`,
        preservesAlpha: hasTransparentSubject,
      });
      return;
    }

    if (step.tool === 'convert') {
      const target = String(step.config.targetFormat || 'webp').toLowerCase();
      if (hasTransparentSubject && !ALPHA_CAPABLE_FORMATS.has(target)) {
        issues.push({
          stepIndex: idx,
          stepId: step.id,
          severity: 'warning',
          message: `Converting a transparent cutout to ${target.toUpperCase()} removes the alpha channel and flattens transparency.`,
          suggestion: 'Switch output format to WEBP or PNG to preserve transparency.',
          suggestedPatch: { config: { ...step.config, targetFormat: 'webp' } },
        });
      }
      for (const src of currentFormats) {
        if (src === target) continue;
        const srcMeta = getFormatByExtension(src);
        if (srcMeta && !srcMeta.compatibleOutputs.includes(target)) {
          const alts = srcMeta.compatibleOutputs.slice(0, 4).map((x) => x.toUpperCase()).join(', ');
          issues.push({
            stepIndex: idx,
            stepId: step.id,
            severity: 'error',
            message: `${src.toUpperCase()} cannot be converted directly to ${target.toUpperCase()}.`,
            suggestion: alts ? `Select a compatible target such as ${alts}.` : 'Use a different input file type.',
            suggestedPatch: srcMeta.compatibleOutputs[0]
              ? { config: { ...step.config, targetFormat: srcMeta.compatibleOutputs[0] } }
              : undefined,
          });
        }
      }
      hasTransparentSubject = hasTransparentSubject && ALPHA_CAPABLE_FORMATS.has(target);
      currentFormats = [target];
      predictions.push({
        stepId: step.id,
        inputFormatLabel: inputLabel,
        outputFormatLabel: `${target.toUpperCase()}${hasTransparentSubject ? ' (Alpha)' : ''}`,
        preservesAlpha: hasTransparentSubject,
      });
      return;
    }

    if (step.tool === 'archive') {
      const arcFmt = String(step.config.format || 'zip').toLowerCase();
      insideArchive = true;
      hasTransparentSubject = false;
      currentFormats = [arcFmt];
      predictions.push({
        stepId: step.id,
        inputFormatLabel: inputLabel,
        outputFormatLabel: `${arcFmt.toUpperCase()} Container`,
        preservesAlpha: false,
      });
    }
  });

  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');
  return {
    valid: !hasErrors,
    hasErrors,
    hasWarnings,
    issues,
    predictions,
    predictedFinalFormat: currentFormats.map((f) => f.toUpperCase()).join(' / '),
  };
}
