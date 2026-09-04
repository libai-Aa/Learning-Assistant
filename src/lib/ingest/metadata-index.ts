/**
 * 元数据索引服务
 * 提供全文搜索和元数据管理功能
 */

import { FileEntry, KnowledgeType } from '../../types/knowledge';

/**
 * 索引文档接口
 */
export interface IndexDocument {
  id: string;
  title: string;
  content: string;
  format: string;
  type: KnowledgeType;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  id: string;
  score: number;
  document: IndexDocument;
  highlights?: string[];
}

/**
 * 元数据索引接口
 */
export interface MetadataIndex {
  index(doc: IndexDocument): Promise<void>;
  indexBatch(docs: IndexDocument[]): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  filter?: {
    type?: KnowledgeType[];
    format?: string[];
    dateRange?: {
      start?: string;
      end?: string;
    };
  };
}

/**
 * 简单的内存索引实现
 * 后续可替换为Meilisearch或Elasticsearch
 */
export class InMemoryIndex implements MetadataIndex {
  private documents: Map<string, IndexDocument> = new Map();
  private searchIndex: Map<string, Set<string>> = new Map(); // token -> doc ids

  async index(doc: IndexDocument): Promise<void> {
    this.documents.set(doc.id, doc);
    this.buildIndex(doc);
  }

  async indexBatch(docs: IndexDocument[]): Promise<void> {
    for (const doc of docs) {
      await this.index(doc);
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const tokens = this.tokenize(query);
    const limit = options?.limit || 10;
    const offset = options?.offset || 0;

    // 计算每个文档的得分
    const scores = new Map<string, number>();

    for (const token of tokens) {
      const docIds = this.searchIndex.get(token);
      if (docIds) {
        for (const docId of docIds) {
          scores.set(docId, (scores.get(docId) || 0) + 1);
        }
      }
    }

    // 排序并返回结果
    const results: SearchResult[] = Array.from(scores.entries())
      .map(([id, score]) => ({
        id,
        score,
        document: this.documents.get(id)!,
      }))
      .sort((a, b) => b.score - a.score);

    // 应用过滤
    const filtered = this.applyFilters(results, options?.filter);

    // 应用分页
    return filtered.slice(offset, offset + limit);
  }

  async remove(id: string): Promise<void> {
    this.documents.delete(id);
    // 从索引中移除
    for (const [token, docIds] of this.searchIndex) {
      docIds.delete(id);
      if (docIds.size === 0) {
        this.searchIndex.delete(token);
      }
    }
  }

  async clear(): Promise<void> {
    this.documents.clear();
    this.searchIndex.clear();
  }

  /**
   * 构建索引
   */
  private buildIndex(doc: IndexDocument): void {
    const text = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`;
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      if (!this.searchIndex.has(token)) {
        this.searchIndex.set(token, new Set());
      }
      this.searchIndex.get(token)!.add(doc.id);
    }
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    // 简单的空格和标点分词，后续可替换为中文分词器
    return text.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  /**
   * 应用过滤
   */
  private applyFilters(results: SearchResult[], filter?: SearchOptions['filter']): SearchResult[] {
    if (!filter) return results;

    return results.filter(result => {
      if (filter.type && !filter.type.includes(result.document.type)) {
        return false;
      }
      if (filter.format && !filter.format.includes(result.document.format)) {
        return false;
      }
      if (filter.dateRange) {
        const docDate = new Date(result.document.createdAt);
        if (filter.dateRange.start && docDate < new Date(filter.dateRange.start)) {
          return false;
        }
        if (filter.dateRange.end && docDate > new Date(filter.dateRange.end)) {
          return false;
        }
      }
      return true;
    });
  }
}

// 导出单例
export const metadataIndex = new InMemoryIndex();

/**
 * 将FileEntry转换为IndexDocument
 */
export function convertToFileEntryDocument(entry: FileEntry): IndexDocument {
  return {
    id: entry.id,
    title: entry.metadata.title || entry.name,
    content: entry.content?.text || '',
    format: entry.format,
    type: entry.type,
    tags: entry.metadata.tags || [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}