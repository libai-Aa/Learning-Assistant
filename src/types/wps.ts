/**
 * WPS Office 集成层类型定义
 *
 * 设计目标：
 *  - 让 AI 能够通过统一接口调用本机 WPS Office
 *  - 支持 PPT / Word / PDF / Excel 四类文档的打开、创建、编辑、保存、导出
 *  - 抽象 Windows COM / 命令行 / Tauri Shell 等多种底层调用方式
 *  - 完整记录操作日志，便于"懂用户品位"的智能体积累交互经验
 *
 * 命名约定：
 *  - 枚举值使用小写连字符，便于序列化与跨语言传递
 *  - 接口名以 WPS 为前缀，避免与 knowledge.ts 等已有类型冲突
 */

/**
 * WPS 文档类型
 * 与 WPS 应用模块一一对应
 */
export type WPSDocumentType = 'ppt' | 'word' | 'pdf' | 'excel';

/**
 * WPS 操作类型
 * 覆盖文档全生命周期
 */
export type WPSOperationType =
  | 'open'      // 打开已有文档
  | 'create'    // 新建文档
  | 'edit'      // 编辑内容
  | 'save'      // 保存
  | 'export'    // 导出为其他格式
  | 'close'     // 关闭文档
  | 'macro'     // 执行 WPS 宏/自动化脚本
  | 'read';     // 读取文档内容（用于 AI 消费）

/**
 * WPS 导出格式
 * 取 WPS "另存为" 对话框中常见的目标格式
 */
export type WPSExportFormat =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'pptx'
  | 'ppt'
  | 'xlsx'
  | 'xls'
  | 'txt'
  | 'html'
  | 'image'; // 图片（png/jpg，由 params 指定具体格式）

/**
 * WPS 应用模块名称（用于 COM 调用）
 */
export type WPSAppName = 'wpp' | 'wps' | 'et' | 'wpspdf';

/**
 * 文档编辑变更类型
 * 用于 editContent 的语义化变更描述
 */
export type WPSChangeType =
  | 'text'           // 替换/插入文本
  | 'image'          // 插入/替换图片
  | 'table'          // 插入/修改表格
  | 'slide'          // PPT 幻灯片操作（增删改查）
  | 'style'          // 样式变更（字体/颜色/版式）
  | 'property'       // 文档属性（标题/作者等）
  | 'raw';           // 原生宏调用，不解析

/**
 * WPS 文档句柄
 * 桥接层维护的运行时文档对象
 */
export interface WPSDocument {
  /** 文档唯一 ID（由桥接层生成，跨进程稳定） */
  id: string;
  /** 文档类型 */
  type: WPSDocumentType;
  /** 文件绝对路径（新建未保存时为空字符串） */
  path: string;
  /** 文件名（含扩展名） */
  name: string;
  /** 是否处于打开状态 */
  isOpen: boolean;
  /** 最后修改时间（ISO 字符串，便于序列化） */
  lastModified: string;
  /** WPS 内部文档句柄（COM Document 对象的标识，可能为空） */
  handle?: string;
  /** 是否有未保存的修改 */
  isDirty?: boolean;
}

/**
 * 文档内容变更描述
 * editContent 接口的入参
 */
export interface WPSContentChange {
  /** 变更类型 */
  type: WPSChangeType;
  /** 目标定位（幻灯片索引、段落索引、单元格坐标等） */
  target?: string;
  /** 变更数据，结构随 type 不同而不同 */
  data: Record<string, unknown>;
}

/**
 * WPS 操作记录
 * 用于审计与"懂用户"经验积累
 */
export interface WPSOperation {
  /** 操作类型 */
  type: WPSOperationType;
  /** 关联文档 ID（create 时可能为空） */
  documentId?: string;
  /** 操作参数 */
  params: Record<string, unknown>;
  /** 操作结果（成功时填充） */
  result?: unknown;
  /** 操作时间戳（ISO 字符串） */
  timestamp: string;
  /** 是否成功 */
  success: boolean;
  /** 失败时的错误信息 */
  error?: string;
  /** 操作耗时（毫秒） */
  durationMs?: number;
}

/**
 * WPS 安装信息
 */
export interface WPSInstallation {
  /** 是否已安装 */
  installed: boolean;
  /** 安装路径（如 C:\Users\xxx\AppData\Local\Kingsoft\WPS Office\...） */
  installPath?: string;
  /** 可执行文件路径 */
  executablePath?: string;
  /** 版本号 */
  version?: string;
  /** 检测方式：registry(注册表) / path(常见路径) / env(环境变量) */
  detectedBy?: 'registry' | 'path' | 'env';
}

