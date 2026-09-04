/**
 * 探索记录系统
 *
 * @description 贯穿始终记录探索想法、试错经验的系统。
 *   不是干巴巴的日记，而是有思考深度、记录想法演变与试错教训的探索日志。
 *
 * 设计原则：
 * - 鼓励深度思考：每条记录都鼓励写反思（元认知）
 * - 支持回溯：可以关联到之前的记录，建立"思路转变"追溯链
 * - 可视化：时间线直观展示探索过程
 * - 可搜索：方便后续回顾和知识提取
 *
 * 复用 P8 已定义的 ExplorationEntryType / ExplorationEntryTypeStyles
 * （见 src/types/experiment-report.ts），并扩展 metadata 字段以承载
 * 任务要求的"方法、资源、置信度、情绪状态"等元信息。
 *
 * @module src/lib/research/exploration-log
 */

import type {
  ExplorationEntryType,
  ExplorationEntry as BaseExplorationEntry,
  ExplorationEntryFilter,
  ExplorationEntryStats,
} from '../../types/experiment-report';


// ============ 扩展类型定义 ============

/**
 * 探索记录元数据
 *
 * 承载任务要求的方法、资源、置信度、情绪状态等元信息。
 * 这些字段是可选的，记录者按需填写，避免强制负担。
 */
export interface ExplorationEntryMetadata {
  /** 使用的方法（如"苏格拉底提问法"、"对照实验"） */
  methodUsed?: string;
  /** 使用的资源（如"AMiner"、"Arxiv"、"本地知识库"） */
  resourcesUsed?: string[];
  /** 置信度 (0-1)：记录者对当前想法/结论的自信程度 */
  confidenceLevel?: number;
  /** 情绪状态（如"兴奋"、"困惑"、"沮丧"、"顿悟"） */
  emotionalState?: string;
}

/**
 * 探索记录条目（扩展自 P8 的 ExplorationEntry）
 *
 * 在 P8 定义的基础上新增：
 * - metadata：方法/资源/置信度/情绪状态等元信息
 * - relatedEntries：支持关联多个先前记录（P8 仅支持单个 relatedEntryId）
 *
 * 注意：保留 P8 的 relatedEntryId 以兼容实验报告系统，
 * relatedEntries 是更丰富的多关联版本。
 */
export interface ExplorationEntry extends BaseExplorationEntry {
  /** 元数据：方法、资源、置信度、情绪状态等 */
  metadata?: ExplorationEntryMetadata;
  /** 关联的其他记录ID列表（多关联版本，relatedEntryId 是其单关联退化） */
  relatedEntries?: string[];
}

/** 创建探索记录输入 */
export interface CreateExplorationEntryInput {
  reportId: string;
  type: ExplorationEntryType;
  title: string;
  content: string;
  reflection?: string;
  relatedEntryId?: string;
  relatedEntries?: string[];
  evidenceId?: string;
  tools?: string[];
  durationMinutes?: number;
  tags?: string[];
  metadata?: ExplorationEntryMetadata;
}

/** 更新探索记录输入 */
export interface UpdateExplorationEntryInput {
  type?: ExplorationEntryType;
  title?: string;
  content?: string;
  reflection?: string;
  relatedEntryId?: string;
  relatedEntries?: string[];
  evidenceId?: string;
  tools?: string[];
  durationMinutes?: number;
  tags?: string[];
  metadata?: Partial<ExplorationEntryMetadata>;
}

// ============ 记录模板 ============

/**
 * 记录模板：帮助用户快速记录
 *
 * 每个模板提供标题占位符与内容骨架，引导用户写出有思考深度的记录，
 * 而不是干巴巴的"今天做了X"。
 */
export interface ExplorationTemplate {
  /** 模板对应的记录类型 */
  type: ExplorationEntryType;
  /** 模板名称 */
  name: string;
  /** 标题占位符 */
  titlePlaceholder: string;
  /** 内容骨架（含引导提示） */
  contentTemplate: string;
  /** 反思骨架（可选，鼓励元认知） */
  reflectionTemplate?: string;
}

