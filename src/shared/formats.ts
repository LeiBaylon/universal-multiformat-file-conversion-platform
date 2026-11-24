import type { ArchiveFormatCapabilityRow, CategoryMeta, EngineId, FormatCategory, FormatDefinition, SmartRecommendation, SupportLevel } from './types';

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'image',
    label: 'Images',
    shortLabel: 'Images',
    description: 'Raster photography, HDR, RAW camera negatives, icons, and animated frames.',
    engineSummary: 'ImageMagick 6.9 (libheif, libwebp, OpenEXR, OpenJPEG, libtiff)',
  },
  {
    id: 'document',
    label: 'Documents',
    shortLabel: 'Docs',
    description: 'PDF editing, Word documents, Markdown, HTML, RTF, and text extraction.',
    engineSummary: 'PDF-Lib, PDFKit, Ghostscript, Mammoth, Docx',
  },
  {
    id: 'spreadsheet',
    label: 'Spreadsheets',
    shortLabel: 'Sheets',
    description: 'Workbooks, delimited tables, ODS, DIF, SYLK, and tabular PDF exports.',
    engineSummary: 'SheetJS (XLSX), PapaParse, PDFKit',
  },
  {
    id: 'presentation',
    label: 'Presentations',
    shortLabel: 'Slides',
    description: 'Slide decks, PDF slide rendering, image sequences, and outline extraction.',
    engineSummary: 'PptxGenJS, Ghostscript, ADM-Zip XML Parser',
  },
  {
    id: 'audio',
    label: 'Audio',
    shortLabel: 'Audio',
    description: 'Lossless studio masters, compressed streaming codecs, voice, and trimming.',
    engineSummary: 'FFmpeg 4.4 (LAME, FLAC, Opus, Vorbis, AAC, AC3, ALAC)',
  },
  {
    id: 'video',
    label: 'Video',
    shortLabel: 'Video',
    description: 'H.264/HEVC/VP9 transcoding, GIF creation, audio extraction, and thumbnails.',
    engineSummary: 'FFmpeg 4.4 (libx264, libx265, libvpx-vp9, ProRes, Theora)',
  },
  {
    id: 'ebook',
    label: 'Ebooks',
    shortLabel: 'Ebooks',
    description: 'EPUB 3 packaging, chapter extraction, FictionBook, HTML, PDF, and DOCX.',
    engineSummary: 'EPUB 3 Archive Engine, PDFKit, Mammoth',
  },
  {
    id: 'archive',
    label: 'Archives',
    shortLabel: 'Archives',
    description: 'Safe archive extraction, multi-file compression, AES-256 encryption, and container conversion.',
    engineSummary: '7-Zip (7za), Archiver, ADM-Zip, JSZip, Tar, Gzip, Bzip2, XZ, Fzstd',
  },
  {
    id: 'vector',
    label: 'Vector Graphics',
    shortLabel: 'Vector',
    description: 'Scalable SVG optimization, PostScript/EPS, PDF vector paths, and rasterization.',
    engineSummary: 'Ghostscript, SVGO, ImageMagick',
  },
  {
    id: 'model3d',
    label: '3D Models',
    shortLabel: '3D',
    description: 'Polygon mesh conversion, binary GLB/STL encoding, and geometry inspection.',
    engineSummary: 'Pure Mesh Geometry Pipeline (OBJ/STL/PLY/OFF/GLTF/GLB/X3D)',
  },
  {
    id: 'font',
    label: 'Fonts',
    shortLabel: 'Fonts',
    description: 'Webfont transcoding (WOFF/WOFF2/TTF/OTF/EOT) and glyph table inspection.',
    engineSummary: 'FontEditor Core & OpenType.js',
  },
  {
    id: 'subtitle',
    label: 'Subtitles',
    shortLabel: 'Subtitles',
    description: 'Caption format conversion, millisecond time-sync shifting, and cue previews.',
    engineSummary: 'Deterministic Subtitle Cue Parser & Serializer',
  },
  {
    id: 'data',
    label: 'Structured Data',
    shortLabel: 'Data',
    description: 'JSON, YAML, TOML, XML, CSV, INI, NDJSON, and SQL schema generation.',
    engineSummary: 'JS-YAML, Smol-TOML, Fast-XML-Parser, PapaParse, INI',
  },
  {
    id: 'webdev',
    label: 'Web Development',
    shortLabel: 'Web Dev',
    description: 'Source transpilation (SCSS/LESS/TS/TSX/JSX) and asset minification.',
    engineSummary: 'Sass, Less, TypeScript Compiler, Clean-CSS, Terser, SVGO',
  },
  {
    id: 'scientific',
    label: 'Scientific & Bio',
    shortLabel: 'Science',
    description: 'Molecular coordinates (XYZ/MOL/SDF/PDB/CIF) and sequence files (FASTA/FASTQ).',
    engineSummary: 'Molecular & Bioinformatics Parser Pipeline',
  },
];

interface FormatSeed {
  ext: string;
  name: string;
  category: FormatCategory;
  mimes: string[];
  support?: SupportLevel;
  in?: boolean;
  out?: boolean;
  engine?: EngineId;
  notes?: string;
  op?: 'conversion' | 'transpilation' | 'archive' | 'extraction';
}

