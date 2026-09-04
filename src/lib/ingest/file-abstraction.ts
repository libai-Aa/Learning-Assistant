/**
 * 统一文件抽象层
 * 提供多格式文件的统一访问和管理接口
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  FileEntry, 
  FileNode, 
  KnowledgeType, 
  SourceType, 
  KnowledgeFormat,
  ParseOptions,
  LegacyFileNode,

} from '../../types/knowledge';
import { parserRegistry } from '../parsers/parser-interface';

/**
 * 文件抽象服务
 */
export class FileAbstraction {
  private fileEntries: Map<string, FileEntry> = new Map();
  private filePathToId: Map<string, string> = new Map();

  /**
   * 获取文件条目
   */
  getFileEntry(id: string): FileEntry | undefined {
    return this.fileEntries.get(id);
  }

  /**
   * 通过文件路径获取文件条目
   */
  getFileEntryByPath(filePath: string): FileEntry | undefined {
    const id = this.filePathToId.get(filePath);
    return id ? this.fileEntries.get(id) : undefined;
  }

  /**
   * 添加文件条目
   */
  addFileEntry(entry: FileEntry): void {
    this.fileEntries.set(entry.id, entry);
    this.filePathToId.set(entry.filePath, entry.id);
  }

  /**
   * 更新文件条目
   */
  updateFileEntry(id: string, updates: Partial<FileEntry>): void {
    const entry = this.fileEntries.get(id);
    if (entry) {
      this.fileEntries.set(id, { ...entry, ...updates });
    }
  }

  /**
   * 删除文件条目
   */
  removeFileEntry(id: string): boolean {
    const entry = this.fileEntries.get(id);
    if (entry) {
      this.fileEntries.delete(id);
      this.filePathToId.delete(entry.filePath);
      return true;
    }
    return false;
  }

  /**
   * 获取所有文件条目
   */
  getAllFileEntries(): FileEntry[] {
    return Array.from(this.fileEntries.values());
  }

  /**
   * 清空所有文件条目
   */
  clear(): void {
    this.fileEntries.clear();
    this.filePathToId.clear();
  }

  /**
   * 从文件路径创建文件条目
   */
  createFileEntryFromPath(filePath: string, sourceType: SourceType = SourceType.FILE): FileEntry {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const format = this.detectFormat(ext);
    const type = this.detectKnowledgeType(format);
    const mimeType = this.detectMimeType(filePath);

    return {
      id: this.generateFileId(filePath),
      name: path.basename(filePath),
      type,
      sourceType,
      format,
      size: stats.size,
      mimeType,
      filePath,
      metadata: {
        title: path.basename(filePath, path.extname(filePath)),
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
      },
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
      isParsed: false,
    };
  }

