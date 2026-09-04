/**
 * 模板管理器 (TemplateManager)
 *
 * @description "更懂你的WPS"核心逻辑层。提供模板的 CRUD、查询、
 *   全文搜索、相似推荐、风格特征自动提取、使用统计与评分等能力。
 *
 * 设计原则：
 * 1. 用户满意导向 —— 模板来源于用户认可的文档，不是网络随便抓取
 * 2. 风格特征提取 —— 自动分析配色/字体/布局/语气/结构/密度
 * 3. 场景匹配     —— 基于 useCases / suitableFor 做语义命中
 * 4. 持续积累     —— usageCount / userRating 反馈用户品位
 *
 * 该模块为纯函数 + 类的混合形态：
 * - `templateManager` 单例维护内存中的模板列表（由 Store 持久化）
 * - 导出的纯函数（如 computeSimilarity / extractStyleFeatures）便于单测
 *
 * @module src/lib/wps/template-manager
 */

import {
  DocumentTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateFilter,
  TemplateSortOptions,
  TemplateStats,
  TemplateRecommendation,
  TemplateCategoryValue,
  DocumentTypeValue,

  VisualDensityValue,
  TemplateStyleFeatures,
  StyleExtractionInput,
  StyleExtractionResult,
  TemplateCategory,
  VisualDensity,
} from '../../types/template';

// ============ 工具函数 ============

/**
 * 生成唯一 ID
 * 形如 `tpl_<base36时间戳>_<随机后缀>`，与项目其他 store 风格保持一致
 */
export function generateTemplateId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 评分合法性校验
 * 仅允许 1-5 的整数（或浮点数四舍五入到 1-5）
 */
export function clampRating(rating: number): number {
  const rounded = Math.round(rating);
  return Math.max(1, Math.min(5, rounded));
}

/**
 * 计算两个字符串数组的 Jaccard 相似度
 * |A ∩ B| / |A ∪ B|，空集约定为 0
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase().trim()));
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));
  let intersection = 0;
  setA.forEach((item) => {
    if (setB.has(item)) intersection++;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ============ 风格特征提取 ============

/**
 * 关键词 → 使用场景的启发式映射
 * 用于从文档文本中推断 useCases
 */
const USE_CASE_KEYWORDS: Array<{ keywords: string[]; useCase: string }> = [
  { keywords: ['季度', '月度', '汇报', '总结', 'kpi'], useCase: '工作汇报' },
  { keywords: ['产品', '迭代', 'roadmap', '路线图'], useCase: '产品规划' },
  { keywords: ['市场', '调研', '用户', '访谈'], useCase: '市场调研' },
  { keywords: ['论文', '引用', 'abstract', '参考文献'], useCase: '学术写作' },
  { keywords: ['数据', '分析', '指标', '趋势'], useCase: '数据分析' },
  { keywords: ['培训', '教程', '步骤', '指南'], useCase: '培训教学' },
  { keywords: ['商业', '计划', 'bp', '融资'], useCase: '商业计划' },
  { keywords: ['会议', '纪要', '决议', '议题'], useCase: '会议纪要' },
];

/**
 * 关键词 → 适合主题的启发式映射
 */
const SUITABLE_FOR_KEYWORDS: Array<{ keywords: string[]; topic: string }> = [
  { keywords: ['金融', '财务', '营收', '利润'], topic: '财务金融' },
  { keywords: ['技术', '架构', '系统', '工程'], topic: '技术工程' },
  { keywords: ['营销', '品牌', '增长', '转化'], topic: '市场营销' },
  { keywords: ['科研', '实验', '假设', '论证'], topic: '科研学术' },
  { keywords: ['运营', '流程', '效率', '优化'], topic: '运营管理' },
  { keywords: ['设计', '视觉', '体验', '原型'], topic: '设计创意' },
];

/**
 * 关键词 → 分类推断
 */