/** 内置记录模板：覆盖主要记录类型 */
export const EXPLORATION_TEMPLATES: Record<ExplorationEntryType, ExplorationTemplate> = {
  idea: {
    type: 'idea',
    name: '想法',
    titlePlaceholder: '一句话概括这个想法',
    contentTemplate:
      '我突然想到……\n\n这个想法的起因是（什么触发了它）：\n\n如果这个想法成立，那么（可推论的结论）：\n\n它和已有知识/假设的关系：',
    reflectionTemplate: '这个想法值得追吗？为什么？',
  },
  attempt: {
    type: 'attempt',
    name: '尝试',
    titlePlaceholder: '尝试了什么方法',
    contentTemplate:
      '我尝试了……\n\n具体做法（步骤/配置/参数）：\n\n结果是（数据/现象）：\n\n与预期的对比：',
    reflectionTemplate: '这个结果说明了什么？方法本身有没有问题？',
  },
  discovery: {
    type: 'discovery',
    name: '发现',
    titlePlaceholder: '发现了什么',
    contentTemplate:
      '我发现了一个有趣的现象……\n\n具体观察（数据/事实）：\n\n这个现象为什么值得关注：\n\n它可能暗示了什么：',
    reflectionTemplate: '这是真发现还是我之前的盲区？',
  },
  setback: {
    type: 'setback',
    name: '挫折',
    titlePlaceholder: '哪个方法走不通',
    contentTemplate:
      '这个方法行不通，因为……\n\n失败的具体表现：\n\n根本原因分析（5why）：\n\n下次可以怎么避免：',
    reflectionTemplate: '这个挫折里有没有藏着新的方向？',
  },
  breakthrough: {
    type: 'breakthrough',
    name: '突破',
    titlePlaceholder: '关键突破点',
    contentTemplate:
      '关键突破！我发现了……\n\n突破的具体内容：\n\n为什么这是"突破"而非普通进展：\n\n它打开了什么新可能：',
    reflectionTemplate: '这个突破可以推广到哪些其他场景？',
  },
  reflection: {
    type: 'reflection',
    name: '反思',
    titlePlaceholder: '回顾哪一步',
    contentTemplate:
      '回顾这一步，我学到的是……\n\n当时的判断依据：\n\n现在的重新理解：\n\n如果重来一次会怎么做：',
    reflectionTemplate: '这个反思会改变我接下来的策略吗？',
  },
  pivot: {
    type: 'pivot',
    name: '转向',
    titlePlaceholder: '从什么转向什么',
    contentTemplate:
      '我决定从……转向……\n\n触发转向的关键事件/证据：\n\n新旧思路的根本差异：\n\n转向后保留的、放弃的分别是什么：',
    reflectionTemplate: '这次转向是反应式逃避还是理性选择？',
  },
  evidence_support: {
    type: 'evidence_support',
    name: '支持证据',
    titlePlaceholder: '什么证据支持假设',
    contentTemplate:
      '发现支持假设的证据……\n\n证据内容（数据/引用/观察）：\n\n证据来源与可信度：\n\n它支持假设的哪一部分：',
    reflectionTemplate: '这个证据有没有反例或边界条件？',
  },
  evidence_against: {
    type: 'evidence_against',
    name: '反对证据',
    titlePlaceholder: '什么证据反对假设',
    contentTemplate:
      '发现反对假设的证据……\n\n证据内容（数据/引用/反例）：\n\n证据来源与可信度：\n\n它反驳假设的哪一部分：\n\n这是否足以证伪整个假设？',
    reflectionTemplate: '面对反证，是修正假设还是放弃假设？',
  },
  question: {
    type: 'question',
    name: '新问题',
    titlePlaceholder: '冒出的新疑问',
    contentTemplate:
      '探索中冒出一个新问题……\n\n问题本身：\n\n为什么这个问题重要（关联到哪个判断）：\n\n可能的回答方向：',
    reflectionTemplate: '这个问题值得现在追，还是先记下来？',
  },
  note: {
    type: 'note',
    name: '备注',
    titlePlaceholder: '辅助备注',
    contentTemplate: '备注：……\n\n（辅助性记录，不强制反思）',
  },
};

