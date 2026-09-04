/**
 * 知识类型枚举
 */
export enum KnowledgeType {
  DOCUMENT = 'document',
  WEBPAGE = 'webpage',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  IDEA = 'idea',
  QUESTION = 'question',
  ANNOTATION = 'annotation',
  MARKDOWN = 'markdown',
}

/**
 * 来源类型枚举
 */
export enum SourceType {
  FILE = 'file',
  WEB = 'web',
  CHAT = 'chat',
  RESEARCH = 'research',
}

/**
 * 知识格式枚举
 */
export enum KnowledgeFormat {
  PDF = 'pdf',
  DOCX = 'docx',
  PPTX = 'pptx',
  XLSX = 'xlsx',
  MD = 'md',
  TXT = 'txt',
  HTML = 'html',
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  MP3 = 'mp3',
  WAV = 'wav',
  MP4 = 'mp4',
  WEBM = 'webm',
}

/**
 * 重要性等级枚举
 * 用于评估想法/知识条目的重要程度
 */
export enum ImportanceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * 紧急度等级枚举
 * 用于评估想法/知识条目的紧急程度
 */
export enum UrgencyLevel {
  URGENT = 'urgent',
  NORMAL = 'normal',
  NOT_URGENT = 'not_urgent',
}

/**
 * 重要性等级值类型
 */
export type ImportanceLevelValue = `${ImportanceLevel}`;

/**
 * 紧急度等级值类型
 */
export type UrgencyLevelValue = `${UrgencyLevel}`;

/**
 * 知识类型值类型
 */
export type KnowledgeTypeValue = `${KnowledgeType}`;

/**
 * 来源类型值类型
 */
export type SourceTypeValue = `${SourceType}`;

/**
 * 文件元数据接口
 */
export interface FileMetadata {
  /** 文件标题 */
  title: string;
  /** 作者 */
  author?: string;
  /** 描述 */
  description?: string;
  /** 语言 */
  language?: string;
  /** 页数 (PDF/DOCX) */
  pageCount?: number;
  /** 幻灯片数 (PPTX) */
  slideCount?: number;
  /** 工作表数 (XLSX) */
  sheetCount?: number;
  /** 时长 (音视频，单位: 秒) */
  duration?: number;
  /** 创建时间 */
  createdAt?: string;
  /** 修改时间 */
  modifiedAt?: string;
  /** 自定义标签 */
  tags?: string[];
  /** 重要性等级 (高/中/低) */
  importance?: 'high' | 'medium' | 'low';
  /** 紧急度等级 (紧急/一般/不紧急) */
  urgency?: 'urgent' | 'normal' | 'not_urgent';
}

/**
 * 提取的内容接口
 */
export interface ExtractedContent {
  /** 纯文本内容 */
  text: string;
  /** OCR识别的文本 */
  ocrText?: string;
  /** 语音转文字内容 */
  transcription?: string;
  /** 结构化数据 (表格等) */
  structuredData?: Record<string, unknown>;
  /** 图片 (base64或URL) */
  images?: string[];
  /** 链接列表 */
  links?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 统一文件条目接口
 * 核心接口，支持多格式知识的统一存储
 */
export interface FileEntry {
  /** 唯一标识符 */
  id: string;
  /** 文件名 */
  name: string;
  /** 知识类型 */
  type: KnowledgeType;
  /** 来源类型 */
  sourceType: SourceType;
  /** 文件格式 */
  format: KnowledgeFormat;
  /** 文件大小 (字节) */
  size: number;
  /** MIME类型 */
  mimeType: string;
  /** 文件路径 */
  filePath: string;
  /** 文件路径别名 (用于直接访问，如图片URL等) */
  path?: string;
  /** 文件元数据 */
  metadata: FileMetadata;
  /** 提取的内容 */
  content?: ExtractedContent;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 是否已被解析 */
  isParsed: boolean;
  /** 解析错误信息 (如有) */
  parseError?: string;
  /** 阅读进度 (0-1) */
  readProgress?: number;
  /** 顶层标签列表 (便于直接筛选) */
  tags?: string[];
}

/**
 * 文件节点接口 (用于文件树)
 */
export interface FileNode {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: FileNode[];
  /** 扩展字段: 关联的文件条目ID */
  fileId?: string;
  /** 扩展字段: 文件格式图标 */
  format?: KnowledgeFormat;
}

/**
 * 解析结果接口
 */
export interface ParseResult {
  success: boolean;
  content?: ExtractedContent;
  metadata?: Partial<FileMetadata>;
  warnings?: string[];
  error?: string;
}

/**
 * 解析选项接口
 */
export interface ParseOptions {
  /** 是否提取图片 */
  extractImages?: boolean;
  /** 是否启用OCR */
  enableOcr?: boolean;
  /** 是否启用语音转文字 */
  enableSTT?: boolean;
  /** OCR识别语言 */
  ocrLanguage?: string | string[];
  /** 最大处理时长 (音视频，单位: 秒) */
  maxDuration?: number;
  /** 自定义选项 */
  [key: string]: unknown;
}

/**
 * 解析器接口
 */
export interface FormatParser {
  /** 解析器名称 */
  name: string;
  /** 支持的文件扩展名列表 */
  supportedExtensions: string[];
  /** 支持的MIME类型列表 */
  supportedMimeTypes: string[];
  /** 解析文件 */
  parse(filePath: string, options?: ParseOptions): Promise<ParseResult>;
  /** 是否支持该文件 */
  supports(filePath: string, mimeType?: string): boolean;
}

/**
 * 旧版FileNode兼容接口
 */
export interface LegacyFileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: LegacyFileNode[];
}

/**
 * 将旧版FileNode转换为FileEntry
 */
export function convertLegacyFileNodeToFileEntry(node: LegacyFileNode): FileEntry {
  return {
    id: generateId(node.path),
    name: node.name,
    type: KnowledgeType.MARKDOWN,
    sourceType: SourceType.FILE,
    format: KnowledgeFormat.MD,
    size: 0,
    mimeType: 'text/markdown',
    filePath: node.path,
    metadata: {
      title: node.name.replace(/\.md$/, ''),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isParsed: false,
  };
}

/**
 * 生成唯一ID
 */
function generateId(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `file_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

// ==================== Read 区域相关类型 ====================

/**
 * 自动分类结果
 */
export interface AutoCategoryResult {
  /** 分类标签 */
  category: string;
  /** 子分类标签 */
  subcategory?: string;
  /** 分类置信度 (0-1) */
  confidence: number;
  /** 分类依据关键词 */
  keywords: string[];
  /** 建议的知识类型 */
  suggestedType: KnowledgeType;
}

/**
 * 阅读进度
 */
export interface ReadProgress {
  /** 知识条目ID */
  knowledgeId: string;
  /** 阅读进度 (0-1) */
  progress: number;
  /** 当前位置 (字符偏移) */
  position: number;
  /** 最后阅读时间 */
  lastReadAt: string;
  /** 阅读时长 (秒) */
  readDuration?: number;
}