const CATEGORY_KEYWORDS: Array<{
  keywords: string[];
  category: TemplateCategoryValue;
}> = [
  { keywords: ['论文', '引用', 'abstract'], category: TemplateCategory.ACADEMIC },
  { keywords: ['商业', '计划', '融资', 'bp'], category: TemplateCategory.BUSINESS },
  { keywords: ['技术', '架构', '系统'], category: TemplateCategory.TECHNICAL },
  { keywords: ['创意', '设计', '灵感'], category: TemplateCategory.CREATIVE },
  { keywords: ['报告', '总结', '汇报'], category: TemplateCategory.REPORT },
  { keywords: ['演示', '演讲', '展示'], category: TemplateCategory.PRESENTATION },
];

/**
 * 根据平均每页字数推断视觉密度
 * - < 80 字/页：稀疏（典型演示稿）
 * - 80-200 字/页：中等
 * - > 200 字/页：密集（典型文档）
 */
export function inferVisualDensity(avgWordsPerPage?: number): VisualDensityValue | undefined {
  if (avgWordsPerPage === undefined || avgWordsPerPage <= 0) return undefined;
  if (avgWordsPerPage < 80) return VisualDensity.SPARSE;
  if (avgWordsPerPage <= 200) return VisualDensity.MEDIUM;
  return VisualDensity.DENSE;
}

/**
 * 推断语气风格
 * 基于文本中正式/非正式信号词的频次
 */
function inferToneStyle(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  const formalSignals = ['综上', '因此', '据此', '研究表明', 'furthermore', 'therefore'];
  const casualSignals = ['咱们', '搞定', '棒', 'awesome', 'let\'s'];

  let formalCount = 0;
  let casualCount = 0;
  formalSignals.forEach((s) => {
    if (lower.includes(s.toLowerCase())) formalCount++;
  });
  casualSignals.forEach((s) => {
    if (lower.includes(s.toLowerCase())) casualCount++;
  });

  if (formalCount > casualCount && formalCount > 0) return 'formal';
  if (casualCount > formalCount && casualCount > 0) return 'casual';
  return undefined;
}

/**
 * 推断结构模式
 * 简单基于章节关键词出现顺序的启发式
 */
function inferStructurePattern(text: string): string | undefined {
  if (!text) return undefined;
  const hasProblem = /问题|痛点|挑战|背景/.test(text);
  const hasSolution = /方案|解决|对策|建议/.test(text);
  const hasChronological = /首先|其次|然后|最后|阶段一|阶段二/.test(text);
  const hasPyramid = /结论|核心观点|总-分|总分/.test(text);

  if (hasProblem && hasSolution) return 'problem-solution';
  if (hasChronological) return 'chronological';
  if (hasPyramid) return 'pyramid';
  return undefined;
}

/**
 * 从可观察输入中提取风格特征
 *
 * @param input 文档可观察信息
 * @returns 风格特征 + 推断的场景/主题/分类
 */
export function extractStyleFeatures(input: StyleExtractionInput): StyleExtractionResult {
  const text = input.textContent || '';
  const lowerText = text.toLowerCase();

  // 风格特征
  const styleFeatures: TemplateStyleFeatures = {
    colorScheme: input.colors && input.colors.length > 0 ? input.colors.slice(0, 8) : undefined,
    fontFamily: input.fonts && input.fonts.length > 0 ? input.fonts.slice(0, 4) : undefined,
    visualDensity: inferVisualDensity(input.avgWordsPerPage),
    toneStyle: inferToneStyle(text),
    structurePattern: inferStructurePattern(text),
    // layoutStyle 需要更专门的版面分析，此处留空，由调用方按需补充
    layoutStyle: undefined,
  };

  // 推断使用场景
  const inferredUseCases: string[] = [];
  USE_CASE_KEYWORDS.forEach(({ keywords, useCase }) => {
    if (keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
      inferredUseCases.push(useCase);
    }
  });

  // 推断适合主题
  const inferredSuitableFor: string[] = [];
  SUITABLE_FOR_KEYWORDS.forEach(({ keywords, topic }) => {
    if (keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
      inferredSuitableFor.push(topic);
    }
  });

  // 推断分类
  let inferredCategory: TemplateCategoryValue | undefined;
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
      inferredCategory = category;
      break;
    }
  }

  return {
    styleFeatures,
    inferredUseCases,
    inferredSuitableFor,
    inferredCategory,
  };
}