/** 获取所有模板列表（按类型顺序） */
export function getAllTemplates(): ExplorationTemplate[] {
  return Object.values(EXPLORATION_TEMPLATES);
}

/** 获取指定类型的模板 */
export function getTemplate(type: ExplorationEntryType): ExplorationTemplate {
  return EXPLORATION_TEMPLATES[type];
}

// ============ 探索模式分析 ============

/**
 * 探索高峰与低谷
 *
 * 高峰：突破、发现、支持证据密集的时段
 * 低谷：挫折、反对证据密集的时段
 */
export interface ExplorationPeak {
  /** 时间点 */
  timestamp: string;
  /** 是高峰还是低谷 */
  kind: 'peak' | 'valley';
  /** 该时段的记录数 */
  entryCount: number;
  /** 该时段的记录ID */
  entryIds: string[];
  /** 描述 */
  description: string;
}

/**
 * 探索效率分析
 *
 * 衡量"想法→尝试→发现"链条的转化效率。
 * 高效探索应当有合理的 idea:attempt:discovery 比例，
 * 而不是只产生想法不验证，或只盲目尝试不沉淀发现。
 */
export interface ExplorationEfficiency {
  /** 想法数 */
  ideaCount: number;
  /** 尝试数 */
  attemptCount: number;
  /** 发现数 */
  discoveryCount: number;
  /** 想法→尝试转化率（attempt/idea） */
  ideaToAttemptRatio: number;
  /** 尝试→发现转化率（discovery/attempt） */
  attemptToDiscoveryRatio: number;
  /** 整体效率评分 (0-1)：综合两个转化率 */
  overallScore: number;
  /** 诊断建议 */
  suggestions: string[];
}

/**
 * 试错模式
 *
 * 识别探索过程中反复出现的"尝试-挫折-转向"循环等模式。
 */
export interface TrialErrorPattern {
  /** 模式名称 */
  name: string;
  /** 模式描述 */
  description: string;
  /** 涉及的记录ID */
  entryIds: string[];
  /** 出现次数 */
  occurrences: number;
}

/**
 * 探索模式分析结果
 */
export interface ExplorationPatternAnalysis {
  /** 类型分布 */
  typeDistribution: Record<ExplorationEntryType, number>;
  /** 高峰与低谷 */
  peaksAndValleys: ExplorationPeak[];
  /** 探索效率 */
  efficiency: ExplorationEfficiency;
  /** 试错模式 */
  trialErrorPatterns: TrialErrorPattern[];
  /** 平均置信度（若有 metadata.confidenceLevel） */
  averageConfidence: number;
  /** 情绪轨迹（按时间排序的情绪状态序列） */
  emotionalTrajectory: Array<{ timestamp: string; emotion: string; entryId: string }>;
}

// ============ 探索摘要 ============

/** 探索摘要：对一个报告的探索过程生成叙事性总结 */
export interface ExplorationSummary {
  /** 报告ID */
  reportId: string;
  /** 总记录数 */
  totalEntries: number;
  /** 探索时间跨度（分钟） */
  totalDurationMinutes: number;
  /** 关键转折点 */
  turningPoints: ExplorationEntry[];
  /** 主要发现 */
  keyDiscoveries: ExplorationEntry[];
  /** 主要挫折 */
  majorSetbacks: ExplorationEntry[];
  /** 叙事性总结文本 */
  narrative: string;
  /** 类型分布 */
  typeDistribution: Record<ExplorationEntryType, number>;
}

// ============ 探索记录管理器 ============

/**
 * 探索记录管理器配置
 */
export interface ExplorationLogManagerConfig {
  /** 时间窗口大小（分钟），用于识别高峰/低谷，默认 30 */
  peakWindowMinutes: number;
  /** 高峰/低谷的记录数阈值，默认 3 */
  peakThreshold: number;
  /** 是否启用情绪轨迹追踪，默认 true */
  trackEmotion: boolean;
}

const DEFAULT_CONFIG: ExplorationLogManagerConfig = {
  peakWindowMinutes: 30,
  peakThreshold: 3,
  trackEmotion: true,
};