  /**
   * 从URL创建文件条目
   */
  createFileEntryFromUrl(url: string): FileEntry {
    const urlObj = new URL(url);
    return {
      id: this.generateFileId(url),
      name: urlObj.host,
      type: KnowledgeType.WEBPAGE,
      sourceType: SourceType.WEB,
      format: KnowledgeFormat.HTML,
      size: 0,
      mimeType: 'text/html',
      filePath: url,
      metadata: {
        title: urlObj.host,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isParsed: false,
    };
  }

  /**
   * 解析文件
   */
  async parseFile(entry: FileEntry, options?: ParseOptions): Promise<FileEntry> {
    const parser = parserRegistry.getParser(entry.filePath, entry.mimeType);

    if (!parser) {
      console.warn(`[FileAbstraction] 未找到支持的解析器: ${entry.filePath}`);
      return {
        ...entry,
        isParsed: true,
        parseError: '不支持的文件格式',
      };
    }

    console.log(`[FileAbstraction] 使用 ${parser.name} 解析: ${entry.filePath}`);

    try {
      const result = await parser.parse(entry.filePath, options);

      if (result.success) {
        const updatedEntry: FileEntry = {
          ...entry,
          content: result.content || undefined,
          metadata: {
            ...entry.metadata,
            ...(result.metadata || {}),
          },
          isParsed: true,
          updatedAt: new Date().toISOString(),
        };

        this.updateFileEntry(entry.id, updatedEntry);
        return updatedEntry;
      } else {
        return {
          ...entry,
          isParsed: true,
          parseError: result.error,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[FileAbstraction] 解析失败: ${entry.filePath}`, errorMessage);
      return {
        ...entry,
        isParsed: true,
        parseError: errorMessage,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * 批量解析文件
   */
  async parseFiles(entries: FileEntry[], options?: ParseOptions): Promise<FileEntry[]> {
    const results: FileEntry[] = [];

    for (const entry of entries) {
      const result = await this.parseFile(entry, options);
      results.push(result);
    }

    return results;
  }

  /**
   * 构建文件树
   */
  buildFileTree(rootPath: string): FileNode {
    return this.scanDirectory(rootPath);
  }

  /**
   * 扫描目录
   */
  private scanDirectory(dirPath: string): FileNode {
    const stats = fs.statSync(dirPath);

    if (!stats.isDirectory()) {
      return {
        id: this.generateFileId(dirPath),
        name: path.basename(dirPath),
        path: dirPath,
        isDirectory: false,
        isFile: true,
        format: this.detectFormat(path.extname(dirPath).replace('.', '')),
      };
    }

    const children = fs.readdirSync(dirPath).map((name) => {
      const childPath = path.join(dirPath, name);
      return this.scanDirectory(childPath);
    });

    return {
      id: this.generateFileId(dirPath),
      name: path.basename(dirPath),
      path: dirPath,
      isDirectory: true,
      isFile: false,
      children,
    };
  }

  /**
   * 检测文件格式
   */
  private detectFormat(ext: string): KnowledgeFormat {
    const formatMap: Record<string, KnowledgeFormat> = {
      pdf: KnowledgeFormat.PDF,
      docx: KnowledgeFormat.DOCX,
      doc: KnowledgeFormat.DOCX,
      pptx: KnowledgeFormat.PPTX,
      ppt: KnowledgeFormat.PPTX,
      xlsx: KnowledgeFormat.XLSX,
      xls: KnowledgeFormat.XLSX,
      md: KnowledgeFormat.MD,
      txt: KnowledgeFormat.TXT,
      html: KnowledgeFormat.HTML,
      htm: KnowledgeFormat.HTML,
      jpg: KnowledgeFormat.JPEG,
      jpeg: KnowledgeFormat.JPEG,
      png: KnowledgeFormat.PNG,
      webp: KnowledgeFormat.WEBP,
      mp3: KnowledgeFormat.MP3,
      wav: KnowledgeFormat.WAV,
      mp4: KnowledgeFormat.MP4,
      webm: KnowledgeFormat.WEBM,
    };

    return formatMap[ext.toLowerCase()] || KnowledgeFormat.TXT;
  }

  /**
   * 检测知识类型
   */
  private detectKnowledgeType(format: KnowledgeFormat): KnowledgeType {
    switch (format) {
      case KnowledgeFormat.PDF:
      case KnowledgeFormat.DOCX:
      case KnowledgeFormat.PPTX:
      case KnowledgeFormat.XLSX:
      case KnowledgeFormat.MD:
      case KnowledgeFormat.TXT:
        return KnowledgeType.DOCUMENT;
      case KnowledgeFormat.HTML:
        return KnowledgeType.WEBPAGE;
      case KnowledgeFormat.JPEG:
      case KnowledgeFormat.PNG:
      case KnowledgeFormat.WEBP:
        return KnowledgeType.IMAGE;
      case KnowledgeFormat.MP3:
      case KnowledgeFormat.WAV:
        return KnowledgeType.AUDIO;
      case KnowledgeFormat.MP4:
      case KnowledgeFormat.WEBM:
        return KnowledgeType.VIDEO;
      default:
        return KnowledgeType.DOCUMENT;
    }
  }

  /**
   * 检测MIME类型
   */
  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ppt: 'application/vnd.ms-powerpoint',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      md: 'text/markdown',
      txt: 'text/plain',
      html: 'text/html',
      htm: 'text/html',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      webm: 'video/webm',
    };

    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * 生成文件ID
   */
  private generateFileId(identifier: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(identifier);
    return `file_${hash.digest('hex').substring(0, 16)}`;
  }
}

// 导出单例
export const fileAbstraction = new FileAbstraction();

/**
 * 根据文件扩展名检测知识格式
 */
function detectFormatByExt(ext: string): KnowledgeFormat {
  const formatMap: Record<string, KnowledgeFormat> = {
    pdf: KnowledgeFormat.PDF,
    docx: KnowledgeFormat.DOCX,
    doc: KnowledgeFormat.DOCX,
    pptx: KnowledgeFormat.PPTX,
    ppt: KnowledgeFormat.PPTX,
    xlsx: KnowledgeFormat.XLSX,
    xls: KnowledgeFormat.XLSX,
    md: KnowledgeFormat.MD,
    txt: KnowledgeFormat.TXT,
    html: KnowledgeFormat.HTML,
    htm: KnowledgeFormat.HTML,
    jpg: KnowledgeFormat.JPEG,
    jpeg: KnowledgeFormat.JPEG,
    png: KnowledgeFormat.PNG,
    webp: KnowledgeFormat.WEBP,
    mp3: KnowledgeFormat.MP3,
    wav: KnowledgeFormat.WAV,
    mp4: KnowledgeFormat.MP4,
    webm: KnowledgeFormat.WEBM,
  };
  return formatMap[ext.toLowerCase()] || KnowledgeFormat.TXT;
}

/**
 * 根据知识格式检测知识类型（迁移专用，MD 归类为 MARKDOWN）
 */
function detectKnowledgeTypeForMigration(format: KnowledgeFormat): KnowledgeType {
  switch (format) {
    case KnowledgeFormat.MD:
      return KnowledgeType.MARKDOWN;
    case KnowledgeFormat.PDF:
    case KnowledgeFormat.DOCX:
    case KnowledgeFormat.PPTX:
    case KnowledgeFormat.XLSX:
    case KnowledgeFormat.TXT:
      return KnowledgeType.DOCUMENT;
    case KnowledgeFormat.HTML:
      return KnowledgeType.WEBPAGE;
    case KnowledgeFormat.JPEG:
    case KnowledgeFormat.PNG:
    case KnowledgeFormat.WEBP:
      return KnowledgeType.IMAGE;
    case KnowledgeFormat.MP3:
    case KnowledgeFormat.WAV:
      return KnowledgeType.AUDIO;
    case KnowledgeFormat.MP4:
    case KnowledgeFormat.WEBM:
      return KnowledgeType.VIDEO;
    default:
      return KnowledgeType.DOCUMENT;
  }
}

/**
 * 根据扩展名检测 MIME 类型
 */
function detectMimeTypeByExt(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    md: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * 迁移旧版FileNode到FileEntry
 * 根据文件扩展名自动检测格式与类型，保持向后兼容
 */
export function migrateLegacyFileNodes(nodes: LegacyFileNode[]): FileEntry[] {
  return nodes
    .filter((node) => node.isFile)
    .map((node) => {
      const ext = node.path.split('.').pop() || '';
      const format = detectFormatByExt(ext);
      const type = detectKnowledgeTypeForMigration(format);
      const mimeType = detectMimeTypeByExt(ext);
      const title = node.name.replace(/\.[^.]+$/, '');

      return {
        id: generateLegacyId(node.path),
        name: node.name,
        type,
        sourceType: SourceType.FILE,
        format,
        size: 0,
        mimeType,
        filePath: node.path,
        metadata: {
          title,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };
    });
}

/**
 * 为迁移节点生成稳定 ID
 */
function generateLegacyId(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(filePath);
  return `file_${hash.digest('hex').substring(0, 16)}`;
}