// ============ 相似度计算 ============

/**
 * 计算两个模板之间的相似度
 *
 * 综合考虑：
 * - 分类一致性 (权重 0.25)
 * - 文档类型一致性 (权重 0.10)
 * - 标签 Jaccard (权重 0.20)
 * - 使用场景 Jaccard (权重 0.20)
 * - 适合主题 Jaccard (权重 0.15)
 * - 风格特征匹配 (权重 0.10)
 *
 * @returns [0, 1] 的相似度分数
 */
export function computeSimilarity(a: DocumentTemplate, b: DocumentTemplate): number {
  // 分类一致
  const categoryScore = a.category === b.category ? 1 : 0;
  // 类型一致
  const typeScore = a.type === b.type ? 1 : 0;
  // 标签 Jaccard
  const tagScore = jaccardSimilarity(a.tags, b.tags);
  // 使用场景 Jaccard
  const useCaseScore = jaccardSimilarity(a.useCases, b.useCases);
  // 适合主题 Jaccard
  const suitableForScore = jaccardSimilarity(a.suitableFor, b.suitableFor);
  // 风格特征匹配
  const styleScore = computeStyleSimilarity(a.styleFeatures, b.styleFeatures);

  return (
    categoryScore * 0.25 +
    typeScore * 0.10 +
    tagScore * 0.20 +
    useCaseScore * 0.20 +
    suitableForScore * 0.15 +
    styleScore * 0.10
  );
}

/**
 * 风格特征相似度
 * 逐字段比较，命中即累加均分
 */
function computeStyleSimilarity(a: TemplateStyleFeatures, b: TemplateStyleFeatures): number {
  const fields: Array<keyof TemplateStyleFeatures> = [
    'layoutStyle',
    'toneStyle',
    'structurePattern',
    'visualDensity',
  ];
  let matched = 0;
  let comparable = 0;

  fields.forEach((field) => {
    const va = a[field];
    const vb = b[field];
    if (va !== undefined || vb !== undefined) {
      comparable++;
      if (va !== undefined && vb !== undefined && va === vb) matched++;
    }
  });

  // 配色相似度（Jaccard）
  if (
    (a.colorScheme && a.colorScheme.length > 0) ||
    (b.colorScheme && b.colorScheme.length > 0)
  ) {
    comparable++;
    if (a.colorScheme && b.colorScheme) {
      matched += jaccardSimilarity(a.colorScheme, b.colorScheme);
    }
  }

  // 字体相似度（Jaccard）
  if (
    (a.fontFamily && a.fontFamily.length > 0) ||
    (b.fontFamily && b.fontFamily.length > 0)
  ) {
    comparable++;
    if (a.fontFamily && b.fontFamily) {
      matched += jaccardSimilarity(a.fontFamily, b.fontFamily);
    }
  }

  return comparable === 0 ? 0 : matched / comparable;
}

/**
 * 生成相似推荐的命中理由
 */
function explainRecommendation(
  target: DocumentTemplate,
  candidate: DocumentTemplate,
  score: number
): string[] {
  const reasons: string[] = [];
  if (target.category === candidate.category) {
    reasons.push(`同属分类「${candidate.category}」`);
  }
  if (target.type === candidate.type) {
    reasons.push(`文档类型相同（${candidate.type}）`);
  }
  const sharedTags = target.tags.filter((t) =>
    candidate.tags.map((c) => c.toLowerCase()).includes(t.toLowerCase())
  );
  if (sharedTags.length > 0) {
    reasons.push(`共享标签：${sharedTags.join('、')}`);
  }
  const sharedUseCases = target.useCases.filter((u) =>
    candidate.useCases.map((c) => c.toLowerCase()).includes(u.toLowerCase())
  );
  if (sharedUseCases.length > 0) {
    reasons.push(`适用场景重叠：${sharedUseCases.join('、')}`);
  }
  reasons.push(`综合相似度 ${(score * 100).toFixed(1)}%`);
  return reasons;
}