/**
 * 探索记录管理器
 *
 * 核心职责：
 * 1. 记录的增删改查（按类型/时间/关键词）
 * 2. 生成探索摘要、提取关键转折点
 * 3. 分析探索模式（高峰低谷、效率、试错模式）
 *
 * 设计上不依赖具体存储后端，所有记录保存在内存 Map 中，
 * 上层（如 store）可负责持久化。这样便于单元测试与多后端适配。
 */
export class ExplorationLogManager {
  private readonly entries: Map<string, ExplorationEntry> = new Map();
  private readonly config: ExplorationLogManagerConfig;

  constructor(config?: Partial<ExplorationLogManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========== 增删改查 ==========

  /**
   * 添加探索记录
   *
   * 自动生成 id / createdAt / updatedAt，
   * 并保证 relatedEntryId 与 relatedEntries 的一致性。
   */
  addEntry(input: CreateExplorationEntryInput): ExplorationEntry {
    const id = this.generateId();
    const now = new Date().toISOString();

    // 同步 relatedEntryId 与 relatedEntries
    const relatedEntries = this.normalizeRelations(
      input.relatedEntries,
      input.relatedEntryId
    );

    const entry: ExplorationEntry = {
      id,
      reportId: input.reportId,
      type: input.type,
      title: input.title,
      content: input.content,
      reflection: input.reflection,
      relatedEntryId: input.relatedEntryId,
      relatedEntries: relatedEntries.length > 0 ? relatedEntries : undefined,
      evidenceId: input.evidenceId,
      tools: input.tools,
      durationMinutes: input.durationMinutes,
      tags: input.tags,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.entries.set(id, entry);
    return entry;
  }

  /**
   * 更新探索记录
   *
   * 仅更新提供的字段，updatedAt 自动刷新。
   * metadata 采用浅合并，避免覆盖未提供的子字段。
   */
  updateEntry(id: string, updates: UpdateExplorationEntryInput): ExplorationEntry | undefined {
    const existing = this.entries.get(id);
    if (!existing) return undefined;

    const relatedEntries = this.normalizeRelations(
      updates.relatedEntries,
      updates.relatedEntryId ?? existing.relatedEntryId
    );

    const mergedMetadata: ExplorationEntryMetadata | undefined =
      updates.metadata || existing.metadata
        ? {
            ...existing.metadata,
            ...updates.metadata,
          }
        : undefined;

    const updated: ExplorationEntry = {
      ...existing,
      ...updates,
      metadata: mergedMetadata,
      relatedEntries: relatedEntries.length > 0 ? relatedEntries : existing.relatedEntries,
      updatedAt: new Date().toISOString(),
    };

    this.entries.set(id, updated);
    return updated;
  }

  /** 删除探索记录 */
  deleteEntry(id: string): boolean {
    return this.entries.delete(id);
  }

  /** 获取单条记录 */
  getEntry(id: string): ExplorationEntry | undefined {
    return this.entries.get(id);
  }

  /** 获取报告下所有记录（按时间正序） */
  getEntriesByReport(reportId: string): ExplorationEntry[] {
    return this.filterEntries({}).filter((e) => e.reportId === reportId);
  }

  /**
   * 按类型查询
   * @param reportId 报告ID（可选，不传则查所有报告）
   */
  getEntriesByType(type: ExplorationEntryType, reportId?: string): ExplorationEntry[] {
    return this.getAllEntries().filter(
      (e) => e.type === type && (reportId === undefined || e.reportId === reportId)
    );
  }

  /**
   * 按时间范围查询
   * @param reportId 报告ID
   * @param from 起始时间（含）
   * @param to 结束时间（含）
   */
  getEntriesByTimeRange(
    reportId: string,
    from: Date | string,
    to: Date | string
  ): ExplorationEntry[] {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    return this.getEntriesByReport(reportId).filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= fromMs && t <= toMs;
    });
  }