/**
 * WPS 桥接层接口
 * 前端调用统一入口，具体实现可对接 Tauri Command / COM / 命令行
 */
export interface WPSBridge {
  /** 检测 WPS 是否安装，返回安装信息 */
  isInstalled(): Promise<WPSInstallation>;
  /** 启动 WPS 应用（可选指定模块） */
  startWPS(app?: WPSAppName): Promise<boolean>;
  /** 退出 WPS 应用 */
  quitWPS(app?: WPSAppName): Promise<boolean>;
  /** 打开已有文档 */
  openDocument(path: string): Promise<WPSDocument>;
  /** 新建文档 */
  createDocument(type: WPSDocumentType, name?: string): Promise<WPSDocument>;
  /** 读取文档内容（用于 AI 消费） */
  readDocument(docId: string): Promise<WPSDocumentContent>;
  /** 编辑文档内容 */
  editContent(docId: string, changes: WPSContentChange[]): Promise<void>;
  /** 保存文档 */
  saveDocument(docId: string): Promise<void>;
  /** 另存为 */
  saveAs(docId: string, path: string): Promise<void>;
  /** 导出为指定格式，返回导出文件路径 */
  exportDocument(docId: string, format: WPSExportFormat, params?: Record<string, unknown>): Promise<string>;
  /** 关闭文档 */
  closeDocument(docId: string, save?: boolean): Promise<void>;
  /** 执行 WPS 宏/自动化脚本 */
  executeMacro(docId: string, macro: string, args?: unknown[]): Promise<unknown>;
  /** 获取当前打开的所有文档 */
  listOpenDocuments(): Promise<WPSDocument[]>;
  /** 获取操作历史记录 */
  getOperationHistory(): Promise<WPSOperation[]>;
}

/**
 * 文档读取结果
 * AI 消费的统一内容结构
 */
export interface WPSDocumentContent {
  /** 文档 ID */
  documentId: string;
  /** 文档类型 */
  type: WPSDocumentType;
  /** 纯文本内容 */
  text: string;
  /** 结构化内容（按文档类型不同而不同） */
  structured?: WPSStructuredContent;
  /** 图片列表（base64 或临时文件路径） */
  images?: string[];
  /** 元数据 */
  metadata?: WPSDocumentMetadata;
}

/**
 * 结构化内容
 * 联合类型，按文档类型区分
 */
export type WPSStructuredContent =
  | { kind: 'ppt'; slides: WPSSlide[] }
  | { kind: 'word'; paragraphs: WPSParagraph[] }
  | { kind: 'excel'; sheets: WPSSheet[] }
  | { kind: 'pdf'; pages: WPSPage[] };

/**
 * PPT 幻灯片
 */
export interface WPSSlide {
  /** 幻灯片索引（从 1 开始） */
  index: number;
  /** 文本框列表 */
  textFrames: WPSTextFrame[];
  /** 图片列表 */
  images?: string[];
  /** 备注 */
  notes?: string;
  /** 版式名称 */
  layout?: string;
}

/**
 * 文本框
 */
export interface WPSTextFrame {
  /** 文本内容 */
  text: string;
  /** 左上角 X 坐标（磅） */
  left?: number;
  /** 左上角 Y 坐标（磅） */
  top?: number;
  /** 宽度（磅） */
  width?: number;
  /** 高度（磅） */
  height?: number;
  /** 字体名称 */
  fontName?: string;
  /** 字号 */
  fontSize?: number;
  /** 是否加粗 */
  bold?: boolean;
  /** 字体颜色（RGB 十六进制） */
  color?: string;
}

/**
 * Word 段落
 */