// ============ 全文搜索 ============

/**
 * 在模板的可搜索文本中查找关键词
 * 命中字段包括：name / tags / useCases / suitableFor / notes / category
 *
 * @returns 命中字段列表（用于高亮与解释）
 */
export function searchTemplateText(template: DocumentTemplate, query: string): string[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const hits: string[] = [];

  if (template.name.toLowerCase().includes(q)) hits.push('name');
  if (template.tags.some((t) => t.toLowerCase().includes(q))) hits.push('tags');
  if (template.useCases.some((u) => u.toLowerCase().includes(q))) hits.push('useCases');
  if (template.suitableFor.some((s) => s.toLowerCase().includes(q))) hits.push('suitableFor');
  if (template.notes && template.notes.toLowerCase().includes(q)) hits.push('notes');
  if (template.category.toLowerCase().includes(q)) hits.push('category');

  return hits;
}

// ============ 统计 ============

/**
 * 计算模板列表的统计信息
 */
export function computeTemplateStats(templates: DocumentTemplate[]): TemplateStats {
  const stats: TemplateStats = {
    total: templates.length,
    byCategory: {
      academic: 0,
      business: 0,
      technical: 0,
      creative: 0,
      report: 0,
      presentation: 0,
      document: 0,
      custom: 0,
    },
    byType: {
      ppt: 0,
      word: 0,
      pdf: 0,
      excel: 0,
    },
    bySource: {
      user_upload: 0,
      generated: 0,
      imported: 0,
    },
    averageRating: 0,
    totalUsageCount: 0,
    tagFrequency: {},
  };

  let ratingSum = 0;
  let ratingCount = 0;

  templates.forEach((tpl) => {
    stats.byCategory[tpl.category]++;
    stats.byType[tpl.type]++;
    stats.bySource[tpl.source]++;
    stats.totalUsageCount += tpl.usageCount;

    if (tpl.userRating !== undefined) {
      ratingSum += tpl.userRating;
      ratingCount++;
    }

    tpl.tags.forEach((tag) => {
      stats.tagFrequency[tag] = (stats.tagFrequency[tag] || 0) + 1;
    });
  });

  stats.averageRating = ratingCount > 0 ? ratingSum / ratingCount : 0;
  return stats;
}

// ============ 过滤与排序 ============

/**
 * 应用过滤条件
 */
export function filterTemplates(
  templates: DocumentTemplate[],
  filter: TemplateFilter
): DocumentTemplate[] {
  return templates.filter((tpl) => {
    if (filter.category && tpl.category !== filter.category) return false;
    if (filter.type && tpl.type !== filter.type) return false;
    if (filter.tag && !tpl.tags.some((t) => t.toLowerCase() === filter.tag!.toLowerCase())) {
      return false;
    }
    if (
      filter.useCase &&
      !tpl.useCases.some((u) => u.toLowerCase() === filter.useCase!.toLowerCase())
    ) {
      return false;
    }
    if (
      filter.suitableFor &&
      !tpl.suitableFor.some((s) => s.toLowerCase() === filter.suitableFor!.toLowerCase())
    ) {
      return false;
    }
    if (filter.source && tpl.source !== filter.source) return false;
    if (filter.minRating !== undefined) {
      if (tpl.userRating === undefined || tpl.userRating < filter.minRating) return false;
    }
    if (filter.minUsageCount !== undefined && tpl.usageCount < filter.minUsageCount) {
      return false;
    }
    if (filter.createdAtFrom && tpl.createdAt < filter.createdAtFrom) return false;
    if (filter.createdAtTo && tpl.createdAt > filter.createdAtTo) return false;
    return true;
  });
}

/**
 * 应用排序
 */
