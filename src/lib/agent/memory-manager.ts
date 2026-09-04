/**
 * 记忆管理模块
 * 实现记忆存储、语义搜索、本地知识优先检索
 */

import {
  MemoryType,
  PreferenceType,
  type MemoryEntry,
  type MemorySearchResult,
  type MemorySearchOptions,
  type LocalKnowledgePriorityResult,
  type KnowledgeSource,
  type ChainOfThought,
  type UserPreference,
  type UserProfile,
} from '../../types/memory';

import { PreferenceLearner } from './preference-learner';

/**
 * 记忆管理配置
 */
export interface MemoryManagerConfig {
  /** 最大记忆条目数 */
  maxMemoryEntries?: number;
  /** 默认记忆过期天数 (默认: 365天) */
  defaultExpiryDays?: number;
  /** 本地知识优先阈值 */
  localKnowledgeThreshold?: number;
  /** 语义搜索相似度阈值 */
  semanticSimilarityThreshold?: number;
}

/**
 * 知识库条目接口
 */
export interface KnowledgeEntry {
  /** 条目ID */
  id: string;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 标签列表 */
  tags: string[];
  /** 嵌入向量 */
  embedding?: number[];
  /** 来源类型 */
  sourceType: 'local' | 'external';
  /** 来源名称 */
  sourceName: string;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 嵌入服务接口
 */
export interface EmbeddingService {
  /**
   * 生成文本嵌入向量
   */
  generate(text: string): Promise<number[]>;

  /**
   * 计算向量相似度
   */
  similarity(a: number[], b: number[]): number;
}

/**
 * 默认嵌入服务 (模拟实现)
 */
class DefaultEmbeddingService implements EmbeddingService {
  async generate(text: string): Promise<number[]> {
    // 实际应用中应调用真实的嵌入模型
    // 这里返回一个模拟的向量
    const hash = this.simpleHash(text);
    const vector: number[] = [];
    for (let i = 0; i < 128; i++) {
      vector.push(Math.sin(hash * (i + 1)) * 0.5 + 0.5);
    }
    return vector;
  }

  similarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

/**
 * 记忆管理器
 */
export class MemoryManager {
  private config: Required<MemoryManagerConfig>;
  private memories: Map<string, MemoryEntry>;
  private knowledgeEntries: Map<string, KnowledgeEntry>;

  private preferenceLearner: PreferenceLearner;
  private embeddingService: EmbeddingService;

  constructor(
    config: MemoryManagerConfig = {},
    embeddingService?: EmbeddingService
  ) {
    this.config = {
      maxMemoryEntries: 1000,
      defaultExpiryDays: 365,
      localKnowledgeThreshold: 0.7,
      semanticSimilarityThreshold: 0.5,
      ...config,
    };
    this.memories = new Map();
    this.knowledgeEntries = new Map();

    this.preferenceLearner = new PreferenceLearner();
    this.embeddingService = embeddingService || new DefaultEmbeddingService();
  }

  // ==================== 思维链管理 ====================

  /**
   * 记录思维链
   */
  async recordChainOfThought(cot: ChainOfThought): Promise<void> {
    // 创建记忆条目
    const memoryEntry: MemoryEntry = {
      id: cot.id,
      type: MemoryType.CHAIN_OF_THOUGHT,
      content: JSON.stringify(cot),
      metadata: {
        question: cot.question,
        knowledgeSource: cot.knowledgeSource,
        localKnowledgeCount: cot.localKnowledgeCount,
      },
      importance: this.calculateImportance(cot),
      accessCount: 0,
      lastAccessedAt: cot.createdAt,
      createdAt: cot.createdAt,
    };

    await this.addMemoryEntry(memoryEntry);
  }

  /**
   * 获取思维链
   */
  async getChainOfThought(id: string): Promise<ChainOfThought | null> {
    const memory = this.memories.get(id);
    if (!memory || memory.type !== MemoryType.CHAIN_OF_THOUGHT) {
      return null;
    }

    this.updateMemoryAccess(id);

    try {
      return JSON.parse(memory.content) as ChainOfThought;
    } catch {
      return null;
    }
  }