export interface WPSParagraph {
  /** 段落索引（从 1 开始） */
  index: number;
  /** 文本内容 */
  text: string;
  /** 样式名称（如 Heading1 / Normal） */
  style?: string;
  /** 对齐方式 */
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

/**
 * Excel 工作表
 */
export interface WPSSheet {
  /** 工作表名称 */
  name: string;
  /** 单元格数据（行优先） */
  rows: WPSCell[][];
}

/**
 * Excel 单元格
 */
export interface WPSCell {
  /** 单元格坐标（如 A1） */
  address: string;
  /** 值 */
  value: string | number | boolean | null;
  /** 公式 */
  formula?: string;
}

/**
 * PDF 页面
 */
export interface WPSPage {
  /** 页码（从 1 开始） */
  index: number;
  /** 文本内容 */
  text: string;
  /** 图片列表 */
  images?: string[];
}

/**
 * 文档元数据
 */
export interface WPSDocumentMetadata {
  /** 标题 */
  title?: string;
  /** 作者 */
  author?: string;
  /** 主题 */
  subject?: string;
  /** 关键词 */
  keywords?: string;
  /** 创建时间 */
  createdAt?: string;
  /** 修改时间 */
  modifiedAt?: string;
  /** 页数/幻灯片数/工作表数 */
  pageCount?: number;
  /** 字数 */
  wordCount?: number;
}

/**
 * WPS 错误类型
 */
export type WPSErrorCode =
  | 'WPS_NOT_INSTALLED'      // WPS 未安装
  | 'WPS_LAUNCH_FAILED'      // 启动失败
  | 'DOC_NOT_FOUND'          // 文档不存在
  | 'DOC_NOT_OPEN'           // 文档未打开
  | 'DOC_ALREADY_OPEN'       // 文档已打开
  | 'INVALID_FORMAT'         // 不支持的格式
  | 'MACRO_FAILED'           // 宏执行失败
  | 'COM_ERROR'              // COM 调用失败
  | 'TIMEOUT'                // 操作超时
  | 'UNKNOWN';               // 未知错误

/**
 * WPS 错误
 */
export class WPSError extends Error {
  /** 错误码 */
  readonly code: WPSErrorCode;
  /** 关联文档 ID */
  readonly documentId?: string;
  /** 原始错误 */
  readonly cause?: unknown;

  constructor(code: WPSErrorCode, message: string, options?: { documentId?: string; cause?: unknown }) {
    super(message);
    this.name = 'WPSError';
    this.code = code;
    this.documentId = options?.documentId;
    this.cause = options?.cause;
  }

  /**
   * 转换为 JSON（便于日志记录）
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      documentId: this.documentId,
    };
  }
}

/**
 * WPS 桥接层配置
 */
export interface WPSBridgeConfig {
  /** 是否启用桥接层（未安装时自动禁用） */
  enabled: boolean;
  /** 操作超时时间（毫秒） */
  timeoutMs: number;
  /** 是否在调试模式（输出详细日志） */
  debug: boolean;
  /** 自定义 WPS 安装路径（覆盖自动检测） */
  customInstallPath?: string;
  /** 是否启用 COM 接口（Windows） */
  useCOM: boolean;
  /** 是否启用命令行回退 */
  useCLI: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_WPS_BRIDGE_CONFIG: WPSBridgeConfig = {
  enabled: true,
  timeoutMs: 30000,
  debug: false,
  useCOM: true,
  useCLI: true,
};

/**
 * 文档类型 → WPS 应用模块 映射
 */
export const DOCUMENT_TYPE_TO_APP: Record<WPSDocumentType, WPSAppName> = {
  ppt: 'wpp',
  word: 'wps',
  pdf: 'wpspdf',
  excel: 'et',
};

/**
 * 文档类型 → 默认扩展名 映射
 */
export const DOCUMENT_TYPE_TO_EXTENSION: Record<WPSDocumentType, string> = {
  ppt: 'pptx',
  word: 'docx',
  pdf: 'pdf',
  excel: 'xlsx',
};

/**
 * 文档类型 → 默认模板名
 */
export const DOCUMENT_TYPE_DEFAULT_NAME: Record<WPSDocumentType, string> = {
  ppt: '未命名演示文稿.pptx',
  word: '未命名文档.docx',
  pdf: '未命名文档.pdf',
  excel: '未命名工作簿.xlsx',
};

/**
 * 根据文件路径推断文档类型
 * @param path 文件路径
 * @returns 文档类型，无法识别时返回 null
 */
export function inferDocumentType(path: string): WPSDocumentType | null {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ppt':
    case 'pptx':
      return 'ppt';
    case 'doc':
    case 'docx':
    case 'wps':
      return 'word';
    case 'pdf':
      return 'pdf';
    case 'xls':
    case 'xlsx':
    case 'et':
      return 'excel';
    default:
      return null;
  }
}

/**
 * 生成文档 ID
 * 格式：wps_<时间戳36进制>_<随机4位36进制>
 */
export function generateDocumentId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `wps_${ts}_${rand}`;
}