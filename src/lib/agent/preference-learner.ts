/**
 * 偏好学习模块
 * 从用户行为中学习偏好，支持可重置
 */

import {
  PreferenceType,
  type UserPreference,
  type UserProfile,
} from '../../types/memory';
import type {
  DocumentStyle,
  UserStyleProfile,
  VisualStyle,
  TextualStyle,
  ContentStyle,
} from '../../types/style';

/**
 * 偏好学习配置
 */
export interface PreferenceLearnerConfig {
  /** 最小学习次数 */
  minLearnCount?: number;
  /** 置信度增长因子 */
  confidenceGrowthFactor?: number;
  /** 最大置信度 */
  maxConfidence?: number;
  /** 衰减周期 (天数) */
  decayPeriod?: number;
}

/**
 * 用户行为事件
 */
export interface UserBehaviorEvent {
  /** 事件ID */
  id: string;
  /** 事件类型 */
  type: 'explicit_preference' | 'implicit_preference' | 'behavior';
  /** 偏好类型 */
  preferenceType: PreferenceType;
  /** 偏好值 */
  preferenceValue: string;
  /** 时间戳 */
  timestamp: string;
  /** 上下文信息 */
  context?: Record<string, unknown>;
}

/**
 * 偏好学习器
 */
export class PreferenceLearner {
  private config: Required<PreferenceLearnerConfig>;
  private preferences: Map<string, UserPreference>;

  constructor(config: PreferenceLearnerConfig = {}) {
    this.config = {
      minLearnCount: 3,
      confidenceGrowthFactor: 0.1,
      maxConfidence: 0.95,
      decayPeriod: 30,
      ...config,
    };
    this.preferences = new Map();
  }

  /**
   * 从用户行为中学习偏好
   */
  learnFromBehavior(event: UserBehaviorEvent): UserPreference {
    const key = this.getPreferenceKey(
      event.preferenceType,
      event.preferenceValue
    );

    // 将事件类型映射为学习来源
    const source = this.mapToLearnSource(event.type);

    let preference = this.preferences.get(key);

    if (!preference) {
      // 新偏好
      preference = {
        type: event.preferenceType,
        value: event.preferenceValue,
        confidence: this.calculateInitialConfidence(source),
        learnedFrom: source,
        learnCount: 0,
        lastLearnedAt: event.timestamp,
        firstLearnedAt: event.timestamp,
        contextExamples: [],
      };
    }

    // 更新偏好
    preference.learnCount++;
    preference.lastLearnedAt = event.timestamp;
    preference.learnedFrom = this.determineLearnSource(
      preference.learnedFrom,
      source
    );

    // 更新置信度
    preference.confidence = this.calculateConfidence(
      preference.learnCount,
      source
    );

    // 添加上下文示例
    if (event.context) {
      const example = this.formatContextExample(event.context);
      if (example && (!preference.contextExamples ||
          preference.contextExamples.length < 5)) {
        preference.contextExamples = [
          ...(preference.contextExamples || []),
          example,
        ];
      }
    }

    this.preferences.set(key, preference);

    return { ...preference };
  }

  /**
   * 批量学习偏好
   */
  learnFromBehaviors(events: UserBehaviorEvent[]): UserPreference[] {
    const learned: UserPreference[] = [];

    for (const event of events) {
      const preference = this.learnFromBehavior(event);
      learned.push(preference);
    }

    return learned;
  }