export function sortTemplates(
  templates: DocumentTemplate[],
  sortOptions: TemplateSortOptions
): DocumentTemplate[] {
  const sorted = [...templates].sort((a, b) => {
    let comparison = 0;
    switch (sortOptions.sortBy) {
      case 'createdAt':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'updatedAt':
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case 'usageCount':
        comparison = a.usageCount - b.usageCount;
        break;
      case 'userRating':
        comparison = (a.userRating || 0) - (b.userRating || 0);
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
    }
    return sortOptions.sortOrder === 'asc' ? comparison : -comparison;
  });
  return sorted;
}

// ============ 模板管理器类 ============

/**
 * 模板管理器
 *
 * 维护内存中的模板列表，提供完整的 CRUD / 查询 / 推荐 / 统计能力。
 * 实际持久化由 Zustand persist middleware 负责（见 template-store.ts），
 * 此处聚焦纯逻辑，便于单测与跨环境复用。
 */
export class TemplateManager {
  private templates: Map<string, DocumentTemplate> = new Map();

  /**
   * 用给定列表初始化（Store 加载持久化数据后调用）
   */
  load(templates: DocumentTemplate[]): void {
    this.templates.clear();
    templates.forEach((t) => this.templates.set(t.id, t));
  }

  /**
   * 导出当前所有模板（用于持久化）
   */
  dump(): DocumentTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 添加模板
   * @returns 新模板 ID
   */
  addTemplate(request: CreateTemplateRequest): string {
    const id = generateTemplateId();
    const now = new Date().toISOString();
    const template: DocumentTemplate = {
      id,
      name: request.name,
      type: request.type,
      category: request.category,
      tags: request.tags || [],
      filePath: request.filePath,
      thumbnailPath: request.thumbnailPath,
      styleFeatures: request.styleFeatures || {},
      useCases: request.useCases || [],
      suitableFor: request.suitableFor || [],
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      notes: request.notes,
      source: request.source || 'user_upload',
      originalPath: request.originalPath,
    };
    this.templates.set(id, template);
    return id;
  }

  /**
   * 从 WPS 当前文档创建模板（便捷方法）
   * 假设调用方已将文档保存到 filePath
   */
  addFromCurrentDocument(
    name: string,
    type: DocumentTypeValue,
    filePath: string,
    options: {
      category?: TemplateCategoryValue;
      tags?: string[];
      styleFeatures?: TemplateStyleFeatures;
      useCases?: string[];
      suitableFor?: string[];
      originalPath?: string;
      notes?: string;
    } = {}
  ): string {
    return this.addTemplate({
      name,
      type,
      filePath,
      category: options.category || TemplateCategory.CUSTOM,
      tags: options.tags,
      styleFeatures: options.styleFeatures,
      useCases: options.useCases,
      suitableFor: options.suitableFor,
      originalPath: options.originalPath,
      notes: options.notes,
      source: 'user_upload',
    });
  }