  /**
   * 按关键词搜索
   *
   * 在 title / content / reflection / tags 中模糊匹配。
   * 大小写不敏感，支持中文。
   */
  searchEntries(reportId: string, keyword: string): ExplorationEntry[] {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return this.getEntriesByReport(reportId);
    return this.getEntriesByReport(reportId).filter((e) => {
      const haystack = [
        e.title,
        e.content,
        e.reflection ?? '',
        ...(e.tags ?? []),
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(kw);
    });
  }

  /**
   * 通用过滤：支持 ExplorationEntryFilter
   */
  filterEntries(filter: ExplorationEntryFilter): ExplorationEntry[] {
    let result = this.getAllEntries();

    if (filter.type !== undefined) {
      result = result.filter((e) => e.type === filter.type);
    }
    if (filter.types !== undefined && filter.types.length > 0) {
      const typeSet = new Set(filter.types);
      result = result.filter((e) => typeSet.has(e.type));
    }
    if (filter.keyword !== undefined) {
      const kw = filter.keyword.toLowerCase();
      result = result.filter((e) =>
        [e.title, e.content, e.reflection ?? '', ...(e.tags ?? [])]
          .join('\n')
          .toLowerCase()
          .includes(kw)
      );
    }
    if (filter.dateFrom !== undefined) {
      const fromMs = new Date(filter.dateFrom).getTime();
      result = result.filter((e) => new Date(e.createdAt).getTime() >= fromMs);
    }
    if (filter.dateTo !== undefined) {
      const toMs = new Date(filter.dateTo).getTime();
      result = result.filter((e) => new Date(e.createdAt).getTime() <= toMs);
    }
    if (filter.tag !== undefined) {
      result = result.filter((e) => (e.tags ?? []).includes(filter.tag!));
    }

    return result;
  }

  /** 获取所有记录（按创建时间正序） */
  getAllEntries(): ExplorationEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  // ========== 摘要与转折点 ==========

  /**
   * 生成探索摘要
   *
   * 输出叙事性文本，而非干巴巴的统计数字。
   * 例如："这次探索共经历5次尝试、2次挫折，最终在3次突破后确认了假设。"
   */
  generateSummary(reportId: string): ExplorationSummary {
    const entries = this.getEntriesByReport(reportId);
    const typeDistribution = this.computeTypeDistribution(entries);
    const totalDurationMinutes = entries.reduce(
      (sum, e) => sum + (e.durationMinutes ?? 0),
      0
    );

    const turningPoints = entries.filter(
      (e) => e.type === 'pivot' || e.type === 'breakthrough'
    );
    const keyDiscoveries = entries.filter(
      (e) => e.type === 'discovery' || e.type === 'evidence_support'
    );
    const majorSetbacks = entries.filter(
      (e) => e.type === 'setback' || e.type === 'evidence_against'
    );

    const narrative = this.buildNarrative(
      entries.length,
      typeDistribution,
      turningPoints.length,
      keyDiscoveries.length,
      majorSetbacks.length,
      totalDurationMinutes
    );

    return {
      reportId,
      totalEntries: entries.length,
      totalDurationMinutes,
      turningPoints,
      keyDiscoveries,
      majorSetbacks,
      narrative,
      typeDistribution,
    };
  }

  /**
   * 提取关键转折点
   *
   * 转折点 = pivot（转向）+ breakthrough（突破），
   * 这些是探索路径上"如果错过就讲不清来龙去脉"的关键节点。
   */
  extractTurningPoints(reportId: string): ExplorationEntry[] {
    return this.getEntriesByReport(reportId).filter(
      (e) => e.type === 'pivot' || e.type === 'breakthrough'
    );
  }

  // ========== 模式分析 ==========

  /**
   * 分析探索模式
   *
   * 综合：类型分布、高峰低谷、效率、试错模式、置信度、情绪轨迹。
   */
  analyzePatterns(reportId: string): ExplorationPatternAnalysis {
    const entries = this.getEntriesByReport(reportId);
    const typeDistribution = this.computeTypeDistribution(entries);
    const peaksAndValleys = this.detectPeaksAndValleys(entries);
    const efficiency = this.analyzeEfficiency(entries);
    const trialErrorPatterns = this.detectTrialErrorPatterns(entries);
    const averageConfidence = this.computeAverageConfidence(entries);
    const emotionalTrajectory = this.buildEmotionalTrajectory(entries);

    return {
      typeDistribution,
      peaksAndValleys,
      efficiency,
      trialErrorPatterns,
      averageConfidence,
      emotionalTrajectory,
    };
  }

  // ========== 统计 ==========

  /** 计算条目统计 */
  computeStats(reportId: string): ExplorationEntryStats {
    const entries = this.getEntriesByReport(reportId);
    const byType = this.computeTypeDistribution(entries);
    const totalDurationMinutes = entries.reduce(
      (sum, e) => sum + (e.durationMinutes ?? 0),
      0
    );
    return {
      total: entries.length,
      byType,
      totalDurationMinutes,
      supportEvidenceCount: byType.evidence_support,
      againstEvidenceCount: byType.evidence_against,
    };
  }

  // ========== 私有辅助方法 ==========

  /** 生成唯一ID */
  private generateId(): string {
    return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * 规范化关联关系
   *
   * 合并 relatedEntries 数组与 relatedEntryId 单值，去重。
   */
  private normalizeRelations(
    relatedEntries: string[] | undefined,
    relatedEntryId: string | undefined
  ): string[] {
    const set = new Set<string>();
    if (relatedEntries) {
      for (const id of relatedEntries) {
        if (id) set.add(id);
      }
    }
    if (relatedEntryId) set.add(relatedEntryId);
    return Array.from(set);
  }

  /** 计算类型分布 */
  private computeTypeDistribution(
    entries: ExplorationEntry[]
  ): Record<ExplorationEntryType, number> {
    const dist = this.emptyTypeDistribution();
    for (const e of entries) {
      dist[e.type]++;
    }
    return dist;
  }

  /** 创建空类型分布 */
  private emptyTypeDistribution(): Record<ExplorationEntryType, number> {
    return {
      idea: 0,
      attempt: 0,
      discovery: 0,
      setback: 0,
      breakthrough: 0,
      reflection: 0,
      pivot: 0,
      evidence_support: 0,
      evidence_against: 0,
      question: 0,
      note: 0,
    };
  }

  /**
   * 检测高峰与低谷
   *
   * 用滑动时间窗口扫描，统计窗口内"正向记录"（突破/发现/支持证据）
   * 与"负向记录"（挫折/反对证据）的数量。
   * - 正向 ≥ 阈值 → 高峰
   * - 负向 ≥ 阈值 → 低谷
   */
  private detectPeaksAndValleys(entries: ExplorationEntry[]): ExplorationPeak[] {
    if (entries.length === 0) return [];

    const windowMs = this.config.peakWindowMinutes * 60 * 1000;
    const positiveTypes = new Set<ExplorationEntryType>([
      'breakthrough',
      'discovery',
      'evidence_support',
    ]);
    const negativeTypes = new Set<ExplorationEntryType>([
      'setback',
      'evidence_against',
    ]);

    const peaks: ExplorationPeak[] = [];
    const usedWindows = new Set<string>();

    for (const anchor of entries) {
      const anchorMs = new Date(anchor.createdAt).getTime();
      const windowStart = anchorMs;
      const windowEnd = anchorMs + windowMs;

      const inWindow = entries.filter((e) => {
        const t = new Date(e.createdAt).getTime();
        return t >= windowStart && t < windowEnd;
      });

      const positive = inWindow.filter((e) => positiveTypes.has(e.type));
      const negative = inWindow.filter((e) => negativeTypes.has(e.type));

      // 用窗口起点作为去重键，避免重叠窗口重复报告
      const key = `${windowStart}`;
      if (usedWindows.has(key)) continue;

      if (positive.length >= this.config.peakThreshold) {
        usedWindows.add(key);
        peaks.push({
          timestamp: anchor.createdAt,
          kind: 'peak',
          entryCount: positive.length,
          entryIds: positive.map((e) => e.id),
          description: `高峰：窗口内出现 ${positive.length} 条正向记录（突破/发现/支持证据）`,
        });
      } else if (negative.length >= this.config.peakThreshold) {
        usedWindows.add(key);
        peaks.push({
          timestamp: anchor.createdAt,
          kind: 'valley',
          entryCount: negative.length,
          entryIds: negative.map((e) => e.id),
          description: `低谷：窗口内出现 ${negative.length} 条负向记录（挫折/反对证据）`,
        });
      }
    }

    return peaks;
  }

  /**
   * 分析探索效率
   *
   * idea → attempt → discovery 转化链。
   */
  private analyzeEfficiency(entries: ExplorationEntry[]): ExplorationEfficiency {
    const ideaCount = entries.filter((e) => e.type === 'idea').length;
    const attemptCount = entries.filter((e) => e.type === 'attempt').length;
    const discoveryCount = entries.filter((e) => e.type === 'discovery').length;

    const ideaToAttemptRatio = ideaCount > 0 ? attemptCount / ideaCount : 0;
    const attemptToDiscoveryRatio = attemptCount > 0 ? discoveryCount / attemptCount : 0;

    // 整体评分：两个转化率的调和平均（惩罚任一环节断裂）
    let overallScore = 0;
    if (ideaToAttemptRatio > 0 && attemptToDiscoveryRatio > 0) {
      overallScore =
        (2 * ideaToAttemptRatio * attemptToDiscoveryRatio) /
        (ideaToAttemptRatio + attemptToDiscoveryRatio);
    }
    // 限制在 [0, 1]
    overallScore = Math.min(1, Math.max(0, overallScore));

    const suggestions: string[] = [];
    if (ideaCount > 0 && attemptCount === 0) {
      suggestions.push('有想法但未尝试：建议把至少一个想法落地为具体尝试。');
    }
    if (attemptCount > 0 && discoveryCount === 0) {
      suggestions.push('有尝试但无发现：检查尝试是否设计得当，或是否遗漏了观察。');
    }
    if (ideaCount > 0 && ideaToAttemptRatio < 0.3) {
      suggestions.push('想法多尝试少：可能存在"想得多做得少"，建议提高验证率。');
    }
    if (attemptCount > 0 && attemptToDiscoveryRatio < 0.2) {
      suggestions.push('尝试多发现少：尝试可能过于发散，建议聚焦关键假设。');
    }
    if (suggestions.length === 0 && entries.length > 0) {
      suggestions.push('探索节奏良好：想法、尝试、发现的比例较均衡。');
    }

    return {
      ideaCount,
      attemptCount,
      discoveryCount,
      ideaToAttemptRatio,
      attemptToDiscoveryRatio,
      overallScore,
      suggestions,
    };
  }

  /**
   * 检测试错模式
   *
   * 识别"attempt → setback → (pivot|idea)"的循环。
   * 这种循环本身不是坏事，但反复出现可能意味着探索在原地打转。
   */
  private detectTrialErrorPatterns(entries: ExplorationEntry[]): TrialErrorPattern[] {
    const patterns: TrialErrorPattern[] = [];

    // 模式1：尝试-挫折循环
    const cycles: string[] = [];
    let i = 0;
    while (i < entries.length - 1) {
      if (entries[i].type === 'attempt') {
        // 向后查找紧邻的 setback
        let j = i + 1;
        while (j < entries.length && entries[j].type === 'attempt') j++;
        if (j < entries.length && entries[j].type === 'setback') {
          cycles.push(entries[i].id, entries[j].id);
          i = j + 1;
          continue;
        }
      }
      i++;
    }

    if (cycles.length >= 2) {
      patterns.push({
        name: '尝试-挫折循环',
        description: `出现 ${cycles.length / 2} 次"尝试后立即遭遇挫折"的循环，建议反思方法选择是否存在系统性偏差。`,
        entryIds: cycles,
        occurrences: cycles.length / 2,
      });
    }

    // 模式2：连续挫折后转向
    const pivotAfterSetback: string[] = [];
    for (let k = 0; k < entries.length - 1; k++) {
      if (entries[k].type === 'setback' && entries[k + 1].type === 'pivot') {
        pivotAfterSetback.push(entries[k].id, entries[k + 1].id);
      }
    }
    if (pivotAfterSetback.length >= 2) {
      patterns.push({
        name: '挫折驱动转向',
        description: `出现 ${pivotAfterSetback.length / 2} 次"挫折后立即转向"，注意区分理性转向与逃避式跳转。`,
        entryIds: pivotAfterSetback,
        occurrences: pivotAfterSetback.length / 2,
      });
    }

    return patterns;
  }

  /** 计算平均置信度 */
  private computeAverageConfidence(entries: ExplorationEntry[]): number {
    const withConfidence = entries.filter(
      (e) => e.metadata?.confidenceLevel !== undefined
    );
    if (withConfidence.length === 0) return 0;
    const sum = withConfidence.reduce(
      (s, e) => s + (e.metadata?.confidenceLevel ?? 0),
      0
    );
    return sum / withConfidence.length;
  }

  /** 构建情绪轨迹 */
  private buildEmotionalTrajectory(
    entries: ExplorationEntry[]
  ): Array<{ timestamp: string; emotion: string; entryId: string }> {
    if (!this.config.trackEmotion) return [];
    return entries
      .filter((e) => e.metadata?.emotionalState)
      .map((e) => ({
        timestamp: e.createdAt,
        emotion: e.metadata!.emotionalState!,
        entryId: e.id,
      }));
  }

  /**
   * 构建叙事性总结文本
   *
   * 用自然语言描述探索过程，体现"不是日记"的设计理念。
   */
  private buildNarrative(
    total: number,
    dist: Record<ExplorationEntryType, number>,
    turningPointCount: number,
    discoveryCount: number,
    setbackCount: number,
    durationMinutes: number
  ): string {
    if (total === 0) {
      return '探索尚未开始：还没有任何记录。';
    }

    const parts: string[] = [];

    // 开篇：规模与时长
    parts.push(
      `这次探索共留下 ${total} 条记录` +
        (durationMinutes > 0 ? `，累计耗时约 ${Math.round(durationMinutes)} 分钟` : '') +
        '。'
    );

    // 主体：关键节点的叙事
    const segments: string[] = [];
    if (dist.idea > 0) segments.push(`冒出 ${dist.idea} 个想法`);
    if (dist.attempt > 0) segments.push(`执行了 ${dist.attempt} 次尝试`);
    if (discoveryCount > 0) segments.push(`获得 ${discoveryCount} 项发现/支持证据`);
    if (setbackCount > 0) segments.push(`遭遇 ${setbackCount} 次挫折/反对证据`);
    if (turningPointCount > 0) segments.push(`经历 ${turningPointCount} 个转折点`);
    if (dist.reflection > 0) segments.push(`写下 ${dist.reflection} 次反思`);

    if (segments.length > 0) {
      parts.push('探索路径：' + segments.join('，') + '。');
    }

    // 结尾：定性判断
    if (dist.breakthrough > 0 && dist.evidence_against === 0) {
      parts.push('整体看，这是一次顺利推进、未遇重大反证的探索。');
    } else if (dist.evidence_against > 0 && dist.breakthrough === 0) {
      parts.push('整体看，探索遭遇了反证但尚未取得突破，假设可能需要修正。');
    } else if (dist.breakthrough > 0 && dist.evidence_against > 0) {
      parts.push('整体看，探索在突破与反证之间推进，结论需要审慎对待。');
    } else if (dist.attempt > 0 && dist.discovery === 0 && dist.breakthrough === 0) {
      parts.push('整体看，尝试尚未转化为发现，可能需要调整方法或聚焦问题。');
    }

    return parts.join('');
  }
}

// ============ 工厂函数 ============

/**
 * 创建探索记录管理器实例
 *
 * @example
 * ```ts
 * const manager = createExplorationLogManager({ peakWindowMinutes: 60 });
 * const entry = manager.addEntry({
 *   reportId: 'rpt-1',
 *   type: 'idea',
 *   title: '用对比学习优化检索',
 *   content: '我突然想到……',
 *   metadata: { confidenceLevel: 0.6, emotionalState: '兴奋' }
 * });
 * ```
 */
export function createExplorationLogManager(
  config?: Partial<ExplorationLogManagerConfig>
): ExplorationLogManager {
  return new ExplorationLogManager(config);
}

// ============ 便捷导出 ============

export type {
  ExplorationEntryType,
  ExplorationEntryFilter,
  ExplorationEntryStats,
} from '../../types/experiment-report';

export {
  ExplorationEntryTypeNames,
  ExplorationEntryTypeStyles,
} from '../../types/experiment-report';