  /**
   * 获取用户偏好
   */
  getPreferences(): UserPreference[] {
    return Array.from(this.preferences.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 获取特定类型的偏好
   */
  getPreferencesByType(type: PreferenceType): UserPreference[] {
    return Array.from(this.preferences.values())
      .filter((p) => p.type === type)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 获取最高置信度的偏好值
   */
  getTopPreference(type: PreferenceType): string | null {
    const preferences = this.getPreferencesByType(type);
    if (preferences.length === 0) {
      return null;
    }
    return preferences[0].value;
  }

  /**
   * 重置所有偏好
   */
  reset(): void {
    this.preferences.clear();
  }

  /**
   * 重置特定类型的偏好
   */
  resetByType(type: PreferenceType): void {
    for (const [key, preference] of this.preferences.entries()) {
      if (preference.type === type) {
        this.preferences.delete(key);
      }
    }
  }

  /**
   * 重置特定偏好
   */
  resetPreference(type: PreferenceType, value: string): void {
    const key = this.getPreferenceKey(type, value);
    this.preferences.delete(key);
  }

  /**
   * 应用偏好到回答
   */
  applyPreferencesToAnswer(
    answer: string,
    preferences?: UserPreference[]
  ): string {
    const prefs = preferences || this.getPreferences();
    let modifiedAnswer = answer;

    // 应用语言偏好
    const languagePref = prefs.find((p) => p.type === PreferenceType.LANGUAGE);
    if (languagePref && languagePref.confidence > 0.7) {
      // 可以在这里添加语言转换逻辑
    }

    // 应用回答风格偏好
    const stylePref = prefs.find((p) => p.type === PreferenceType.ANSWER_STYLE);
    if (stylePref && stylePref.confidence > 0.7) {
      modifiedAnswer = this.applyStyle(modifiedAnswer, stylePref.value);
    }

    // 应用详细程度偏好
    const detailPref = prefs.find((p) => p.type === PreferenceType.DETAIL_LEVEL);
    if (detailPref && detailPref.confidence > 0.7) {
      modifiedAnswer = this.adjustDetailLevel(modifiedAnswer, detailPref.value);
    }

    return modifiedAnswer;
  }

  /**
   * 构建用户画像
   */
  buildUserProfile(userId: string): UserProfile {
    const preferences = this.getPreferences();
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

    // 计算活跃时间段 (模拟)
    const activeHours: Record<string, number> = {};

    return {
      userId,
      preferences: expandedPreferences,
      domainStats,
      activeHours,
      totalInteractions: expandedPreferences.reduce((sum, p) => sum + p.learnCount, 0),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 从偏好中推断领域偏好
   */
  inferDomainPreferences(
    questions: Array<{ question: string; timestamp: string }>
  ): UserPreference[] {
    const domainKeywords: Record<string, string[]> = {
      '计算机科学': ['编程', '代码', '算法', '数据结构', '软件', '开发', '编程', 'code', 'programming', 'algorithm'],
      '数学': ['数学', '公式', '计算', '代数', '几何', '微积分', 'math', 'formula'],
      '物理学': ['物理', '力学', '电磁', '量子', '相对论', 'physics'],
      '文学': ['文学', '小说', '诗歌', '文学', 'literature'],
      '历史': ['历史', '朝代', '战争', '历史', 'history'],
    };

    const domainCounts: Record<string, number> = {};

    for (const { question } of questions) {
      const lowerQuestion = question.toLowerCase();
      for (const [domain, keywords] of Object.entries(domainKeywords)) {
        // 按关键词匹配次数计数（同一问题可匹配多个关键词）
        for (const keyword of keywords) {
          if (lowerQuestion.includes(keyword.toLowerCase())) {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
          }
        }
      }
    }

    // 创建偏好
    const preferences: UserPreference[] = [];
    const now = new Date().toISOString();

    for (const [domain, count] of Object.entries(domainCounts)) {
      if (count >= this.config.minLearnCount) {
        preferences.push({
          type: PreferenceType.DOMAIN,
          value: domain,
          confidence: Math.min(
            this.config.maxConfidence,
            count * this.config.confidenceGrowthFactor
          ),
          learnedFrom: 'behavior',
          learnCount: count,
          lastLearnedAt: now,
          firstLearnedAt: now,
        });
      }
    }

    return preferences;
  }

  /**
   * 导出偏好数据
   */
  exportPreferences(): UserPreference[] {
    return this.getPreferences();
  }

  /**
   * 导入偏好数据
   * 导入会覆盖同类型的现有偏好
   */
  importPreferences(preferences: UserPreference[]): void {
    // 收集要导入的偏好类型
    const typesToImport = new Set(preferences.map((p) => p.type));

    // 清除这些类型的现有偏好（覆盖语义）
    for (const [key, pref] of this.preferences.entries()) {
      if (typesToImport.has(pref.type)) {
        this.preferences.delete(key);
      }
    }

    // 导入新偏好
    for (const pref of preferences) {
      const key = this.getPreferenceKey(pref.type, pref.value);
      this.preferences.set(key, { ...pref });
    }
  }

  /**
   * 获取偏好键
   */
  private getPreferenceKey(type: PreferenceType, value: string): string {
    return `${type}:${value}`;
  }

  /**
   * 将事件类型映射为学习来源
   * explicit_preference -> explicit
   * implicit_preference -> implicit
   * behavior -> behavior
   */
  private mapToLearnSource(
    eventType: 'explicit_preference' | 'implicit_preference' | 'behavior'
  ): 'explicit' | 'implicit' | 'behavior' {
    switch (eventType) {
      case 'explicit_preference':
        return 'explicit';
      case 'implicit_preference':
        return 'implicit';
      case 'behavior':
        return 'behavior';
    }
  }

  /**
   * 计算初始置信度
   */
  private calculateInitialConfidence(
    source: 'explicit' | 'implicit' | 'behavior'
  ): number {
    switch (source) {
      case 'explicit':
        return 0.8;
      case 'implicit':
        return 0.5;
      case 'behavior':
        return 0.3;
      default:
        return 0.3;
    }
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    learnCount: number,
    source: 'explicit' | 'implicit' | 'behavior'
  ): number {
    const baseConfidence = this.calculateInitialConfidence(source);
    // 第一次学习时置信度为基础值，后续学习才增长
    if (learnCount <= 1) {
      return baseConfidence;
    }
    const growth = Math.min(
      (learnCount - 1) * this.config.confidenceGrowthFactor,
      this.config.maxConfidence - baseConfidence
    );
    return Math.min(this.config.maxConfidence, baseConfidence + growth);
  }

  /**
   * 确定学习来源
   */
  private determineLearnSource(
    current: 'explicit' | 'implicit' | 'behavior',
    newSource: 'explicit' | 'implicit' | 'behavior'
  ): 'explicit' | 'implicit' | 'behavior' {
    // 优先级: explicit > implicit > behavior
    const priority = {
      explicit: 3,
      implicit: 2,
      behavior: 1,
    };

    return priority[newSource] > priority[current] ? newSource : current;
  }

  /**
   * 格式化上下文示例
   */
  private formatContextExample(
    context: Record<string, unknown>
  ): string | null {
    const parts: string[] = [];

    if (context.question) {
      parts.push(`问题: ${context.question}`);
    }
    if (context.answer) {
      parts.push(`回答: ${context.answer}`);
    }

    return parts.length > 0 ? parts.join(' | ') : null;
  }

  /**
   * 应用回答风格
   */
  private applyStyle(answer: string, style: string): string {
    switch (style) {
      case '简明扼要':
        return this.makeConcise(answer);
      case '详细解释':
        return this.makeDetailed(answer);
      case '通俗易懂':
        return this.makeAccessible(answer);
      case '专业严谨':
        return this.makeProfessional(answer);
      default:
        return answer;
    }
  }

  /**
   * 使回答简洁
   */
  private makeConcise(answer: string): string {
    // 如果回答太长，截取前200字符
    if (answer.length > 200) {
      return answer.substring(0, 200) + '...';
    }
    return answer;
  }

  /**
   * 使回答详细
   */
  private makeDetailed(answer: string): string {
    // 在回答中添加详细解释的标记
    if (!answer.includes('详细解释')) {
      return `【详细解答】\n${answer}\n\n【补充说明】如有疑问，请继续提问。`;
    }
    return answer;
  }

  /**
   * 使回答通俗易懂
   */
  private makeAccessible(answer: string): string {
    // 替换专业术语为通俗表达
    let modified = answer;
    const replacements: Array<[RegExp, string]> = [
      [/神经网络/g, '类似人脑的"学习系统"'],
      [/算法/g, '计算步骤'],
      [/模型/g, '数学框架'],
      [/参数/g, '设置项'],
      [/优化/g, '改进'],
      [/迭代/g, '重复尝试'],
      [/收敛/g, '稳定下来'],
    ];

    for (const [pattern, replacement] of replacements) {
      modified = modified.replace(pattern, replacement);
    }

    return modified;
  }

  /**
   * 使回答专业严谨
   */
  private makeProfessional(answer: string): string {
    // 添加专业术语和引用格式
    if (!answer.startsWith('【专业解答】')) {
      return `【专业解答】\n${answer}\n\n*本回答基于专业领域知识，仅供参考。*`;
    }
    return answer;
  }

  /**
   * 调整详细程度
   */
  private adjustDetailLevel(answer: string, level: string): string {
    switch (level) {
      case '简单':
        return this.makeConcise(answer);
      case '中等':
        return answer;
      case '详细':
        return this.makeDetailed(answer);
      default:
        return answer;
    }
  }

  // ============ 风格偏好集成 ============

  /**
   * 从用户风格画像中学习风格偏好
   *
   * 把 UserStyleProfile 转换为多个 UserBehaviorEvent 并学习，
   * 使风格画像可以与现有偏好系统统一消费。
   *
   * @param profile 用户风格画像
   * @returns 学习到的偏好列表
   */
  learnFromStyleProfile(profile: UserStyleProfile): UserPreference[] {
    const timestamp = profile.learningHistory.lastUpdated;
    const events: UserBehaviorEvent[] = [];

    // 视觉风格偏好
    const visualValue = this.serializeVisualStyle(profile.preferredStyles.visual);
    events.push({
      id: `style_visual_${profile.userId}_${Date.now()}`,
      type: 'implicit_preference',
      preferenceType: PreferenceType.VISUAL_STYLE,
      preferenceValue: visualValue,
      timestamp,
      context: {
        confidence: profile.learningHistory.confidenceLevel,
        templatesAnalyzed: profile.learningHistory.templatesAnalyzed,
      },
    });

    // 文本风格偏好
    const textualValue = this.serializeTextualStyle(profile.preferredStyles.textual);
    events.push({
      id: `style_textual_${profile.userId}_${Date.now()}`,
      type: 'implicit_preference',
      preferenceType: PreferenceType.TEXTUAL_STYLE,
      preferenceValue: textualValue,
      timestamp,
      context: { confidence: profile.learningHistory.confidenceLevel },
    });

    // 内容风格偏好
    const contentValue = this.serializeContentStyle(profile.preferredStyles.content);
    events.push({
      id: `style_content_${profile.userId}_${Date.now()}`,
      type: 'implicit_preference',
      preferenceType: PreferenceType.CONTENT_STYLE,
      preferenceValue: contentValue,
      timestamp,
      context: { confidence: profile.learningHistory.confidenceLevel },
    });

    // 模板偏好：按类别/场景/主题分别记录
    for (const [category, weight] of Object.entries(profile.styleWeights.byCategory)) {
      if (weight > 0) {
        events.push({
          id: `style_cat_${category}_${Date.now()}`,
          type: 'behavior',
          preferenceType: PreferenceType.TEMPLATE_PREFERENCE,
          preferenceValue: `category:${category}`,
          timestamp,
          context: { weight },
        });
      }
    }
    for (const [scenario, weight] of Object.entries(profile.styleWeights.byScenario)) {
      if (weight > 0) {
        events.push({
          id: `style_sce_${scenario}_${Date.now()}`,
          type: 'behavior',
          preferenceType: PreferenceType.TEMPLATE_PREFERENCE,
          preferenceValue: `scenario:${scenario}`,
          timestamp,
          context: { weight },
        });
      }
    }
    for (const [topic, weight] of Object.entries(profile.styleWeights.byTopic)) {
      if (weight > 0) {
        events.push({
          id: `style_topic_${topic}_${Date.now()}`,
          type: 'behavior',
          preferenceType: PreferenceType.TEMPLATE_PREFERENCE,
          preferenceValue: `topic:${topic}`,
          timestamp,
          context: { weight },
        });
      }
    }

    return this.learnFromBehaviors(events);
  }

  /**
   * 从单个文档风格中学习偏好
   * 用于"用户添加新模板时自动学习其风格"的场景
   *
   * @param documentStyle 文档风格
   * @param satisfied 是否满意（默认 true，因为只从满意模板学习）
   * @returns 学习到的偏好列表
   */
  learnFromDocumentStyle(documentStyle: DocumentStyle, satisfied = true): UserPreference[] {
    if (!satisfied) return [];

    const timestamp = new Date().toISOString();
    const events: UserBehaviorEvent[] = [];

    events.push({
      id: `doc_visual_${documentStyle.documentType}_${Date.now()}`,
      type: 'implicit_preference',
      preferenceType: PreferenceType.VISUAL_STYLE,
      preferenceValue: this.serializeVisualStyle(documentStyle.visual),
      timestamp,
      context: { documentType: documentStyle.documentType, confidence: documentStyle.confidence },
    });
    events.push({
      id: `doc_textual_${documentStyle.documentType}_${Date.now()}`,
      type: 'implicit_preference',
      preferenceType: PreferenceType.TEXTUAL_STYLE,
      preferenceValue: this.serializeTextualStyle(documentStyle.textual),
      timestamp,
      context: { documentType: documentStyle.documentType },
    });
    events.push({
      id: `doc_content_${documentStyle.documentType}_${Date.now()}`,
      type: 'implicit_preference',
      preferenceType: PreferenceType.CONTENT_STYLE,
      preferenceValue: this.serializeContentStyle(documentStyle.content),
      timestamp,
      context: { documentType: documentStyle.documentType },
    });

    return this.learnFromBehaviors(events);
  }

  /**
   * 应用风格偏好到回答
   * 根据学习到的文本风格偏好调整回答风格
   *
   * @param answer 原始回答
   * @param styleProfile 用户风格画像（可选，未提供则从偏好库推断）
   * @returns 调整后的回答
   */
  applyStylePreferencesToAnswer(
    answer: string,
    styleProfile?: UserStyleProfile
  ): string {
    let modified = answer;

    // 优先使用显式传入的画像
    if (styleProfile) {
      modified = this.applyTextualStyle(modified, styleProfile.preferredStyles.textual);
      return modified;
    }

    // 否则从偏好库推断
    const textualPrefs = this.getPreferencesByType(PreferenceType.TEXTUAL_STYLE);
    if (textualPrefs.length > 0 && textualPrefs[0].confidence > 0.5) {
      try {
        const textual = JSON.parse(textualPrefs[0].value) as TextualStyle;
        modified = this.applyTextualStyle(modified, textual);
      } catch {
        // 解析失败则跳过
      }
    }

    return modified;
  }

  /**
   * 获取风格偏好汇总
   * 用于 UI 展示与调试
   */
  getStylePreferences(): {
    visual: UserPreference[];
    textual: UserPreference[];
    content: UserPreference[];
    template: UserPreference[];
  } {
    return {
      visual: this.getPreferencesByType(PreferenceType.VISUAL_STYLE),
      textual: this.getPreferencesByType(PreferenceType.TEXTUAL_STYLE),
      content: this.getPreferencesByType(PreferenceType.CONTENT_STYLE),
      template: this.getPreferencesByType(PreferenceType.TEMPLATE_PREFERENCE),
    };
  }

  /**
   * 序列化视觉风格为偏好值字符串
   */
  private serializeVisualStyle(visual: VisualStyle): string {
    return JSON.stringify({
      paletteType: visual.colorScheme.paletteType,
      isDark: visual.colorScheme.isDark,
      primaryColors: visual.colorScheme.primary,
      fontCategory: visual.fontFamily.category,
      primaryFont: visual.fontFamily.primaryFont,
      layoutType: visual.layoutStyle.type,
      visualDensity: visual.visualDensity,
      imageUsage: visual.imageUsage,
      chartUsage: visual.chartUsage,
    });
  }

  /**
   * 序列化文本风格为偏好值字符串
   */
  private serializeTextualStyle(textual: TextualStyle): string {
    return JSON.stringify(textual);
  }

  /**
   * 序列化内容风格为偏好值字符串
   */
  private serializeContentStyle(content: ContentStyle): string {
    return JSON.stringify({
      topicPreference: content.topicPreference,
      exampleUsage: content.exampleUsage,
      dataUsage: content.dataUsage,
      citationStyle: content.citationStyle,
    });
  }

  /**
   * 应用文本风格到回答
   */
  private applyTextualStyle(answer: string, textual: TextualStyle): string {
    let modified = answer;

    // 根据简洁程度调整
    if (textual.conciseness > 0.7) {
      modified = this.makeConcise(modified);
    } else if (textual.conciseness < 0.3) {
      modified = this.makeDetailed(modified);
    }

    // 根据语气风格调整
    switch (textual.toneStyle) {
      case 'formal':
      case 'academic':
        modified = this.makeProfessional(modified);
        break;
      case 'casual':
        modified = this.makeAccessible(modified);
        break;
      case 'persuasive':
        // 说服风格：保留原文，但确保有明确建议标记
        if (!modified.includes('建议')) {
          modified += '\n\n建议：根据上述分析采取相应行动。';
        }
        break;
      default:
        break;
    }

    return modified;
  }
}

/**
 * 创建默认的偏好学习器
 */
export function createPreferenceLearner(
  config?: PreferenceLearnerConfig
): PreferenceLearner {
  return new PreferenceLearner(config);
}