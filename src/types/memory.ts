/**
 * 记忆类型定义
 * 用于Agent记忆机制：思维链捕捉、偏好学习、本地知识检索
 */

// ==================== 思维链相关类型 ====================

/**
 * 思维步骤类型
 */
export type ThoughtStepType = 'reasoning' | 'observation' | 'inference' | 'conclusion' | 'question';

/**
 * 思维步骤接口
 */
export interface ThoughtStep {
  /** 步骤编号 */
  step: number;
  /** 步骤类型 */
  type: ThoughtStepType;
  /** 思考内容 */
  thought: string;
  /** 使用的本地知识ID列表 */
  usedKnowledgeIds?: string[];
  /** 置信度 (0-1) */
  confidence: number;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 思维链接口
 */
export interface ChainOfThought {
  /** 唯一标识符 */
  id: string;
  /** 会话ID */
  sessionId: string;
  /** 用户问题 */
  question: string;
  /** 思维步骤列表 */
  steps: ThoughtStep[];
  /** 最终答案 */
  answer: string;
  /** 知识来源类型：local | external | mixed */
  knowledgeSource: 'local' | 'external' | 'mixed';
  /** 使用的本地知识数量 */
  localKnowledgeCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ==================== 偏好相关类型 ====================

/**
 * 偏好类型枚举
 */
export enum PreferenceType {
  /** 语言偏好 */
  LANGUAGE = 'language',
  /** 回答风格偏好 */
  ANSWER_STYLE = 'answer_style',
  /** 详细程度偏好 */
  DETAIL_LEVEL = 'detail_level',
  /** 专业领域偏好 */
  DOMAIN = 'domain',
  /** 交互模式偏好 */
  INTERACTION_MODE = 'interaction_mode',
  /** 技术偏好 */
  TECHNICAL_PREFERENCE = 'technical_preference',
  /** 视觉风格偏好（配色/字体/布局/密度） */
  VISUAL_STYLE = 'visual_style',
  /** 文本风格偏好（语气/句式/词汇/结构） */
  TEXTUAL_STYLE = 'textual_style',
  /** 内容风格偏好（主题/例子/数据/引用） */
  CONTENT_STYLE = 'content_style',
  /** 文档模板偏好（满意模板的类别/场景/主题） */
  TEMPLATE_PREFERENCE = 'template_preference',
}

/**
 * 用户偏好接口
 */
export interface UserPreference {
  /** 偏好类型 */
  type: PreferenceType;
  /** 偏好值 */
  value: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 学习来源 */
  learnedFrom: 'explicit' | 'implicit' | 'behavior';
  /** 学习次数 */
  learnCount: number;
  /** 最后学习时间 */
  lastLearnedAt: string;
  /** 首次学习时间 */
  firstLearnedAt: string;
  /** 上下文示例 */
  contextExamples?: string[];
}

/**
 * 用户画像接口
 */
export interface UserProfile {
  /** 用户ID */
  userId: string;
  /** 偏好列表 */
  preferences: UserPreference[];
  /** 领域知识统计 */
  domainStats: Record<string, number>;
  /** 活跃时间段 */
  activeHours: Record<string, number>;
  /** 总交互次数 */
  totalInteractions: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ==================== 记忆相关类型 ====================

/**
 * 记忆类型枚举
 */
export enum MemoryType {
  /** 思维链记忆 */
  CHAIN_OF_THOUGHT = 'chain_of_thought',
  /** 偏好记忆 */
  PREFERENCE = 'preference',
  /** 知识条目记忆 */
  KNOWLEDGE_ENTRY = 'knowledge_entry',
  /** 对话摘要记忆 */
  CONVERSATION_SUMMARY = 'conversation_summary',
}

/**
 * 记忆条目接口
 */
export interface MemoryEntry {
  /** 唯一标识符 */
  id: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆内容 */
  content: string;
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 嵌入向量 (用于语义搜索) */
  embedding?: number[];
  /** 重要性分数 (0-1) */
  importance: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessedAt: string;
  /** 创建时间 */
  createdAt: string;
  /** 过期时间 (可选) */
  expiresAt?: string;
}

/**
 * 记忆搜索结果接口
 */
export interface MemorySearchResult {
  /** 记忆条目 */
  memory: MemoryEntry;
  /** 相似度分数 (0-1) */
  similarity: number;
  /** 匹配的关键词 */
  matchedKeywords?: string[];
}

/**
 * 记忆搜索选项接口
 */
export interface MemorySearchOptions {
  /** 最大结果数 */
  maxResults?: number;
  /** 最小相似度阈值 */
  minSimilarity?: number;
  /** 是否包含思维链 */
  includeChainOfThought?: boolean;
  /** 是否包含偏好 */
  includePreferences?: boolean;
  /** 是否包含知识条目 */
  includeKnowledgeEntries?: boolean;
  /** 时间范围 (起始时间) */
  fromDate?: string;
  /** 时间范围 (结束时间) */
  toDate?: string;
}

// ==================== 本地知识检索相关类型 ====================

/**
 * 知识来源接口
 */
export interface KnowledgeSource {
  /** 来源ID */
  id: string;
  /** 来源类型 */
  type: 'local' | 'external';
  /** 来源名称 */
  name: string;
  /** 内容片段 */
  content: string;
  /** 相关性分数 (0-1) */
  relevance: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 本地知识优先检索结果接口
 */
export interface LocalKnowledgePriorityResult {
  /** 是否找到本地知识 */
  foundLocal: boolean;
  /** 本地知识列表 */
  localKnowledge: KnowledgeSource[];
  /** 外部知识列表 (如果本地不足) */
  externalKnowledge: KnowledgeSource[];
  /** 推荐策略 */
  strategy: 'local_first' | 'local_only' | 'external_fallback';
  /** 检索时间戳 */
  retrievedAt: string;
}

// ==================== 第一性原理相关类型 ====================

/**
 * 第一性原理分析步骤接口
 */
export interface FirstPrincipleStep {
  /** 步骤编号 */
  step: number;
  /** 步骤标题 */
  title: string;
  /** 基础假设 */
  assumption: string;
  /** 推理过程 */
  reasoning: string;
  /** 结论 */
  conclusion: string;
}

/**
 * 第一性原理分析结果接口
 */
export interface FirstPrincipleAnalysis {
  /** 问题 */
  question: string;
  /** 领域分类 */
  domain: string;
  /** 基础假设列表 */
  assumptions: string[];
  /** 分析步骤 */
  steps: FirstPrincipleStep[];
  /** 类比/比喻解释 */
  analogy: string;
  /** 数学抽象 */
  mathematicalAbstraction: string;
  /** LaTeX公式 */
  latexFormula?: string;
  /** 最终结论 */
  conclusion: string;
  /** 置信度 (0-1) */
  confidence: number;
}

// ==================== 记忆存储接口 ====================

/**
 * 记忆存储接口
 */
export interface MemoryStore {
  /**
   * 记录思维链
   */
  recordChainOfThought(cot: ChainOfThought): Promise<void>;