const RAW_FORMATS: FormatSeed[] = [
  // A. IMAGE CONVERTER
  { ext: 'png', name: 'Portable Network Graphics', category: 'image', mimes: ['image/png'], engine: 'imagemagick' },
  { ext: 'jpg', name: 'JPEG Image', category: 'image', mimes: ['image/jpeg'], engine: 'imagemagick' },
  { ext: 'jpeg', name: 'JPEG Image (Alt)', category: 'image', mimes: ['image/jpeg'], engine: 'imagemagick' },
  { ext: 'webp', name: 'WebP Image', category: 'image', mimes: ['image/webp'], engine: 'imagemagick' },
  { ext: 'avif', name: 'AV1 Image File Format', category: 'image', mimes: ['image/avif'], engine: 'imagemagick' },
  { ext: 'heic', name: 'High Efficiency Image (HEIC)', category: 'image', mimes: ['image/heic'], engine: 'imagemagick' },
  { ext: 'heif', name: 'High Efficiency Image (HEIF)', category: 'image', mimes: ['image/heif'], engine: 'imagemagick' },
  { ext: 'gif', name: 'Graphics Interchange Format', category: 'image', mimes: ['image/gif'], engine: 'imagemagick' },
  { ext: 'bmp', name: 'Windows Bitmap', category: 'image', mimes: ['image/bmp'], engine: 'imagemagick' },
  { ext: 'tiff', name: 'Tagged Image File Format', category: 'image', mimes: ['image/tiff'], engine: 'imagemagick' },
  { ext: 'tif', name: 'Tagged Image File (TIF)', category: 'image', mimes: ['image/tiff'], engine: 'imagemagick' },
  { ext: 'ico', name: 'Microsoft Icon', category: 'image', mimes: ['image/x-icon', 'image/vnd.microsoft.icon'], engine: 'imagemagick' },
  { ext: 'cur', name: 'Microsoft Cursor', category: 'image', mimes: ['image/x-win-bitmap'], engine: 'imagemagick' },
  { ext: 'psd', name: 'Adobe Photoshop Document', category: 'image', mimes: ['image/vnd.adobe.photoshop'], engine: 'imagemagick' },
  { ext: 'jp2', name: 'JPEG 2000', category: 'image', mimes: ['image/jp2'], engine: 'imagemagick' },
  { ext: 'tga', name: 'Truevision TGA', category: 'image', mimes: ['image/x-tga'], engine: 'imagemagick' },
  { ext: 'dds', name: 'DirectDraw Surface', category: 'image', mimes: ['image/vnd-ms.dds'], engine: 'imagemagick' },
  { ext: 'exr', name: 'OpenEXR High Dynamic Range', category: 'image', mimes: ['image/x-exr'], engine: 'imagemagick' },
  { ext: 'hdr', name: 'Radiance RGBE HDR', category: 'image', mimes: ['image/vnd.radiance'], engine: 'imagemagick' },
  { ext: 'ppm', name: 'Portable Pixmap', category: 'image', mimes: ['image/x-portable-pixmap'], engine: 'imagemagick' },
  { ext: 'pgm', name: 'Portable Graymap', category: 'image', mimes: ['image/x-portable-graymap'], engine: 'imagemagick' },
  { ext: 'pbm', name: 'Portable Bitmap', category: 'image', mimes: ['image/x-portable-bitmap'], engine: 'imagemagick' },
  { ext: 'pnm', name: 'Portable Anymap', category: 'image', mimes: ['image/x-portable-anymap'], engine: 'imagemagick' },
  { ext: 'pcx', name: 'ZSoft PCX Paintbrush', category: 'image', mimes: ['image/x-pcx'], engine: 'imagemagick' },
  { ext: 'apng', name: 'Animated PNG', category: 'image', mimes: ['image/apng'], engine: 'imagemagick' },
  { ext: 'jxl', name: 'JPEG XL', category: 'image', mimes: ['image/jxl'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires libjxl delegate (not present in ImageMagick 6.9 container).' },
  { ext: 'xcf', name: 'GIMP Native Image', category: 'image', mimes: ['image/x-xcf'], support: 'partial', in: true, out: false, engine: 'imagemagick', notes: 'Input rasterization supported; native XCF layer export unavailable.' },
  { ext: 'icns', name: 'Apple Icon Image', category: 'image', mimes: ['image/icns'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires libicns / iconutil adapter.' },
  { ext: 'raw', name: 'Camera RAW Image', category: 'image', mimes: ['image/x-dcraw'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires dcraw / LibRaw binary delegate.' },
  { ext: 'cr2', name: 'Canon RAW 2', category: 'image', mimes: ['image/x-canon-cr2'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibRaw / dcraw delegate.' },
  { ext: 'cr3', name: 'Canon RAW 3', category: 'image', mimes: ['image/x-canon-cr3'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibRaw delegate.' },
  { ext: 'nef', name: 'Nikon Electronic Format', category: 'image', mimes: ['image/x-nikon-nef'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibRaw delegate.' },
  { ext: 'arw', name: 'Sony Alpha RAW', category: 'image', mimes: ['image/x-sony-arw'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibRaw delegate.' },
  { ext: 'dng', name: 'Adobe Digital Negative', category: 'image', mimes: ['image/x-adobe-dng'], support: 'partial', in: true, out: false, engine: 'imagemagick', notes: 'TIFF-compatible DNG preview extraction supported via ImageMagick.' },
  { ext: 'orf', name: 'Olympus RAW', category: 'image', mimes: ['image/x-olympus-orf'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibRaw delegate.' },
  { ext: 'raf', name: 'Fujifilm RAW', category: 'image', mimes: ['image/x-fuji-raf'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibRaw delegate.' },
  { ext: 'rw2', name: 'Panasonic RAW', category: 'image', mimes: ['image/x-panasonic-rw2'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibRaw delegate.' },

  // B. DOCUMENT CONVERTER
  { ext: 'pdf', name: 'Portable Document Format', category: 'document', mimes: ['application/pdf'], engine: 'document-node' },
  { ext: 'docx', name: 'Microsoft Word (OOXML)', category: 'document', mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], engine: 'document-node' },
  { ext: 'txt', name: 'Plain Text', category: 'document', mimes: ['text/plain'], engine: 'document-node' },
  { ext: 'md', name: 'Markdown Document', category: 'document', mimes: ['text/markdown'], engine: 'document-node' },
  { ext: 'html', name: 'HTML Document', category: 'document', mimes: ['text/html'], engine: 'document-node' },
  { ext: 'htm', name: 'HTM Document', category: 'document', mimes: ['text/html'], engine: 'document-node' },
  { ext: 'rtf', name: 'Rich Text Format', category: 'document', mimes: ['application/rtf', 'text/rtf'], support: 'partial', in: true, out: true, engine: 'document-node', notes: 'Text & basic structural RTF conversion supported.' },
  { ext: 'odt', name: 'OpenDocument Text', category: 'document', mimes: ['application/vnd.oasis.opendocument.text'], support: 'partial', in: true, out: false, engine: 'document-node', notes: 'ODT XML text extraction supported; complex ODT layout export requires LibreOffice.' },
  { ext: 'docm', name: 'Word Macro-Enabled Document', category: 'document', mimes: ['application/vnd.ms-word.document.macroEnabled.12'], support: 'partial', in: true, out: false, engine: 'document-node', notes: 'Text & HTML extraction supported via OOXML reader.' },
  { ext: 'doc', name: 'Legacy Word 97-2003', category: 'document', mimes: ['application/msword'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Binary OLE2 DOC requires LibreOffice / Antiword.' },
  { ext: 'xps', name: 'XML Paper Specification', category: 'document', mimes: ['application/vnd.ms-xpsdocument'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires GhostXPS / LibreOffice adapter.' },
  { ext: 'oxps', name: 'OpenXPS Document', category: 'document', mimes: ['application/oxps'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires GhostXPS adapter.' },
  { ext: 'pages', name: 'Apple Pages Document', category: 'document', mimes: ['application/vnd.apple.pages'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Proprietary Apple iWork bundle.' },
  { ext: 'wpd', name: 'WordPerfect Document', category: 'document', mimes: ['application/vnd.wordperfect'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires libwpd / LibreOffice.' },
  { ext: 'wps', name: 'WPS Office Writer', category: 'document', mimes: ['application/vnd.ms-works'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibreOffice / WPS converter.' },

  // C. SPREADSHEET CONVERTER
  { ext: 'xlsx', name: 'Excel Workbook (OOXML)', category: 'spreadsheet', mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], engine: 'spreadsheet-node' },
  { ext: 'xls', name: 'Excel 97-2003 Workbook', category: 'spreadsheet', mimes: ['application/vnd.ms-excel'], engine: 'spreadsheet-node' },
  { ext: 'xlsm', name: 'Excel Macro Workbook', category: 'spreadsheet', mimes: ['application/vnd.ms-excel.sheet.macroEnabled.12'], engine: 'spreadsheet-node' },
  { ext: 'xlsb', name: 'Excel Binary Workbook', category: 'spreadsheet', mimes: ['application/vnd.ms-excel.sheet.binary.macroEnabled.12'], support: 'partial', in: true, out: false, engine: 'spreadsheet-node', notes: 'XLSB reading supported via SheetJS; write targets XLSX/ODS/CSV.' },
  { ext: 'ods', name: 'OpenDocument Spreadsheet', category: 'spreadsheet', mimes: ['application/vnd.oasis.opendocument.spreadsheet'], engine: 'spreadsheet-node' },
  { ext: 'fods', name: 'Flat XML OpenDocument Sheet', category: 'spreadsheet', mimes: ['application/vnd.oasis.opendocument.spreadsheet-flat-xml'], engine: 'spreadsheet-node' },
  { ext: 'csv', name: 'Comma-Separated Values', category: 'spreadsheet', mimes: ['text/csv'], engine: 'spreadsheet-node' },
  { ext: 'tsv', name: 'Tab-Separated Values', category: 'spreadsheet', mimes: ['text/tab-separated-values'], engine: 'spreadsheet-node' },
  { ext: 'dif', name: 'Data Interchange Format', category: 'spreadsheet', mimes: ['text/x-dif'], engine: 'spreadsheet-node' },
  { ext: 'sylk', name: 'Symbolic Link (SYLK)', category: 'spreadsheet', mimes: ['text/x-sylk'], engine: 'spreadsheet-node' },
  { ext: 'numbers', name: 'Apple Numbers', category: 'spreadsheet', mimes: ['application/vnd.apple.numbers'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Proprietary Apple iWork binary format.' },

  // D. PRESENTATION CONVERTER
  { ext: 'pptx', name: 'PowerPoint Presentation', category: 'presentation', mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], engine: 'presentation-node' },
  { ext: 'pptm', name: 'PowerPoint Macro Deck', category: 'presentation', mimes: ['application/vnd.ms-powerpoint.presentation.macroEnabled.12'], support: 'partial', in: true, out: false, engine: 'presentation-node', notes: 'Slide text & outline extraction supported.' },
  { ext: 'ppsx', name: 'PowerPoint Slide Show', category: 'presentation', mimes: ['application/vnd.openxmlformats-officedocument.presentationml.slideshow'], support: 'partial', in: true, out: false, engine: 'presentation-node', notes: 'Slide text & outline extraction supported.' },
  { ext: 'ppt', name: 'Legacy PowerPoint 97-2003', category: 'presentation', mimes: ['application/vnd.ms-powerpoint'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Binary PPT requires LibreOffice Impress.' },
  { ext: 'pps', name: 'Legacy PowerPoint Show', category: 'presentation', mimes: ['application/vnd.ms-powerpoint'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Binary PPS requires LibreOffice Impress.' },
  { ext: 'odp', name: 'OpenDocument Presentation', category: 'presentation', mimes: ['application/vnd.oasis.opendocument.presentation'], support: 'partial', in: true, out: false, engine: 'presentation-node', notes: 'ODP XML slide text extraction supported.' },
  { ext: 'key', name: 'Apple Keynote', category: 'presentation', mimes: ['application/vnd.apple.keynote'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Proprietary Apple iWork format.' },

  // E. AUDIO CONVERTER
  { ext: 'mp3', name: 'MPEG Audio Layer III', category: 'audio', mimes: ['audio/mpeg'], engine: 'ffmpeg' },
  { ext: 'wav', name: 'Waveform Audio', category: 'audio', mimes: ['audio/wav', 'audio/x-wav'], engine: 'ffmpeg' },
  { ext: 'flac', name: 'Free Lossless Audio Codec', category: 'audio', mimes: ['audio/flac'], engine: 'ffmpeg' },
  { ext: 'aac', name: 'Advanced Audio Coding', category: 'audio', mimes: ['audio/aac'], engine: 'ffmpeg' },
  { ext: 'm4a', name: 'MPEG-4 Audio', category: 'audio', mimes: ['audio/mp4', 'audio/x-m4a'], engine: 'ffmpeg' },
  { ext: 'ogg', name: 'Ogg Vorbis', category: 'audio', mimes: ['audio/ogg'], engine: 'ffmpeg' },
  { ext: 'opus', name: 'Opus Interactive Audio', category: 'audio', mimes: ['audio/opus'], engine: 'ffmpeg' },
  { ext: 'wma', name: 'Windows Media Audio', category: 'audio', mimes: ['audio/x-ms-wma'], engine: 'ffmpeg' },
  { ext: 'aiff', name: 'Audio Interchange File Format', category: 'audio', mimes: ['audio/aiff', 'audio/x-aiff'], engine: 'ffmpeg' },
  { ext: 'aif', name: 'AIFF Audio (AIF)', category: 'audio', mimes: ['audio/aiff'], engine: 'ffmpeg' },
  { ext: 'alac', name: 'Apple Lossless Audio (M4A)', category: 'audio', mimes: ['audio/mp4'], engine: 'ffmpeg', notes: 'Encodes ALAC stream inside M4A/CAF container.' },
  { ext: 'ac3', name: 'Dolby Digital AC-3', category: 'audio', mimes: ['audio/ac3'], engine: 'ffmpeg' },
  { ext: 'dts', name: 'Digital Theater Systems', category: 'audio', mimes: ['audio/vnd.dts'], support: 'partial', in: true, out: true, engine: 'ffmpeg', notes: 'Experimental DCA encoder enabled via strict flag.' },
  { ext: 'wv', name: 'WavPack Lossless', category: 'audio', mimes: ['audio/x-wavpack'], engine: 'ffmpeg' },
  { ext: 'caf', name: 'Apple Core Audio Format', category: 'audio', mimes: ['audio/x-caf'], engine: 'ffmpeg' },
  { ext: 'au', name: 'Sun/NeXT AU Audio', category: 'audio', mimes: ['audio/basic'], engine: 'ffmpeg' },
  { ext: 'voc', name: 'Creative Voice Audio', category: 'audio', mimes: ['audio/x-voc'], engine: 'ffmpeg' },
  { ext: 'mp2', name: 'MPEG Audio Layer II', category: 'audio', mimes: ['audio/mpeg'], engine: 'ffmpeg' },
  { ext: 'gsm', name: 'GSM Telephony Audio', category: 'audio', mimes: ['audio/x-gsm'], engine: 'ffmpeg' },
  { ext: 'spx', name: 'Ogg Speex Speech', category: 'audio', mimes: ['audio/ogg'], engine: 'ffmpeg' },
  { ext: 'amr', name: 'Adaptive Multi-Rate', category: 'audio', mimes: ['audio/amr'], support: 'partial', in: true, out: false, engine: 'ffmpeg', notes: 'AMR decoding supported; AMR-NB encoding requires libopencore-amrnb.' },
  { ext: 'ape', name: "Monkey's Audio", category: 'audio', mimes: ['audio/ape'], support: 'partial', in: true, out: false, engine: 'ffmpeg', notes: 'Lossless APE decoding supported; output encodes to FLAC/WAV/WV.' },
  { ext: 'mid', name: 'MIDI Sequence', category: 'audio', mimes: ['audio/midi'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Symbolic MIDI synthesis requires TiMidity++ / FluidSynth soundfont.' },
  { ext: 'midi', name: 'MIDI Sequence (Alt)', category: 'audio', mimes: ['audio/midi'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires FluidSynth / TiMidity++.' },

  // F. VIDEO CONVERTER
  { ext: 'mp4', name: 'MPEG-4 Video (H.264)', category: 'video', mimes: ['video/mp4'], engine: 'ffmpeg' },
  { ext: 'mkv', name: 'Matroska Video', category: 'video', mimes: ['video/x-matroska'], engine: 'ffmpeg' },
  { ext: 'mov', name: 'Apple QuickTime Movie', category: 'video', mimes: ['video/quicktime'], engine: 'ffmpeg' },
  { ext: 'avi', name: 'Audio Video Interleave', category: 'video', mimes: ['video/x-msvideo'], engine: 'ffmpeg' },
  { ext: 'wmv', name: 'Windows Media Video', category: 'video', mimes: ['video/x-ms-wmv'], engine: 'ffmpeg' },
  { ext: 'flv', name: 'Flash Video', category: 'video', mimes: ['video/x-flv'], engine: 'ffmpeg' },
  { ext: 'webm', name: 'WebM VP9/Opus Video', category: 'video', mimes: ['video/webm'], engine: 'ffmpeg' },
  { ext: 'm4v', name: 'Apple MPEG-4 Video', category: 'video', mimes: ['video/x-m4v'], engine: 'ffmpeg' },
  { ext: 'mpeg', name: 'MPEG-1/2 Program Stream', category: 'video', mimes: ['video/mpeg'], engine: 'ffmpeg' },
  { ext: 'mpg', name: 'MPEG Video (MPG)', category: 'video', mimes: ['video/mpeg'], engine: 'ffmpeg' },
  { ext: 'mts', name: 'AVCHD Transport Stream', category: 'video', mimes: ['video/mp2t'], engine: 'ffmpeg' },
  { ext: 'm2ts', name: 'Blu-ray BDAV Stream', category: 'video', mimes: ['video/mp2t'], engine: 'ffmpeg' },
  { ext: 'ts', name: 'MPEG Transport Stream', category: 'video', mimes: ['video/mp2t'], engine: 'ffmpeg' },
  { ext: 'vob', name: 'DVD Video Object', category: 'video', mimes: ['video/dvd'], engine: 'ffmpeg' },
  { ext: '3gp', name: '3GPP Mobile Video', category: 'video', mimes: ['video/3gpp'], engine: 'ffmpeg' },
  { ext: '3g2', name: '3GPP2 Mobile Video', category: 'video', mimes: ['video/3gpp2'], engine: 'ffmpeg' },
  { ext: 'asf', name: 'Advanced Systems Format', category: 'video', mimes: ['video/x-ms-asf'], engine: 'ffmpeg' },
  { ext: 'ogv', name: 'Ogg Theora Video', category: 'video', mimes: ['video/ogg'], engine: 'ffmpeg' },
  { ext: 'dv', name: 'Digital Video Stream', category: 'video', mimes: ['video/x-dv'], engine: 'ffmpeg' },
  { ext: 'rm', name: 'RealMedia Video', category: 'video', mimes: ['application/vnd.rn-realmedia'], support: 'partial', in: true, out: false, engine: 'ffmpeg', notes: 'RealMedia demuxing supported; output targets MP4/MKV/WEBM.' },
  { ext: 'rmvb', name: 'RealMedia Variable Bitrate', category: 'video', mimes: ['application/vnd.rn-realmedia-vbr'], support: 'partial', in: true, out: false, engine: 'ffmpeg', notes: 'RealMedia demuxing supported; output targets MP4/MKV/WEBM.' },

  // G. EBOOK CONVERTER
  { ext: 'epub', name: 'Electronic Publication (EPUB 3)', category: 'ebook', mimes: ['application/epub+zip'], engine: 'ebook-node' },
  { ext: 'fb2', name: 'FictionBook 2.0 XML', category: 'ebook', mimes: ['application/x-fictionbook+xml'], engine: 'ebook-node' },
  { ext: 'mobi', name: 'Mobipocket Ebook', category: 'ebook', mimes: ['application/x-mobipocket-ebook'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Calibre (ebook-convert) or Kindlegen.' },
  { ext: 'azw', name: 'Amazon Kindle AZW', category: 'ebook', mimes: ['application/vnd.amazon.ebook'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Calibre ebook-convert.' },
  { ext: 'azw3', name: 'Amazon Kindle KF8', category: 'ebook', mimes: ['application/vnd.amazon.mobi8-ebook'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Calibre ebook-convert.' },
  { ext: 'lit', name: 'Microsoft Reader LIT', category: 'ebook', mimes: ['application/x-ms-reader'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Calibre ebook-convert.' },
  { ext: 'lrf', name: 'Sony Portable Reader', category: 'ebook', mimes: ['application/x-sony-bbeb'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Calibre ebook-convert.' },
  { ext: 'pdb', name: 'PalmDOC Ebook', category: 'ebook', mimes: ['application/vnd.palm'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Calibre ebook-convert.' },
  { ext: 'tcr', name: 'Psion Text Compressed', category: 'ebook', mimes: ['application/x-tcr'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Calibre ebook-convert.' },

  // H. ARCHIVE CONVERTER
  { ext: 'zip', name: 'ZIP Archive', category: 'archive', mimes: ['application/zip'], engine: 'archive-node', op: 'archive', notes: 'Full creation, extraction, encryption (AES-256), editing, and volume splitting.' },
  { ext: '7z', name: '7-Zip Archive', category: 'archive', mimes: ['application/x-7z-compressed'], engine: '7zip-bin', op: 'archive', notes: 'Full creation, LZMA2/PPMd compression, AES-256 encryption, entry editing, and splitting via 7za.' },
  { ext: 'tar', name: 'POSIX Tape Archive', category: 'archive', mimes: ['application/x-tar'], engine: 'archive-node', op: 'archive' },
  { ext: 'gz', name: 'Gzip Compressed Archive', category: 'archive', mimes: ['application/gzip'], engine: 'archive-node', op: 'archive' },
  { ext: 'tgz', name: 'Gzipped Tarball', category: 'archive', mimes: ['application/gzip'], engine: 'archive-node', op: 'archive' },
  { ext: 'bz2', name: 'Bzip2 Tar Archive', category: 'archive', mimes: ['application/x-bzip2'], engine: 'archive-node', op: 'archive' },
  { ext: 'xz', name: 'XZ / LZMA2 Tar Archive', category: 'archive', mimes: ['application/x-xz'], engine: 'archive-node', op: 'archive' },
  { ext: 'lzma', name: 'LZMA Stream', category: 'archive', mimes: ['application/x-lzma'], support: 'partial', in: true, out: true, engine: '7zip-bin', op: 'archive', notes: 'Handled via 7za/xz LZMA compressor.' },
  { ext: 'zst', name: 'Zstandard Archive', category: 'archive', mimes: ['application/zstd'], support: 'partial', in: true, out: false, engine: 'archive-node', op: 'extraction', notes: 'Decompression & tar.zst inspection supported via fzstd; native zstd creation requires zstd CLI.' },
  { ext: 'cab', name: 'Microsoft Cabinet', category: 'archive', mimes: ['application/vnd.ms-cab-compressed'], support: 'partial', in: true, out: false, engine: '7zip-bin', op: 'extraction', notes: 'Inspection, integrity testing, and extraction supported via 7za; CAB creation is read-only.' },
  { ext: 'deb', name: 'Debian Package', category: 'archive', mimes: ['application/vnd.debian.binary-package'], support: 'partial', in: true, out: false, engine: 'archive-node', op: 'extraction', notes: 'Package inspection & safe data extraction supported via dpkg-deb / ar.' },
  { ext: 'rar', name: 'RAR Archive', category: 'archive', mimes: ['application/vnd.rar'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Proprietary RAR codec requires unrar / p7zip-rar adapter.' },
  { ext: 'iso', name: 'ISO 9660 Disc Image', category: 'archive', mimes: ['application/x-iso9660-image'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires full 7zz / xorriso ISO9660 handler.' },
  { ext: 'arj', name: 'ARJ Archive', category: 'archive', mimes: ['application/x-arj'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires arj / p7zip-full handler.' },
  { ext: 'lzh', name: 'LZH Archive', category: 'archive', mimes: ['application/x-lzh-compressed'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires lhasa / p7zip-full handler.' },
  { ext: 'cpio', name: 'CPIO Archive', category: 'archive', mimes: ['application/x-cpio'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires GNU cpio.' },
  { ext: 'rpm', name: 'RPM Package', category: 'archive', mimes: ['application/x-rpm'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires rpm2cpio.' },

  // I. VECTOR GRAPHICS CONVERTER
  { ext: 'svg', name: 'Scalable Vector Graphics', category: 'vector', mimes: ['image/svg+xml'], engine: 'vector-node' },
  { ext: 'eps', name: 'Encapsulated PostScript', category: 'vector', mimes: ['application/postscript'], engine: 'ghostscript' },
  { ext: 'ps', name: 'PostScript Vector', category: 'vector', mimes: ['application/postscript'], engine: 'ghostscript' },
  { ext: 'ai', name: 'Adobe Illustrator (PDF-based)', category: 'vector', mimes: ['application/illustrator'], support: 'partial', in: true, out: false, engine: 'ghostscript', notes: 'PDF-compatible AI files rasterize via Ghostscript.' },
  { ext: 'wmf', name: 'Windows Metafile', category: 'vector', mimes: ['image/wmf'], support: 'partial', in: true, out: false, engine: 'imagemagick', notes: 'WMF rasterization via ImageMagick libwmf delegate.' },
  { ext: 'emf', name: 'Enhanced Metafile', category: 'vector', mimes: ['image/emf'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Inkscape / LibreOffice.' },
  { ext: 'dxf', name: 'AutoCAD Drawing Exchange', category: 'vector', mimes: ['image/vnd.dxf'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires LibreCAD / Inkscape DXF bridge.' },
  { ext: 'cgm', name: 'Computer Graphics Metafile', category: 'vector', mimes: ['image/cgm'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires RALCGM / UniConvertor.' },
  { ext: 'cdr', name: 'CorelDRAW Vector', category: 'vector', mimes: ['application/cdr'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires libcdr / Inkscape.' },

  // J. 3D MODEL CONVERTER
  { ext: 'obj', name: 'Wavefront OBJ Mesh', category: 'model3d', mimes: ['model/obj', 'text/plain'], engine: 'mesh3d-node' },
  { ext: 'stl', name: 'Stereolithography (ASCII/Bin)', category: 'model3d', mimes: ['model/stl'], engine: 'mesh3d-node' },
  { ext: 'ply', name: 'Polygon File Format', category: 'model3d', mimes: ['model/ply'], engine: 'mesh3d-node' },
  { ext: 'off', name: 'Object File Format', category: 'model3d', mimes: ['model/off'], engine: 'mesh3d-node' },
  { ext: 'gltf', name: 'GL Transmission Format (JSON)', category: 'model3d', mimes: ['model/gltf+json'], engine: 'mesh3d-node' },
  { ext: 'glb', name: 'GL Transmission Binary', category: 'model3d', mimes: ['model/gltf-binary'], engine: 'mesh3d-node' },
  { ext: 'x3d', name: 'Extensible 3D XML', category: 'model3d', mimes: ['model/x3d+xml'], engine: 'mesh3d-node' },
  { ext: 'wrl', name: 'VRML 2.0 World', category: 'model3d', mimes: ['model/vrml'], engine: 'mesh3d-node' },
  { ext: 'fbx', name: 'Autodesk FBX', category: 'model3d', mimes: ['application/octet-stream'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Assimp / FBX SDK.' },
  { ext: '3ds', name: '3D Studio Max Mesh', category: 'model3d', mimes: ['application/x-3ds'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Assimp.' },
  { ext: 'dae', name: 'COLLADA Digital Asset', category: 'model3d', mimes: ['model/vnd.collada+xml'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Assimp.' },
  { ext: 'usd', name: 'Universal Scene Description', category: 'model3d', mimes: ['model/vnd.usd'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires OpenUSD toolkit.' },
  { ext: 'usdz', name: 'Apple AR USDZ Archive', category: 'model3d', mimes: ['model/vnd.usdz+zip'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires OpenUSD / RealityConverter.' },
  { ext: 'step', name: 'STEP CAD Exchange', category: 'model3d', mimes: ['model/step'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires OpenCASCADE.' },
  { ext: 'stp', name: 'STEP CAD (STP)', category: 'model3d', mimes: ['model/step'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires OpenCASCADE.' },
  { ext: 'iges', name: 'IGES CAD Exchange', category: 'model3d', mimes: ['model/iges'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires OpenCASCADE.' },
  { ext: 'igs', name: 'IGES CAD (IGS)', category: 'model3d', mimes: ['model/iges'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires OpenCASCADE.' },
  { ext: 'blend', name: 'Blender Project', category: 'model3d', mimes: ['application/x-blender'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires Blender headless CLI.' },

  // K. FONT CONVERTER
  { ext: 'ttf', name: 'TrueType Font', category: 'font', mimes: ['font/ttf'], engine: 'font-node' },
  { ext: 'otf', name: 'OpenType Font', category: 'font', mimes: ['font/otf'], engine: 'font-node' },
  { ext: 'woff', name: 'Web Open Font Format', category: 'font', mimes: ['font/woff'], engine: 'font-node' },
  { ext: 'woff2', name: 'Web Open Font Format 2', category: 'font', mimes: ['font/woff2'], engine: 'font-node' },
  { ext: 'eot', name: 'Embedded OpenType', category: 'font', mimes: ['application/vnd.ms-fontobject'], engine: 'font-node' },
  { ext: 'ttc', name: 'TrueType Collection', category: 'font', mimes: ['font/collection'], support: 'partial', in: true, out: false, engine: 'font-node', notes: 'Extracts primary font face from TTC collection.' },
  { ext: 'pfa', name: 'PostScript Type 1 ASCII', category: 'font', mimes: ['application/x-font-type1'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires FontForge.' },
  { ext: 'pfb', name: 'PostScript Type 1 Binary', category: 'font', mimes: ['application/x-font-type1'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires FontForge.' },
  { ext: 'fon', name: 'Windows Bitmap Font', category: 'font', mimes: ['application/x-font-dos'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires FontForge.' },
  { ext: 'sfd', name: 'FontForge Spline Database', category: 'font', mimes: ['application/vnd.font-fontforge-sfd'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires FontForge.' },

  // L. SUBTITLE CONVERTER
  { ext: 'srt', name: 'SubRip Subtitle', category: 'subtitle', mimes: ['application/x-subrip', 'text/plain'], engine: 'subtitle-node' },
  { ext: 'vtt', name: 'WebVTT Captions', category: 'subtitle', mimes: ['text/vtt'], engine: 'subtitle-node' },
  { ext: 'ass', name: 'Advanced SubStation Alpha', category: 'subtitle', mimes: ['text/x-ssa'], engine: 'subtitle-node' },
  { ext: 'ssa', name: 'SubStation Alpha', category: 'subtitle', mimes: ['text/x-ssa'], engine: 'subtitle-node' },
  { ext: 'sub', name: 'MicroDVD SUB', category: 'subtitle', mimes: ['text/plain'], engine: 'subtitle-node' },
  { ext: 'sbv', name: 'YouTube SubViewer', category: 'subtitle', mimes: ['text/plain'], engine: 'subtitle-node' },
  { ext: 'ttml', name: 'Timed Text Markup (TTML)', category: 'subtitle', mimes: ['application/ttml+xml'], engine: 'subtitle-node' },
  { ext: 'dfxp', name: 'Distribution Format Exchange Profile', category: 'subtitle', mimes: ['application/ttaf+xml'], engine: 'subtitle-node' },
  { ext: 'stl', name: 'EBU-STL Broadcast Subtitles', category: 'subtitle', mimes: ['application/octet-stream'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Binary EBU-STL requires specialized broadcast subtitle bridge.' },

  // M. DATA FORMAT CONVERTER
  { ext: 'json', name: 'JavaScript Object Notation', category: 'data', mimes: ['application/json'], engine: 'data-node' },
  { ext: 'xml', name: 'Extensible Markup Language', category: 'data', mimes: ['application/xml', 'text/xml'], engine: 'data-node' },
  { ext: 'yaml', name: 'YAML Ain’t Markup Language', category: 'data', mimes: ['application/x-yaml', 'text/yaml'], engine: 'data-node' },
  { ext: 'yml', name: 'YAML (YML)', category: 'data', mimes: ['application/x-yaml'], engine: 'data-node' },
  { ext: 'toml', name: 'Tom’s Obvious Minimal Language', category: 'data', mimes: ['application/toml'], engine: 'data-node' },
  { ext: 'ini', name: 'INI Configuration', category: 'data', mimes: ['text/plain'], engine: 'data-node' },
  { ext: 'properties', name: 'Java Properties', category: 'data', mimes: ['text/x-java-properties'], engine: 'data-node' },
  { ext: 'ndjson', name: 'Newline Delimited JSON', category: 'data', mimes: ['application/x-ndjson'], engine: 'data-node' },
  { ext: 'sql', name: 'SQL Insert Script', category: 'data', mimes: ['application/sql'], engine: 'data-node', notes: 'Exports structured rows as parameterized SQL INSERT statements.' },
  { ext: 'bson', name: 'Binary JSON', category: 'data', mimes: ['application/bson'], support: 'unavailable', in: false, out: false, engine: 'external-adapter', notes: 'Requires bson native serializer.' },

  // N. WEB DEVELOPMENT FILE CONVERTER (Explicitly separates transpilation vs conversion)
  { ext: 'css', name: 'Cascading Style Sheets', category: 'webdev', mimes: ['text/css'], engine: 'webdev-node', op: 'transpilation' },
  { ext: 'scss', name: 'Sassy CSS (SCSS)', category: 'webdev', mimes: ['text/x-scss'], engine: 'webdev-node', op: 'transpilation', notes: 'Source compilation to CSS (transpilation, not format conversion).' },
  { ext: 'sass', name: 'Sass Indented Syntax', category: 'webdev', mimes: ['text/x-sass'], engine: 'webdev-node', op: 'transpilation', notes: 'Source compilation to CSS (transpilation).' },
  { ext: 'less', name: 'Less Stylesheet', category: 'webdev', mimes: ['text/x-less'], engine: 'webdev-node', op: 'transpilation', notes: 'Source compilation to CSS (transpilation).' },
  { ext: 'js', name: 'JavaScript Module', category: 'webdev', mimes: ['application/javascript', 'text/javascript'], engine: 'webdev-node', op: 'transpilation' },
  { ext: 'ts', name: 'TypeScript Source', category: 'webdev', mimes: ['application/typescript'], engine: 'webdev-node', op: 'transpilation', notes: 'TypeScript compilation to JavaScript (transpilation).' },
  { ext: 'jsx', name: 'React JSX Source', category: 'webdev', mimes: ['text/jsx'], engine: 'webdev-node', op: 'transpilation', notes: 'JSX transformation to standard JavaScript.' },
  { ext: 'tsx', name: 'React TypeScript JSX', category: 'webdev', mimes: ['text/tsx'], engine: 'webdev-node', op: 'transpilation', notes: 'TSX compilation to standard JavaScript.' },
  { ext: 'mdx', name: 'Markdown + JSX', category: 'webdev', mimes: ['text/mdx'], support: 'partial', in: true, out: false, engine: 'webdev-node', op: 'transpilation', notes: 'Compiles MDX markdown sections to HTML/MD.' },

  // O. SCIENTIFIC & SPECIALIZED CONVERTER
  { ext: 'xyz', name: 'XYZ Molecular Coordinates', category: 'scientific', mimes: ['chemical/x-xyz'], engine: 'scientific-node' },
  { ext: 'mol', name: 'MDL Molfile Structure', category: 'scientific', mimes: ['chemical/x-mdl-molfile'], engine: 'scientific-node' },
  { ext: 'sdf', name: 'Structure Data File (SDF)', category: 'scientific', mimes: ['chemical/x-mdl-sdfile'], engine: 'scientific-node' },
  { ext: 'cif', name: 'Crystallographic Information File', category: 'scientific', mimes: ['chemical/x-cif'], engine: 'scientific-node' },
  { ext: 'fasta', name: 'FASTA Sequence Alignment', category: 'scientific', mimes: ['text/x-fasta'], engine: 'scientific-node' },
  { ext: 'fastq', name: 'FASTQ Sequence + Quality', category: 'scientific', mimes: ['text/x-fastq'], engine: 'scientific-node' },
];

const ALL_FORMATS_RAW = new Map<string, FormatSeed>();
for (const f of RAW_FORMATS) {
  ALL_FORMATS_RAW.set(f.ext, f);
}

function computeCompatibleOutputs(seed: FormatSeed): string[] {
  if (seed.in === false || seed.support === 'unavailable') return [];

  const ext = seed.ext;
  switch (seed.category) {
    case 'image':
      return RAW_FORMATS.filter(
        (t) =>
          (t.category === 'image' && t.out !== false && t.support !== 'unavailable' && t.ext !== ext) ||
          t.ext === 'pdf'
      ).map((t) => t.ext);

    case 'vector':
      if (ext === 'svg') {
        return ['png', 'jpg', 'webp', 'avif', 'tiff', 'ico', 'pdf', 'eps', 'ps', 'svg'];
      }
      if (ext === 'eps' || ext === 'ps' || ext === 'ai') {
        return ['pdf', 'png', 'jpg', 'webp', 'tiff', 'svg'];
      }
      if (ext === 'wmf') {
        return ['png', 'jpg', 'webp', 'pdf'];
      }
      return [];

    case 'document':
      if (ext === 'pdf') return ['txt', 'png', 'jpg', 'webp', 'tiff', 'html', 'md', 'docx', 'eps', 'svg', 'pdf'];
      if (ext === 'docx' || ext === 'docm' || ext === 'odt' || ext === 'rtf') {
        return ['pdf', 'html', 'md', 'txt', 'docx', 'epub'];
      }
      if (ext === 'md' || ext === 'html' || ext === 'htm' || ext === 'txt') {
        return ['pdf', 'docx', 'html', 'md', 'txt', 'epub', 'pptx'].filter((x) => x !== ext);
      }
      return [];

    case 'spreadsheet':
      return ['xlsx', 'xls', 'xlsm', 'ods', 'fods', 'csv', 'tsv', 'dif', 'sylk', 'json', 'yaml', 'xml', 'html', 'pdf', 'sql'].filter(
        (x) => x !== ext
      );

    case 'presentation':
      if (ext === 'pptx') return ['pdf', 'html', 'md', 'txt', 'json'];
      return ['html', 'md', 'txt', 'json'];

    case 'audio':
      return RAW_FORMATS.filter(
        (t) => t.category === 'audio' && t.out !== false && t.support !== 'unavailable' && t.ext !== ext
      ).map((t) => t.ext);

    case 'video': {
      const videoOuts = RAW_FORMATS.filter(
        (t) => t.category === 'video' && t.out !== false && t.support !== 'unavailable' && t.ext !== ext
      ).map((t) => t.ext);
      return [...videoOuts, 'gif', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'opus', 'png', 'jpg'];
    }

    case 'ebook':
      if (ext === 'epub') return ['pdf', 'html', 'md', 'txt', 'docx', 'fb2', 'json'];
      if (ext === 'fb2') return ['epub', 'pdf', 'html', 'md', 'txt', 'docx'];
      return [];

    case 'archive':
      return ['zip', '7z', 'tar', 'tgz', 'gz', 'bz2', 'xz'].filter((x) => x !== ext);

    case 'model3d':
      return ['obj', 'stl', 'ply', 'off', 'gltf', 'glb', 'x3d', 'wrl'].filter((x) => x !== ext);

    case 'font':
      return ['ttf', 'otf', 'woff', 'woff2', 'eot', 'svg'].filter((x) => x !== ext);

    case 'subtitle':
      return ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv', 'ttml', 'dfxp'].filter((x) => x !== ext);

    case 'data':
      return ['json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv', 'ini', 'properties', 'ndjson', 'sql', 'xlsx'].filter(
        (x) => x !== ext
      );

    case 'webdev':
      if (ext === 'scss' || ext === 'sass' || ext === 'less') return ['css'];
      if (ext === 'css') return ['css']; // minify/format
      if (ext === 'ts' || ext === 'tsx' || ext === 'jsx') return ['js'];
      if (ext === 'js') return ['js']; // minify
      if (ext === 'mdx') return ['html', 'md'];
      return [];

    case 'scientific':
      if (['xyz', 'mol', 'sdf', 'cif'].includes(ext)) {
        return ['xyz', 'mol', 'sdf', 'cif', 'json'].filter((x) => x !== ext);
      }
      if (['fasta', 'fastq'].includes(ext)) {
        return ['fasta', 'fastq', 'json', 'csv'].filter((x) => x !== ext);
      }
      return [];
  }
}

function computeRecommendations(seed: FormatSeed, compatible: string[]): SmartRecommendation[] {
  const recs: SmartRecommendation[] = [];
  const add = (format: string, badge: string, reason: string) => {
    if (compatible.includes(format)) {
      recs.push({ format, badge, reason });
    }
  };

  switch (seed.category) {
    case 'image':
      if (seed.ext === 'png') {
        add('webp', 'Web Optimized', 'Preserves transparency at ~30-60% smaller file size.');
        add('avif', 'Smallest Size', 'Next-gen AV1 compression with alpha channel support.');
        add('jpg', 'Universal', 'Ideal for photography where file size matters over alpha.');
        add('pdf', 'Print Ready', 'Wraps image into a portable vector-framed document.');
      } else if (seed.ext === 'heic' || seed.ext === 'heif') {
        add('jpg', 'Max Compatibility', 'Opens natively on every desktop, browser, and legacy app.');
        add('png', 'Lossless', 'Zero generational compression loss for editing.');
        add('webp', 'Modern Web', 'Compact high-quality web format.');
      } else {
        add('webp', 'Web Standard', 'Superior size-to-quality ratio for modern browsers.');
        add('png', 'Lossless', 'Exact pixel preservation with alpha transparency.');
        add('avif', 'Next-Gen', 'Maximum compression efficiency for high-res assets.');
      }
      break;
    case 'document':
      if (seed.ext === 'pdf') {
        add('docx', 'Editable', 'Extracts structured text into an editable Word document.');
        add('png', 'Slide Render', 'Renders crisp raster pages via Ghostscript.');
        add('txt', 'Plain Text', 'Extracts clean UTF-8 text content.');
      } else {
        add('pdf', 'Universal Share', 'Locks layout and typography across all devices.');
        add('docx', 'Word Standard', 'Standard editable office document.');
        add('html', 'Web Ready', 'Clean semantic HTML markup.');
      }
      break;
    case 'spreadsheet':
      add('xlsx', 'Excel Standard', 'Multi-sheet workbook compatible with Excel & Google Sheets.');
      add('csv', 'Universal Data', 'Lightweight flat table for scripts and databases.');
      add('json', 'API Ready', 'Structured array of row objects for web apps.');
      add('pdf', 'Report Export', 'Formatted tabular snapshot for sharing.');
      break;
    case 'presentation':
      add('pdf', 'Print & Share', 'Portable slide handout.');
      add('html', 'Web Deck', 'Self-contained browser slide summary.');
      add('md', 'Outline', 'Clean Markdown slide notes.');
      break;
    case 'audio':
      add('mp3', 'Universal', 'Plays on every hardware device and media player.');
      add('flac', 'Lossless Master', 'Bit-perfect archival audio at ~50% WAV size.');
      add('opus', 'Best Efficiency', 'Superior clarity at low bitrates for voice and streaming.');
      add('wav', 'Uncompressed PCM', 'Studio-grade editing standard.');
      break;
    case 'video':
      add('mp4', 'Universal H.264', 'Maximum compatibility across web, iOS, and desktop.');
      add('webm', 'Web VP9', 'Open web format optimized for browser streaming.');
      add('gif', 'Animated Loop', 'Shareable looping clip with palette optimization.');
      add('mp3', 'Extract Audio', 'Strips video track and saves clean audio.');
      break;
    case 'ebook':
      add('epub', 'Standard Ebook', 'Open reflowable format for Apple Books, Kobo, and web.');
      add('pdf', 'Fixed Layout', 'Printable document layout.');
      add('html', 'Web Reader', 'Single-file readable HTML edition.');
      break;
    case 'archive':
      add('zip', 'Universal', 'Supported natively by macOS, Windows, and Linux.');
      add('7z', 'Ultra LZMA2', 'High-ratio compression with optional AES-256 header encryption.');
      add('tgz', 'Unix Compact', 'Gzipped tarball ideal for servers and source trees.');
      add('xz', 'Max Ratio', 'LZMA2 compression for smallest archive footprint.');
      break;
    case 'vector':
      add('svg', 'Optimized Vector', 'Crisp infinite scaling and SVGO path cleanup.');
      add('png', 'Raster Export', 'High-DPI transparent bitmap for apps and social.');
      add('pdf', 'Print Vector', 'Preserves sharp curves for print workflows.');
      break;
    case 'model3d':
      add('glb', 'Web & AR Ready', 'Compact binary glTF 2.0 with embedded buffers.');
      add('stl', '3D Printing', 'Standard manifold format for slicers and CAD.');
      add('obj', 'Universal Mesh', 'Human-readable geometry supported by every 3D suite.');
      break;
    case 'font':
      add('woff2', 'Web Standard', 'Brotli-compressed webfont (~30% smaller than WOFF).');
      add('ttf', 'Desktop Install', 'Universal system font for macOS and Windows.');
      add('otf', 'Print & Pro', 'OpenType outlines for desktop publishing.');
      break;
    case 'subtitle':
      add('vtt', 'HTML5 WebVTT', 'Native browser `<track>` caption format.');
      add('srt', 'Universal SubRip', 'Supported by VLC, FFmpeg, YouTube, and Plex.');
      add('ass', 'Styled Captions', 'Supports positioning, fonts, and karaoke effects.');
      break;
    case 'data':
      add('json', 'Web & API', 'Universal structured interchange format.');
      add('yaml', 'Config Readable', 'Clean indentation-based format for DevOps.');
      add('csv', 'Spreadsheet Ready', 'Tabular export for Excel and analytics.');
      break;
    case 'webdev':
      if (['scss', 'sass', 'less'].includes(seed.ext)) {
        add('css', 'Compile Stylesheet', 'Transpiles variables, nesting, and mixins into standard CSS.');
      } else if (['ts', 'tsx', 'jsx'].includes(seed.ext)) {
        add('js', 'Transpile Module', 'Strips types/JSX into browser-ready JavaScript.');
      } else {
        add('css', 'Minify Asset', 'Compresses whitespace and optimizes rules.');
      }
      break;
    case 'scientific':
      if (['xyz', 'mol', 'sdf', 'cif'].includes(seed.ext)) {
        add('mol', 'CTAB Molfile', 'Standard 2D/3D bond and atom connection table.');
        add('xyz', 'Cartesian Coords', 'Minimal atomic coordinate table.');
        add('json', 'Structured Atom Graph', 'Machine-readable atoms and bonds.');
      } else {
        add('fasta', 'Sequence Standard', 'Clean header + nucleotide/protein sequence.');
        add('json', 'Structured Reads', 'Parsed sequences with quality metrics.');
      }
      break;
  }

  return recs.slice(0, 4);
}

export const FORMAT_REGISTRY: FormatDefinition[] = RAW_FORMATS.map((seed) => {
  const compatibleOutputs = computeCompatibleOutputs(seed);
  return {
    ext: seed.ext,
    name: seed.name,
    category: seed.category,
    mimeTypes: seed.mimes,
    supportLevel: seed.support ?? 'full',
    inputSupported: seed.in ?? seed.support !== 'unavailable',
    outputSupported: seed.out ?? seed.support !== 'unavailable',
    engine: seed.engine ?? 'external-adapter',
    compatibleOutputs,
    recommendedOutputs: computeRecommendations(seed, compatibleOutputs),
    notes: seed.notes,
    operationKind: seed.op ?? 'conversion',
  };
});

export const FORMAT_MAP: Record<string, FormatDefinition> = Object.fromEntries(
  FORMAT_REGISTRY.map((f) => [f.ext, f])
);

export function getFormatByExtension(ext: string): FormatDefinition | undefined {
  const normalized = ext.toLowerCase().replace(/^\./, '').trim();
  return FORMAT_MAP[normalized];
}

export function getFormatsByCategory(category: FormatCategory): FormatDefinition[] {
  return FORMAT_REGISTRY.filter((f) => f.category === category);
}

export function getSupportedStats() {
  const total = FORMAT_REGISTRY.length;
  const full = FORMAT_REGISTRY.filter((f) => f.supportLevel === 'full').length;
  const partial = FORMAT_REGISTRY.filter((f) => f.supportLevel === 'partial').length;
  const unavailable = FORMAT_REGISTRY.filter((f) => f.supportLevel === 'unavailable').length;
  return { total, full, partial, unavailable };
}

export const QUICK_SHORTCUTS: { label: string; from: string; to: string; category: FormatCategory }[] = [
  { label: 'PNG to WebP', from: 'png', to: 'webp', category: 'image' },
  { label: 'HEIC to JPG', from: 'heic', to: 'jpg', category: 'image' },
  { label: 'PDF to PNG', from: 'pdf', to: 'png', category: 'document' },
  { label: 'DOCX to PDF', from: 'docx', to: 'pdf', category: 'document' },
  { label: 'XLSX to CSV', from: 'xlsx', to: 'csv', category: 'spreadsheet' },
  { label: 'MP4 to GIF', from: 'mp4', to: 'gif', category: 'video' },
  { label: 'WAV to MP3', from: 'wav', to: 'mp3', category: 'audio' },
  { label: 'SRT to VTT', from: 'srt', to: 'vtt', category: 'subtitle' },
  { label: 'YAML to JSON', from: 'yaml', to: 'json', category: 'data' },
  { label: 'OBJ to GLB', from: 'obj', to: 'glb', category: 'model3d' },
  { label: 'TTF to WOFF2', from: 'ttf', to: 'woff2', category: 'font' },
  { label: 'SCSS to CSS', from: 'scss', to: 'css', category: 'webdev' },
];

export const ARCHIVE_FORMAT_MATRIX: ArchiveFormatCapabilityRow[] = [
  { ext: 'zip', name: 'ZIP Archive', supportLevel: 'full', create: true, extract: true, inspect: true, modify: true, encrypt: true, split: true, engine: '7za / ADM-Zip / Archiver AES-256', notes: 'Full create, selective extract, inspect, rename/add/delete entries, AES-256 password, and multi-volume split.' },
  { ext: '7z', name: '7-Zip Archive', supportLevel: 'full', create: true, extract: true, inspect: true, modify: true, encrypt: true, split: true, engine: '7-Zip (7za 16.02)', notes: 'LZMA2 / LZMA / BZip2 / PPMd compression, AES-256 encryption, entry add/delete/rename, and split volumes.' },
  { ext: 'tar', name: 'POSIX Tape Archive', supportLevel: 'full', create: true, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: 'Node Tar / GNU Tar', notes: 'Uncompressed multi-file tape container with safe traversal guards.' },
  { ext: 'tgz', name: 'Gzipped Tarball', supportLevel: 'full', create: true, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: 'Node Tar + Zlib', notes: 'Standard .tar.gz container with level 1–9 compression.' },
  { ext: 'gz', name: 'Gzip Archive', supportLevel: 'full', create: true, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: 'Zlib / Tar', notes: 'Single-file stream or tar-wrapped Gzip compression and extraction.' },
  { ext: 'bz2', name: 'Bzip2 Archive', supportLevel: 'full', create: true, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: 'GNU Tar + BZip2 / 7za', notes: 'Burrows-Wheeler block-sorting archive creation and extraction.' },
  { ext: 'xz', name: 'XZ / LZMA2 Archive', supportLevel: 'full', create: true, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: 'GNU Tar + XZ / 7za', notes: 'High-ratio LZMA2 tar archive creation and safe extraction.' },
  { ext: 'lzma', name: 'LZMA Stream', supportLevel: 'partial', create: true, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: '7za / XZ Utils', notes: 'Single-stream LZMA compression and extraction.' },
  { ext: 'zst', name: 'Zstandard Archive', supportLevel: 'partial', create: false, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: 'Fzstd + Tar', notes: 'Decompression and .tar.zst extraction supported; creation requires zstd CLI binary.' },
  { ext: 'cab', name: 'Microsoft Cabinet', supportLevel: 'partial', create: false, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: '7-Zip (7za)', notes: 'Inspect, integrity test, and extract supported; CAB authoring is read-only.' },
  { ext: 'deb', name: 'Debian Package', supportLevel: 'partial', create: false, extract: true, inspect: true, modify: false, encrypt: false, split: false, engine: 'dpkg-deb / GNU ar', notes: 'Safe package payload inspection and extraction supported.' },
  { ext: 'rar', name: 'RAR Archive', supportLevel: 'unavailable', create: false, extract: false, inspect: false, modify: false, encrypt: false, split: false, engine: 'External Adapter (unrar)', notes: 'Proprietary RAR extraction requires unrar or p7zip-rar binary.' },
  { ext: 'iso', name: 'ISO 9660 Disc Image', supportLevel: 'unavailable', create: false, extract: false, inspect: false, modify: false, encrypt: false, split: false, engine: 'External Adapter (7zz / xorriso)', notes: 'Requires full p7zip-full (7zz) or xorriso binary.' },
  { ext: 'arj', name: 'ARJ Archive', supportLevel: 'unavailable', create: false, extract: false, inspect: false, modify: false, encrypt: false, split: false, engine: 'External Adapter (arj)', notes: 'Requires arj or p7zip-full handler.' },
  { ext: 'lzh', name: 'LZH Archive', supportLevel: 'unavailable', create: false, extract: false, inspect: false, modify: false, encrypt: false, split: false, engine: 'External Adapter (lhasa)', notes: 'Requires lhasa or p7zip-full handler.' },
  { ext: 'cpio', name: 'CPIO Archive', supportLevel: 'unavailable', create: false, extract: false, inspect: false, modify: false, encrypt: false, split: false, engine: 'External Adapter (cpio)', notes: 'Requires GNU cpio utility.' },
  { ext: 'rpm', name: 'RPM Package', supportLevel: 'unavailable', create: false, extract: false, inspect: false, modify: false, encrypt: false, split: false, engine: 'External Adapter (rpm2cpio)', notes: 'Requires rpm2cpio utility.' },
];

