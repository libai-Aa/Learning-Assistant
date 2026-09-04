/**
 * 解析器接口定义
 * 所有格式解析器必须实现此接口
 */

import type { ParseOptions, ParseResult } from '../../types/knowledge';

/**
 * 格式解析器接口
 * 定义了解析器的基本契约，所有具体解析器必须实现此接口
 */
export interface FormatParser {
  /** 解析器名称 */
  readonly name: string;
  
  /** 支持的文件扩展名列表 (不含点号，如: ['pdf', 'PDF']) */
  readonly supportedExtensions: string[];
  
  /** 支持的MIME类型列表 */
  readonly supportedMimeTypes: string[];
  
  /**
   * 解析文件
   * @param filePath 文件路径
   * @param options 解析选项
   * @returns 解析结果
   */
  parse(filePath: string, options?: ParseOptions): Promise<ParseResult>;
  
  /**
   * 检查是否支持该文件
   * @param filePath 文件路径
   * @param mimeType MIME类型 (可选)
   * @returns 是否支持
   */
  supports(filePath: string, mimeType?: string): boolean;
}

/**
 * 基础解析器抽象类
 * 提供通用的工具方法，具体解析器可继承此类
 */
export abstract class BaseParser implements FormatParser {
  abstract readonly name: string;
  abstract readonly supportedExtensions: string[];
  abstract readonly supportedMimeTypes: string[];
  
  abstract parse(filePath: string, options?: ParseOptions): Promise<ParseResult>;
  
  /**
   * 检查文件扩展名是否支持
   */
  supports(filePath: string, mimeType?: string): boolean {
    const ext = this.getFileExtension(filePath);
    if (this.supportedExtensions.map(e => e.toLowerCase()).includes(ext.toLowerCase())) {
      return true;
    }
    
    if (mimeType && this.supportedMimeTypes.includes(mimeType)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 获取文件扩展名
   */
  protected getFileExtension(filePath: string): string {
    const parts = filePath.split('.');
    if (parts.length > 1) {
      return parts[parts.length - 1].toLowerCase();
    }
    return '';
  }
  
  /**
   * 创建成功的解析结果
   */
  protected createSuccessResult(
    content: string,
    metadata?: Record<string, unknown>,
    warnings?: string[]
  ): ParseResult {
    return {
      success: true,
      content: {
        text: content,
        ...metadata,
      },
      metadata: metadata as ParseResult['metadata'],
      warnings,
    };
  }
  
  /**
   * 创建失败的解析结果
   */
  protected createErrorResult(error: string, warnings?: string[]): ParseResult {
    return {
      success: false,
      error,
      warnings,
    };
  }
}

/**
 * 解析器优先级
 */
export enum ParserPriority {
  LOW = 10,
  NORMAL = 50,
  HIGH = 100,
}

/**
 * 解析器注册信息
 */
export interface ParserRegistration {
  /** 解析器实例 */
  parser: FormatParser;
  /** 优先级 */
  priority: ParserPriority;
}

/**
 * 解析器注册表
 * 管理所有格式解析器的注册和查找
 */
export class ParserRegistry {
  private parsers: Map<string, ParserRegistration> = new Map();
  private sortedParsers: FormatParser[] = [];
  
  /**
   * 注册解析器
   * @param parser 解析器实例
   * @param priority 优先级
   */
  register(parser: FormatParser, priority: ParserPriority = ParserPriority.NORMAL): void {
    this.parsers.set(parser.name, { parser, priority });
    this.rebuildSortedParsers();
    console.log(`[ParserRegistry] 注册解析器: ${parser.name}`);
  }
  
  /**
   * 注销解析器
   * @param name 解析器名称
   */
  unregister(name: string): boolean {
    const deleted = this.parsers.delete(name);
    if (deleted) {
      this.rebuildSortedParsers();
      console.log(`[ParserRegistry] 注销解析器: ${name}`);
    }
    return deleted;
  }
  
  /**
   * 获取支持该文件的解析器
   * @param filePath 文件路径
   * @param mimeType MIME类型
   * @returns 解析器或null
   */
  getParser(filePath: string, mimeType?: string): FormatParser | null {
    for (const parser of this.sortedParsers) {
      if (parser.supports(filePath, mimeType)) {
        return parser;
      }
    }
    return null;
  }
  
  /**
   * 按名称获取解析器
   * @param name 解析器名称
   * @returns 解析器或null
   */
  getParserByName(name: string): FormatParser | null {
    const reg = this.parsers.get(name);
    return reg ? reg.parser : null;
  }
  
  /**
   * 获取所有解析器
   * @returns 解析器列表
   */
  getAllParsers(): FormatParser[] {
    return [...this.sortedParsers];
  }
  
  /**
   * 获取所有支持的扩展名
   */
  getAllExtensions(): string[] {
    const extensions = new Set<string>();
    for (const { parser } of this.parsers.values()) {
      parser.supportedExtensions.forEach(ext => extensions.add(ext));
    }
    return Array.from(extensions);
  }
  
  /**
   * 获取所有支持的MIME类型
   */
  getAllMimeTypes(): string[] {
    const mimeTypes = new Set<string>();
    for (const { parser } of this.parsers.values()) {
      parser.supportedMimeTypes.forEach(mime => mimeTypes.add(mime));
    }
    return Array.from(mimeTypes);
  }
  
  /**
   * 重建排序后的解析器列表
   */
  private rebuildSortedParsers(): void {
    this.sortedParsers = Array.from(this.parsers.values())
      .sort((a, b) => b.priority - a.priority)
      .map(reg => reg.parser);
  }
}

// 导出单例
export const parserRegistry = new ParserRegistry();