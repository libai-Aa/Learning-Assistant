/**
 * 核心摄入模块
 * 支持多格式文件的摄入、解析和索引
 */

import fs from 'fs';
import path from 'path';
import { 
  FileEntry, 
  SourceType, 
  ParseOptions,
  FileNode,
  LegacyFileNode,
} from '../../types/knowledge';

import { fileAbstraction, migrateLegacyFileNodes } from './file-abstraction';
import { metadataIndex, convertToFileEntryDocument } from './metadata-index';

/**
 * 摄入结果
 */
export interface IngestResult {
  success: boolean;
  entries: FileEntry[];
  errors: Array<{
    filePath: string;
    error: string;
  }>;
  warnings: string[];
}

/**
 * 摄入选项
 */
export interface IngestOptions {
  /** 是否递归扫描子目录 */
  recursive?: boolean;
  /** 是否解析文件 */
  parse?: boolean;
  /** 是否建立索引 */
  index?: boolean;
  /** 解析选项 */
  parseOptions?: ParseOptions;
  /** 文件过滤 */
  fileFilter?: {
    extensions?: string[];
    maxSize?: number;
  };
}

/**
 * 摄入核心类
 */
export class IngestCore {
  /**
   * 摄入文件或目录
   */
  async ingest(
    sourcePath: string,
    options?: IngestOptions
  ): Promise<IngestResult> {
    const result: IngestResult = {
      success: true,
      entries: [],
      errors: [],
      warnings: [],
    };

    const opts = this.normalizeOptions(options);

    // 检查路径是否存在
    if (!fs.existsSync(sourcePath)) {
      result.success = false;
      result.errors.push({
        filePath: sourcePath,
        error: '路径不存在',
      });
      return result;
    }

    // 扫描文件
    const filePaths = this.scanFiles(sourcePath, opts);

    // 过滤文件
    const filteredPaths = this.filterFiles(filePaths, opts);

    // 创建文件条目
    const entries = filteredPaths.map((filePath) =>
      fileAbstraction.createFileEntryFromPath(filePath, SourceType.FILE)
    );

    // 解析文件
    if (opts.parse && entries.length > 0) {
      const parsedEntries = await fileAbstraction.parseFiles(entries, opts.parseOptions);
      
      // 更新条目
      for (const entry of parsedEntries) {
        fileAbstraction.addFileEntry(entry);
      }
      result.entries = parsedEntries;

      // 收集错误
      for (const entry of parsedEntries) {
        if (entry.parseError) {
          result.errors.push({
            filePath: entry.filePath,
            error: entry.parseError,
          });
        }
      }
    } else {
      for (const entry of entries) {
        fileAbstraction.addFileEntry(entry);
      }
      result.entries = entries;
    }

    // 建立索引
    if (opts.index) {
      await this.buildIndex(result.entries);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * 摄入网页
   */
  async ingestWeb(
    url: string,
    options?: IngestOptions
  ): Promise<IngestResult> {
    const result: IngestResult = {
      success: true,
      entries: [],
      errors: [],
      warnings: [],
    };

    try {
      // 创建文件条目
      const entry = fileAbstraction.createFileEntryFromUrl(url);
      fileAbstraction.addFileEntry(entry);

      // 解析网页
      const opts = this.normalizeOptions(options);
      if (opts.parse) {
        const parsedEntry = await fileAbstraction.parseFile(entry, opts.parseOptions);
        
        if (parsedEntry.parseError) {
          result.errors.push({
            filePath: url,
            error: parsedEntry.parseError,
          });
          result.success = false;
        } else {
          // 建立索引
          if (opts.index) {
            await this.buildIndex([parsedEntry]);
          }
        }
        
        result.entries.push(parsedEntry);
      } else {
        result.entries.push(entry);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({ filePath: url, error: errorMessage });
      result.success = false;
    }

    return result;
  }

  /**
   * 批量摄入
   */
  async ingestBatch(
    paths: string[],
    options?: IngestOptions
  ): Promise<IngestResult> {
    const result: IngestResult = {
      success: true,
      entries: [],
      errors: [],
      warnings: [],
    };

    for (const path of paths) {
      let subResult: IngestResult;
      
      if (path.startsWith('http://') || path.startsWith('https://')) {
        subResult = await this.ingestWeb(path, options);
      } else {
        subResult = await this.ingest(path, options);
      }

      result.entries.push(...subResult.entries);
      result.errors.push(...subResult.errors);
      result.warnings.push(...subResult.warnings);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * 扫描文件
   */
  private scanFiles(sourcePath: string, options: Required<IngestOptions>): string[] {
    const stats = fs.statSync(sourcePath);

    if (!stats.isDirectory()) {
      return [sourcePath];
    }

    const files: string[] = [];
    const items = fs.readdirSync(sourcePath);

    for (const item of items) {
      const itemPath = path.join(sourcePath, item);
      const itemStats = fs.statSync(itemPath);

      if (itemStats.isDirectory() && options.recursive) {
        files.push(...this.scanFiles(itemPath, options));
      } else if (itemStats.isFile()) {
        files.push(itemPath);
      }
    }

    return files;
  }

  /**
   * 过滤文件
   */
  private filterFiles(
    filePaths: string[],
    options: Required<IngestOptions>
  ): string[] {
    return filePaths.filter((filePath) => {
      // 扩展名过滤
      if (options.fileFilter?.extensions) {
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        if (!options.fileFilter.extensions.map(e => e.toLowerCase()).includes(ext)) {
          return false;
        }
      }

      // 大小过滤
      if (options.fileFilter?.maxSize) {
        const stats = fs.statSync(filePath);
        if (stats.size > options.fileFilter.maxSize) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 建立索引
   */
  async buildIndex(entries: FileEntry[]): Promise<void> {
    const documents = entries.map(convertToFileEntryDocument);
    await metadataIndex.indexBatch(documents);
  }

  /**
   * 标准化选项
   */
  normalizeOptions(options?: IngestOptions): Required<IngestOptions> {
    return {
      recursive: options?.recursive ?? true,
      parse: options?.parse ?? true,
      index: options?.index ?? true,
      parseOptions: options?.parseOptions ?? {},
      fileFilter: options?.fileFilter ?? {},
    };
  }
}

// 导出单例
export const ingestCore = new IngestCore();

/**
 * 迁移旧版数据
 */
export async function migrateLegacyData(
  fileTree: FileNode,
  options?: IngestOptions
): Promise<IngestResult> {
  const result: IngestResult = {
    success: true,
    entries: [],
    errors: [],
    warnings: ['迁移旧版数据'],
  };

  // 转换旧版节点
  const legacyNodes = flattenFileTree(fileTree);
  const entries = migrateLegacyFileNodes(legacyNodes);

  // 添加到文件抽象层
  for (const entry of entries) {
    fileAbstraction.addFileEntry(entry);
  }

  result.entries = entries;

  // 解析文件
  const opts = ingestCore.normalizeOptions(options);
  if (opts.parse) {
    const parsedEntries = await fileAbstraction.parseFiles(entries, opts.parseOptions);
    result.entries = parsedEntries;

    // 建立索引
    if (opts.index) {
      await ingestCore.buildIndex(parsedEntries);
    }
  }

  return result;
}

/**
 * 展平文件树
 */
function flattenFileTree(node: FileNode): LegacyFileNode[] {
  const nodes: LegacyFileNode[] = [];

  if (node.isFile) {
    nodes.push({
      name: node.name,
      path: node.path,
      isDirectory: false,
      isFile: true,
    });
  }

  if (node.children) {
    for (const child of node.children) {
      nodes.push(...flattenFileTree(child));
    }
  }

  return nodes;
}