  /**
   * 获取思维链
   */
  getChainOfThought(id: string): Promise<ChainOfThought | null>;

  /**
   * 获取会话的思维链列表
   */
  getChainOfThoughtBySession(sessionId: string): Promise<ChainOfThought[]>;

  /**
   * 记录偏好
   */
  recordPreference(preference: UserPreference): Promise<void>;

  /**
   * 获取用户偏好
   */
  getPreferences(userId: string): Promise<UserPreference[]>;

  /**
   * 获取特定类型的偏好
   */
  getPreferencesByType(userId: string, type: PreferenceType): Promise<UserPreference[]>;

  /**
   * 搜索记忆
   */
  searchMemory(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;

  /**
   * 获取本地知识优先检索结果
   */
  getLocalKnowledgePriority(query: string): Promise<LocalKnowledgePriorityResult>;

  /**
   * 添加记忆条目
   */
  addMemoryEntry(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>): Promise<MemoryEntry>;

  /**
   * 更新记忆访问记录
   */
  updateMemoryAccess(id: string): Promise<void>;

  /**
   * 删除过期记忆
   */
  cleanupExpiredMemories(): Promise<number>;

  /**
   * 重置偏好学习
   */
  resetPreferences(userId: string): Promise<void>;

  /**
   * 获取用户画像
   */
  getUserProfile(userId: string): Promise<UserProfile | null>;

  /**
   * 更新用户画像
   */
  updateUserProfile(profile: UserProfile): Promise<void>;
}

// ==================== 加密相关类型 ====================

/**
 * 加密选项接口
 */
export interface EncryptionOptions {
  /** 加密算法 */
  algorithm: 'AES-256-GCM' | 'AES-256-CBC';
  /** 密钥 (32字节) */
  key: string;
  /** 初始化向量 */
  iv?: string;
}

/**
 * 加密数据接口
 */
export interface EncryptedData {
  /** 加密后的数据 (base64) */
  data: string;
  /** 初始化向量 (base64) */
  iv: string;
  /** 认证标签 (GCM模式) */
  authTag?: string;
}