  /**
   * 获取模板详情
   */
  getTemplate(id: string): DocumentTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): DocumentTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 更新模板
   * @returns 是否更新成功
   */
  updateTemplate(id: string, request: UpdateTemplateRequest): boolean {
    const existing = this.templates.get(id);
    if (!existing) return false;

    const updated: DocumentTemplate = {
      ...existing,
      ...request,
      // 评分需要校验
      userRating:
        request.userRating !== undefined ? clampRating(request.userRating) : existing.userRating,
      updatedAt: new Date().toISOString(),
    };
    this.templates.set(id, updated);
    return true;
  }

  /**
   * 删除模板
   */
  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * 批量删除
   * @returns 实际删除数量
   */
  deleteTemplates(ids: string[]): number {
    let deleted = 0;
    ids.forEach((id) => {
      if (this.templates.delete(id)) deleted++;
    });
    return deleted;
  }

  /**
   * 记录使用（基于该模板生成新文档时调用）
   */
  incrementUsage(id: string): boolean {
    const existing = this.templates.get(id);
    if (!existing) return false;
    this.templates.set(id, {
      ...existing,
      usageCount: existing.usageCount + 1,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  /**
   * 设置评分
   */
  setRating(id: string, rating: number): boolean {
    return this.updateTemplate(id, { userRating: clampRating(rating) });
  }

  /**
   * 设置备注
   */
  setNotes(id: string, notes: string): boolean {
    return this.updateTemplate(id, { notes });
  }

  /**
   * 按分类查询
   */
  getByCategory(category: TemplateCategoryValue): DocumentTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  /**
   * 按标签查询
   */
  getByTag(tag: string): DocumentTemplate[] {
    const lower = tag.toLowerCase();
    return this.getAllTemplates().filter((t) =>
      t.tags.some((x) => x.toLowerCase() === lower)
    );
  }

  /**
   * 按使用场景查询
   */
  getByUseCase(useCase: string): DocumentTemplate[] {
    const lower = useCase.toLowerCase();
    return this.getAllTemplates().filter((t) =>
      t.useCases.some((x) => x.toLowerCase() === lower)
    );
  }

  /**
   * 综合过滤查询
   */
  query(filter: TemplateFilter): DocumentTemplate[] {
    return filterTemplates(this.getAllTemplates(), filter);
  }

  /**
   * 全文搜索
   * @param query 搜索关键词
   * @returns 命中模板列表（按命中字段数降序）
   */
  search(query: string): DocumentTemplate[] {
    if (!query.trim()) return [];
    const results = this.getAllTemplates()
      .map((tpl) => ({
        template: tpl,
        hits: searchTemplateText(tpl, query),
      }))
      .filter((r) => r.hits.length > 0);

    results.sort((a, b) => b.hits.length - a.hits.length);
    return results.map((r) => r.template);
  }

  /**
   * 相似模板推荐
   *
   * @param targetId 目标模板 ID
   * @param topK 返回前 K 个（默认 5）
   * @param minScore 最低相似度阈值（默认 0.1）
   */
  recommend(
    targetId: string,
    topK = 5,
    minScore = 0.1
  ): TemplateRecommendation[] {
    const target = this.templates.get(targetId);
    if (!target) return [];

    const candidates = this.getAllTemplates().filter((t) => t.id !== targetId);

    const scored = candidates
      .map((candidate) => {
        const score = computeSimilarity(target, candidate);
        return { template: candidate, score };
      })
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ template, score }) => ({
      template,
      score,
      reasons: explainRecommendation(target, template, score),
    }));
  }

  /**
   * 基于场景描述推荐模板
   * 构造一个虚拟目标，按 useCases / suitableFor / category 匹配
   */
  recommendByScenario(
    scenario: {
      useCases?: string[];
      suitableFor?: string[];
      category?: TemplateCategoryValue;
      type?: DocumentTypeValue;
    },
    topK = 5
  ): TemplateRecommendation[] {
    // 构造虚拟目标用于复用 computeSimilarity
    const virtualTarget: DocumentTemplate = {
      id: '__virtual__',
      name: '',
      type: scenario.type || 'word',
      category: scenario.category || TemplateCategory.CUSTOM,
      tags: [],
      filePath: '',
      styleFeatures: {},
      useCases: scenario.useCases || [],
      suitableFor: scenario.suitableFor || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
      source: 'user_upload',
    };

    const scored = this.getAllTemplates()
      .map((candidate) => ({
        template: candidate,
        score: computeSimilarity(virtualTarget, candidate),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ template, score }) => ({
      template,
      score,
      reasons: explainRecommendation(virtualTarget, template, score),
    }));
  }

  /**
   * 获取统计信息
   */
  getStats(): TemplateStats {
    return computeTemplateStats(this.getAllTemplates());
  }

  /**
   * 获取所有标签（去重）
   */
  getAllTags(): string[] {
    const set = new Set<string>();
    this.templates.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }

  /**
   * 获取所有使用场景（去重）
   */
  getAllUseCases(): string[] {
    const set = new Set<string>();
    this.templates.forEach((t) => t.useCases.forEach((u) => set.add(u)));
    return Array.from(set);
  }

  /**
   * 清空所有模板
   */
  clear(): void {
    this.templates.clear();
  }
}

/**
 * 模板管理器单例
 * Store 在加载/变更时会同步调用 `load` / `dump` 保持一致
 */
export const templateManager = new TemplateManager();