  /**
   * 获取会话的思维链列表
   */
  async getChainOfThoughtBySession(
    sessionId: string
  ): Promise<ChainOfThought[]> {
    const results: ChainOfThought[] = [];

    for (const memory of this.memories.values()) {
      if (memory.type === MemoryType.CHAIN_OF_THOUGHT) {
        try {
          const cot = JSON.parse(memory.content) as ChainOfThought;
          if (cot.sessionId === sessionId) {
            results.push(cot);
            this.updateMemoryAccess(memory.id);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    return results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // ==================== 偏好管理 ====================

  /**
   * 记录偏好
   */
  async recordPreference(preference: UserPreference): Promise<void> {
    const id = `pref_${preference.type}_${preference.value}`.replace(/\s/g, '_');

    const memoryEntry: MemoryEntry = {
      id,
      type: MemoryType.PREFERENCE,
      content: JSON.stringify(preference),
      metadata: {
        type: preference.type,
        value: preference.value,
        confidence: preference.confidence,
      },
      importance: preference.confidence,
      accessCount: 0,
      lastAccessedAt: new Date().toISOString(),
      createdAt: preference.firstLearnedAt,
    };

    await this.addMemoryEntry(memoryEntry);
  }

  /**
   * 获取用户偏好
   */
  async getPreferences(): Promise<UserPreference[]> {
    const preferences: UserPreference[] = [];

    for (const memory of this.memories.values()) {
      if (memory.type === MemoryType.PREFERENCE) {
        try {
          const pref = JSON.parse(memory.content) as UserPreference;
          preferences.push(pref);
          this.updateMemoryAccess(memory.id);
        } catch {
          // 忽略解析错误
        }
      }
    }

    return preferences.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 获取特定类型的偏好
   */
  async getPreferencesByType(
    type: string
  ): Promise<UserPreference[]> {
    const allPreferences = await this.getPreferences();
    return allPreferences.filter((p) => p.type === type);
  }

  /**
   * 重置偏好
   */
  async resetPreferences(): Promise<void> {
    for (const [id, memory] of this.memories.entries()) {
      if (memory.type === MemoryType.PREFERENCE) {
        this.memories.delete(id);
      }
    }
    this.preferenceLearner.reset();
  }

  // ==================== 记忆搜索 ====================

  /**
   * 搜索记忆
   */
  async searchMemory(
    query: string,
    options?: MemorySearchOptions
  ): Promise<MemorySearchResult[]> {
    const opts = this.normalizeSearchOptions(options);
    const queryEmbedding = await this.embeddingService.generate(query);
    const results: MemorySearchResult[] = [];

    for (const memory of this.memories.values()) {
      // 过滤类型
      if (!this.filterMemoryByType(memory.type, opts)) {
        continue;
      }

      // 计算相似度
      let similarity = 0;
      // 文本相似度：用于过滤 embedding 的虚假匹配，并作为无 embedding 时的兜底
      const textSimilarity = this.calculateTextSimilarity(query, memory.content);

      if (memory.embedding) {
        similarity = this.embeddingService.similarity(
          queryEmbedding,
          memory.embedding
        );
        // 文本匹配作为过滤条件：当文本完全无关联（textSimilarity 为 0）时，
        // 即使 embedding 相似度较高也不返回结果，避免基于 hash 的模拟 embedding
        // 产生虚假匹配
        if (textSimilarity === 0) {
          continue;
        }
      } else {
        // 如果没有嵌入向量，使用文本匹配
        similarity = textSimilarity;
      }

      // 过滤低相似度结果
      if (similarity < opts.minSimilarity!) {
        continue;
      }

      results.push({
        memory,
        similarity,
        matchedKeywords: this.extractMatchedKeywords(
          query,
          memory.content
        ),
      });
    }

    // 排序并限制结果数量
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.maxResults!);
  }

  /**
   * 本地知识优先检索
   */
  async getLocalKnowledgePriority(
    query: string
  ): Promise<LocalKnowledgePriorityResult> {
    const localKnowledge: KnowledgeSource[] = [];
    const externalKnowledge: KnowledgeSource[] = [];

    // 搜索本地知识
    const searchResults = await this.searchMemory(query, {
      maxResults: 5,
      minSimilarity: this.config.semanticSimilarityThreshold,
      includeKnowledgeEntries: true,
    });

    for (const result of searchResults) {
      const source: KnowledgeSource = {
        id: result.memory.id,
        type: 'local',
        name: this.getSourceName(result.memory),
        content: result.memory.content,
        relevance: result.similarity,
      };

      if (result.memory.type === MemoryType.KNOWLEDGE_ENTRY) {
        localKnowledge.push(source);
      }
    }

    // 判断策略
    let strategy: 'local_first' | 'local_only' | 'external_fallback';

    if (localKnowledge.length >= 3) {
      strategy = 'local_only';
    } else if (localKnowledge.length > 0) {
      strategy = 'local_first';
    } else {
      strategy = 'external_fallback';
      // 这里可以添加外部搜索逻辑
    }

    // 如果本地知识不足，标记需要外部搜索
    if (localKnowledge.length < 2) {
      // 模拟外部知识
      externalKnowledge.push({
        id: 'ext_placeholder',
        type: 'external',
        name: '网络搜索',
        content: '需要调用外部搜索获取更多信息',
        relevance: 0.5,
      });
    }

    return {
      foundLocal: localKnowledge.length > 0,
      localKnowledge,
      externalKnowledge,
      strategy,
      retrievedAt: new Date().toISOString(),
    };
  }

  // ==================== 记忆条目管理 ====================

  /**
   * 添加记忆条目
   */
  async addMemoryEntry(
    entry: Omit<
      MemoryEntry,
      'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'
    >
  ): Promise<MemoryEntry> {
    // 检查容量
    if (this.memories.size >= this.config.maxMemoryEntries) {
      this.evictOldMemories();
    }

    const id = this.generateId();
    const now = new Date().toISOString();

    const memoryEntry: MemoryEntry = {
      ...entry,
      id,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
    };

    // 生成嵌入向量
    if (!memoryEntry.embedding) {
      try {
        memoryEntry.embedding = await this.embeddingService.generate(
          memoryEntry.content
        );
      } catch {
        // 忽略嵌入生成错误
      }
    }

    this.memories.set(id, memoryEntry);

    return memoryEntry;
  }

  /**
   * 更新记忆访问记录
   */
  async updateMemoryAccess(id: string): Promise<void> {
    const memory = this.memories.get(id);
    if (memory) {
      memory.accessCount++;
      memory.lastAccessedAt = new Date().toISOString();
    }
  }

  /**
   * 删除过期记忆
   */
  async cleanupExpiredMemories(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;

    for (const [id, memory] of this.memories.entries()) {
      if (memory.expiresAt) {
        const expiryDate = new Date(memory.expiresAt);
        if (expiryDate < now) {
          this.memories.delete(id);
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  /**
   * 获取用户画像
   */
  async getUserProfile(): Promise<UserProfile | null> {
    const preferences = await this.getPreferences();

    if (preferences.length === 0) {
      return null;
    }

    const now = new Date().toISOString();

    // 展开偏好：learnCount=N 的偏好展开为 N 条独立学习记录
    // 这样用户画像反映每次学习事件，而非去重后的偏好
    const expandedPreferences: UserPreference[] = [];
    for (const pref of preferences) {
      for (let i = 0; i < pref.learnCount; i++) {
        expandedPreferences.push({ ...pref, learnCount: 1 });
      }
    }

    // 计算领域统计
    const domainStats: Record<string, number> = {};
    for (const pref of expandedPreferences) {
      if (pref.type === PreferenceType.DOMAIN) {
        domainStats[pref.value] = (domainStats[pref.value] || 0) + pref.learnCount;
      }
    }

    return {
      userId: 'user',
      preferences: expandedPreferences,
      domainStats,
      activeHours: {},
      totalInteractions: expandedPreferences.reduce(
        (sum, p) => sum + p.learnCount,
        0
      ),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 更新用户画像
   */
  async updateUserProfile(profile: UserProfile): Promise<void> {
    for (const pref of profile.preferences) {
      await this.recordPreference(pref);
    }
  }

  // ==================== 知识库管理 ====================

  /**
   * 添加知识条目
   */
  async addKnowledgeEntry(entry: KnowledgeEntry): Promise<void> {
    this.knowledgeEntries.set(entry.id, entry);

    // 创建对应的记忆条目
    const memoryEntry: Omit<
      MemoryEntry,
      'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'
    > = {
      type: MemoryType.KNOWLEDGE_ENTRY,
      content: entry.content,
      metadata: {
        title: entry.title,
        tags: entry.tags,
        sourceType: entry.sourceType,
        sourceName: entry.sourceName,
      },
      importance: 0.5,
      embedding: entry.embedding,
    };

    await this.addMemoryEntry(memoryEntry);
  }

  /**
   * 获取知识条目
   */
  getKnowledgeEntry(id: string): KnowledgeEntry | undefined {
    return this.knowledgeEntries.get(id);
  }

  /**
   * 搜索知识库
   */
  async searchKnowledge(query: string): Promise<KnowledgeEntry[]> {
    const queryEmbedding = await this.embeddingService.generate(query);
    const results: Array<{ entry: KnowledgeEntry; similarity: number }> = [];

    for (const entry of this.knowledgeEntries.values()) {
      let similarity = 0;

      // 嵌入向量相似度
      if (entry.embedding) {
        similarity = Math.max(
          similarity,
          this.embeddingService.similarity(queryEmbedding, entry.embedding)
        );
      }

      // 文本匹配（内容）作为补充，确保无 embedding 时也能命中
      similarity = Math.max(
        similarity,
        this.calculateTextSimilarity(query, entry.content)
      );

      // 标题匹配作为补充
      similarity = Math.max(
        similarity,
        this.calculateTextSimilarity(query, entry.title)
      );

      if (similarity >= this.config.semanticSimilarityThreshold) {
        results.push({ entry, similarity });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .map((r) => r.entry);
  }

  // ==================== 私有方法 ====================

  /**
   * 计算记忆重要性
   */
  private calculateImportance(cot: ChainOfThought): number {
    let importance = 0.5;

    // 本地知识越多，重要性越高
    importance += Math.min(
      0.3,
      cot.localKnowledgeCount * 0.1
    );

    // 步骤越多，说明问题越复杂，重要性越高
    importance += Math.min(
      0.2,
      (cot.steps.length - 2) * 0.05
    );

    return Math.min(1, importance);
  }

  /**
   * 标准化搜索选项
   */
  private normalizeSearchOptions(
    options?: MemorySearchOptions
  ): Required<MemorySearchOptions> {
    return {
      maxResults: options?.maxResults ?? 10,
      minSimilarity: options?.minSimilarity ?? this.config.semanticSimilarityThreshold,
      includeChainOfThought: options?.includeChainOfThought ?? true,
      includePreferences: options?.includePreferences ?? true,
      includeKnowledgeEntries: options?.includeKnowledgeEntries ?? true,
      fromDate: options?.fromDate ?? '',
      toDate: options?.toDate ?? '',
    };
  }

  /**
   * 过滤记忆类型
   */
  private filterMemoryByType(
    type: MemoryType,
    options: Required<MemorySearchOptions>
  ): boolean {
    if (type === MemoryType.CHAIN_OF_THOUGHT && !options.includeChainOfThought) {
      return false;
    }
    if (type === MemoryType.PREFERENCE && !options.includePreferences) {
      return false;
    }
    if (type === MemoryType.KNOWLEDGE_ENTRY && !options.includeKnowledgeEntries) {
      return false;
    }
    return true;
  }

  /**
   * 计算文本相似度
   * 支持空格分词（英文）与子串匹配（中文/无空格文本）两种策略
   */
  private calculateTextSimilarity(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // 中文/无空格文本：子串匹配兜底
    // 当 query 整体作为子串出现在 text 中时，认为存在语义关联
    if (queryLower.length > 1 && textLower.includes(queryLower)) {
      return Math.max(0.5, queryLower.length / textLower.length);
    }

    // 空格分词匹配（适用于英文/有空格的文本）
    const queryWords = new Set(
      queryLower
        .split(/\s+/)
        .filter((w) => w.length > 1)
    );
    const textWords = new Set(
      textLower
        .split(/\s+/)
        .filter((w) => w.length > 1)
    );

    let intersection = 0;
    for (const word of queryWords) {
      if (textWords.has(word)) {
        intersection++;
      }
    }

    if (queryWords.size === 0) {
      return 0;
    }

    return intersection / queryWords.size;
  }

  /**
   * 提取匹配的关键词
   */
  private extractMatchedKeywords(query: string, text: string): string[] {
    const queryWords = new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    const textLower = text.toLowerCase();
    const matched: string[] = [];

    for (const word of queryWords) {
      if (textLower.includes(word)) {
        matched.push(word);
      }
    }

    return matched;
  }

  /**
   * 获取来源名称
   */
  private getSourceName(memory: MemoryEntry): string {
    if (memory.metadata?.sourceName) {
      return memory.metadata.sourceName as string;
    }
    switch (memory.type) {
      case MemoryType.CHAIN_OF_THOUGHT:
        return '思维链记忆';
      case MemoryType.PREFERENCE:
        return '偏好记忆';
      case MemoryType.KNOWLEDGE_ENTRY:
        return '知识条目';
      case MemoryType.CONVERSATION_SUMMARY:
        return '对话摘要';
      default:
        return '未知来源';
    }
  }

  /**
   * 淘汰旧记忆
   */
  private evictOldMemories(): void {
    const memories = Array.from(this.memories.entries());

    // 按重要性和访问频率排序，删除最不重要的
    memories.sort((a, b) => {
      const aScore = this.calculateMemoryScore(a[1]);
      const bScore = this.calculateMemoryScore(b[1]);
      return aScore - bScore;
    });

    // 删除前10%的记忆
    const deleteCount = Math.ceil(memories.length * 0.1);
    for (let i = 0; i < deleteCount; i++) {
      this.memories.delete(memories[i][0]);
    }
  }

  /**
   * 计算记忆得分
   */
  private calculateMemoryScore(memory: MemoryEntry): number {
    let score = memory.importance;

    // 访问频率
    score += Math.min(0.2, memory.accessCount * 0.02);

    // 时间衰减
    const daysSinceAccess =
      (Date.now() - new Date(memory.lastAccessedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    score *= Math.exp(-daysSinceAccess / 30);

    return score;
  }

  /**
   * 生成ID
   */
  private generateId(): string {
    return `mem_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
  }
}

/**
 * 创建默认的记忆管理器
 */
export function createMemoryManager(
  config?: MemoryManagerConfig,
  embeddingService?: EmbeddingService
): MemoryManager {
  return new MemoryManager(config, embeddingService);
}