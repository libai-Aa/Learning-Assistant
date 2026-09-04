/**
 * 优先级排序算法
 * 基于 Eisenhower 矩阵变体实现重要性与紧急度评估
 */

import {
  ImportanceLevelValue,
  UrgencyLevelValue,
} from '../../types/knowledge';
import {
  Idea,
  IdeaAnalysis,
  PriorityResult,
  PracticeStatusValue,
} from '../../types/idea';
import { ImportanceLevel, UrgencyLevel } from '../../types/knowledge';

/**
 * 关键词权重配置
 */
interface KeywordWeight {
  keyword: string;
  weight: number;
  category: 'importance' | 'urgency';
}

/**
 * 领域权重配置
 */
interface DomainWeight {
  domain: string;
  importanceWeight: number;
  urgencyWeight: number;
}

/**
 * 优先级算法配置
 */
interface PriorityConfig {
  /** 关键词权重列表 */
  keywordWeights: KeywordWeight[];
  /** 领域权重列表 */
  domainWeights: DomainWeight[];
  /** 时间衰减因子 (天) */
  timeDecayFactor: number;
  /** 行为权重配置 */
  behaviorWeights: {
    readCount: number;
    annotationCount: number;
    ideaCount: number;
  };
  /** 重要性阈值 */
  importanceThresholds: {
    high: number;
    medium: number;
  };
  /** 紧急度阈值 */
  urgencyThresholds: {
    urgent: number;
    normal: number;
  };
}

/**
 * 行为数据接口
 */
interface BehaviorData {
  /** 阅读次数 */
  readCount: number;
  /** 标注数量 */
  annotationCount: number;
  /** 想法数量 */
  ideaCount: number;
  /** 最近阅读时间 */
  lastReadAt?: string;
  /** 关联知识数量 */
  relatedKnowledgeCount: number;
}

/**
 * 内容分析结果
 */
interface ContentAnalysis {
  /** 关键词列表 */
  keywords: string[];
  /** 主题领域 */
  domain?: string;
  /** 信息密度 (0-1) */
  informationDensity: number;
  /** 情感倾向 (-1 到 1) */
  sentiment: number;
}

/**
 * 默认优先级配置
 */
const defaultConfig: PriorityConfig = {
  keywordWeights: [
    // 高重要性关键词
    { keyword: '重要', weight: 0.8, category: 'importance' },
    { keyword: '关键', weight: 0.8, category: 'importance' },
    { keyword: '核心', weight: 0.9, category: 'importance' },
    { keyword: '必须', weight: 0.7, category: 'importance' },
    { keyword: '紧急', weight: 0.9, category: 'urgency' },
    { keyword: '立即', weight: 0.85, category: 'urgency' },
    { keyword: '马上', weight: 0.85, category: 'urgency' },
    { keyword: '尽快', weight: 0.75, category: 'urgency' },
    { keyword: '截止', weight: 0.7, category: 'urgency' },
    { keyword: '完成', weight: 0.5, category: 'urgency' },
    { keyword: '研究', weight: 0.6, category: 'importance' },
    { keyword: '分析', weight: 0.5, category: 'importance' },
    { keyword: '学习', weight: 0.4, category: 'importance' },
    { keyword: '实践', weight: 0.6, category: 'importance' },
    { keyword: '改进', weight: 0.5, category: 'importance' },
    { keyword: '优化', weight: 0.5, category: 'importance' },
    { keyword: '问题', weight: 0.4, category: 'importance' },
    { keyword: '解决方案', weight: 0.6, category: 'importance' },
    // 英文关键词
    { keyword: 'important', weight: 0.7, category: 'importance' },
    { keyword: 'urgent', weight: 0.85, category: 'urgency' },
    { keyword: 'critical', weight: 0.8, category: 'importance' },
    { keyword: 'deadline', weight: 0.75, category: 'urgency' },
    { keyword: 'ASAP', weight: 0.8, category: 'urgency' },
  ],
  domainWeights: [
    { domain: '技术', importanceWeight: 0.6, urgencyWeight: 0.4 },
    { domain: '研究', importanceWeight: 0.7, urgencyWeight: 0.5 },
    { domain: '学习', importanceWeight: 0.5, urgencyWeight: 0.3 },
    { domain: '工作', importanceWeight: 0.6, urgencyWeight: 0.7 },
    { domain: '健康', importanceWeight: 0.9, urgencyWeight: 0.8 },
    { domain: '财务', importanceWeight: 0.7, urgencyWeight: 0.6 },
    { domain: '关系', importanceWeight: 0.6, urgencyWeight: 0.4 },
    { domain: '个人成长', importanceWeight: 0.7, urgencyWeight: 0.4 },
  ],
  timeDecayFactor: 0.1,
  behaviorWeights: {
    readCount: 0.3,
    annotationCount: 0.4,
    ideaCount: 0.5,
  },
  importanceThresholds: {
    high: 0.6,
    medium: 0.3,
  },
  urgencyThresholds: {
    urgent: 0.6,
    normal: 0.3,
  },
};

/**
 * 优先级引擎类
 */
class PriorityEngine {
  private config: PriorityConfig;

  constructor(config?: Partial<PriorityConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * 分析内容
   */
  analyzeContent(content: string): ContentAnalysis {
    const keywords = this.extractKeywords(content);
    const domain = this.detectDomain(content, keywords);
    const informationDensity = this.calculateInformationDensity(content);
    const sentiment = this.analyzeSentiment(content);

    return {
      keywords,
      domain,
      informationDensity,
      sentiment,
    };
  }

  /**
   * 提取关键词
   */
  private extractKeywords(content: string): string[] {
    const foundKeywords: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const kw of this.config.keywordWeights) {
      if (lowerContent.includes(kw.keyword.toLowerCase())) {
        foundKeywords.push(kw.keyword);
      }
    }

    return foundKeywords;
  }

  /**
   * 检测领域
   */
  private detectDomain(content: string, _keywords: string[]): string | undefined {
    const domainKeywords: Record<string, string[]> = {
      '技术': ['代码', '编程', '算法', '开发', 'API', 'code', 'algorithm', 'dev'],
      '研究': ['研究', '分析', '实验', '论文', 'research', 'study', 'experiment'],
      '学习': ['学习', '课程', '教程', '练习', 'learn', 'course', 'tutorial'],
      '工作': ['工作', '项目', '会议', '任务', 'work', 'project', 'meeting'],
      '健康': ['健康', '运动', '饮食', '睡眠', 'health', 'exercise', 'diet'],
      '财务': ['财务', '投资', '预算', '收入', 'finance', 'invest', 'budget'],
      '关系': ['关系', '朋友', '家人', '沟通', 'relationship', 'family', 'friend'],
      '个人成长': ['成长', '进步', '目标', '习惯', 'growth', 'goal', 'habit'],
    };

    let bestDomain: string | undefined;
    let bestScore = 0;

    for (const [domain, domainKw] of Object.entries(domainKeywords)) {
      const score = domainKw.filter((kw) => content.toLowerCase().includes(kw.toLowerCase())).length;
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domain;
      }
    }

    return bestDomain;
  }

  /**
   * 计算信息密度
   */
  private calculateInformationDensity(content: string): number {
    if (!content) return 0;

    const words = content.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;

    // 计算独特词汇比例
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    const vocabularyRatio = uniqueWords.size / words.length;

    // 计算标点符号密度（表示句子复杂度）
    const punctuationCount = (content.match(/[，。！？；,.!?;]/g) || []).length;
    const punctuationRatio = punctuationCount / words.length;

    // 计算平均句长
    const sentences = content.split(/[。.!?！？]+/).filter((s) => s.trim().length > 0);
    const avgSentenceLength = sentences.length > 0
      ? words.length / sentences.length
      : 0;

    // 综合评分
    const density = (vocabularyRatio * 0.4 + punctuationRatio * 0.3 + Math.min(avgSentenceLength / 20, 1) * 0.3);

    return Math.min(Math.max(density, 0), 1);
  }

  /**
   * 分析情感倾向
   */
  private analyzeSentiment(content: string): number {
    const positiveWords = ['好', '优秀', '成功', '喜欢', '推荐', '棒', '赞', 'good', 'great', 'excellent'];
    const negativeWords = ['差', '坏', '问题', '失败', '糟糕', '差评', 'bad', 'poor', 'terrible'];

    const lowerContent = content.toLowerCase();
    const positiveCount = positiveWords.filter((w) => lowerContent.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => lowerContent.includes(w)).length;

    const total = positiveCount + negativeCount;
    if (total === 0) return 0;

    return (positiveCount - negativeCount) / total;
  }

  /**
   * 计算时间衰减
   */
  private calculateTimeDecay(createdAt: string): number {
    const createdDate = new Date(createdAt);
    const now = new Date();
    const daysDiff = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

    // 指数衰减: e^(-λ * t)
    return Math.exp(-this.config.timeDecayFactor * daysDiff);
  }

  /**
   * 计算行为分数
   */
  private calculateBehaviorScore(behavior: BehaviorData): number {
    const { readCount, annotationCount, ideaCount, relatedKnowledgeCount } = behavior;
    const { behaviorWeights } = this.config;

    const readScore = Math.min(readCount * behaviorWeights.readCount, 1);
    const annotationScore = Math.min(annotationCount * behaviorWeights.annotationCount, 1);
    const ideaScore = Math.min(ideaCount * behaviorWeights.ideaCount, 1);
    const relationScore = Math.min(relatedKnowledgeCount * 0.1, 1);

    return (readScore + annotationScore + ideaScore + relationScore) / 4;
  }

  /**
   * 评估重要性
   */
  evaluateImportance(
    content: string,
    behavior?: BehaviorData
  ): ImportanceLevelValue {
    const contentAnalysis = this.analyzeContent(content);
    let score = 0;

    // 内容分析分数
    const keywordScore = this.calculateKeywordScore(content, 'importance');
    const domainScore = contentAnalysis.domain
      ? this.getDomainWeight(contentAnalysis.domain, 'importance')
      : 0;
    const densityScore = contentAnalysis.informationDensity;

    score = (keywordScore * 0.4 + domainScore * 0.3 + densityScore * 0.3);

    // 行为分数
    if (behavior) {
      const behaviorScore = this.calculateBehaviorScore(behavior);
      score = score * 0.7 + behaviorScore * 0.3;
    }

    // 映射到等级
    if (score >= this.config.importanceThresholds.high) {
      return ImportanceLevel.HIGH;
    } else if (score >= this.config.importanceThresholds.medium) {
      return ImportanceLevel.MEDIUM;
    } else {
      return ImportanceLevel.LOW;
    }
  }

  /**
   * 评估紧急度
   */
  evaluateUrgency(
    content: string,
    createdAt?: string,
    behavior?: BehaviorData
  ): UrgencyLevelValue {
    const contentAnalysis = this.analyzeContent(content);
    let score = 0;

    // 内容分析分数
    const keywordScore = this.calculateKeywordScore(content, 'urgency');
    const domainScore = contentAnalysis.domain
      ? this.getDomainWeight(contentAnalysis.domain, 'urgency')
      : 0;

    score = keywordScore * 0.6 + domainScore * 0.4;

    // 时间衰减
    if (createdAt) {
      const decay = this.calculateTimeDecay(createdAt);
      // 新内容更紧急
      score = score * 0.7 + (1 - decay) * 0.3;
    }

    // 行为分数
    if (behavior) {
      const behaviorScore = this.calculateBehaviorScore(behavior);
      score = score * 0.8 + behaviorScore * 0.2;
    }

    // 映射到等级
    if (score >= this.config.urgencyThresholds.urgent) {
      return UrgencyLevel.URGENT;
    } else if (score >= this.config.urgencyThresholds.normal) {
      return UrgencyLevel.NORMAL;
    } else {
      return UrgencyLevel.NOT_URGENT;
    }
  }

  /**
   * 计算关键词分数
   */
  private calculateKeywordScore(content: string, category: 'importance' | 'urgency'): number {
    const lowerContent = content.toLowerCase();
    const keywords = this.config.keywordWeights.filter(
      (kw) => kw.category === category && lowerContent.includes(kw.keyword.toLowerCase())
    );

    if (keywords.length === 0) return 0;

    const maxWeight = Math.max(...keywords.map((k) => k.weight));
    const avgWeight = keywords.reduce((sum, k) => sum + k.weight, 0) / keywords.length;

    return Math.min(maxWeight * 0.6 + avgWeight * 0.4, 1);
  }

  /**
   * 获取领域权重
   */
  private getDomainWeight(domain: string, category: 'importance' | 'urgency'): number {
    const domainWeight = this.config.domainWeights.find(
      (d) => d.domain === domain
    );

    if (!domainWeight) return 0;

    return category === 'importance'
      ? domainWeight.importanceWeight
      : domainWeight.urgencyWeight;
  }

  /**
   * 计算综合优先级分数
   */
  calculatePriorityScore(
    content: string,
    behavior?: BehaviorData,
    createdAt?: string
  ): number {
    const importance = this.evaluateImportance(content, behavior);
    const urgency = this.evaluateUrgency(content, createdAt, behavior);

    // 转换为数值
    const importanceValue = importance === 'high' ? 1 : importance === 'medium' ? 0.6 : 0.3;
    const urgencyValue = urgency === 'urgent' ? 1 : urgency === 'normal' ? 0.6 : 0.3;

    // Eisenhower 矩阵权重: 重要性 60%, 紧急度 40%
    return importanceValue * 0.6 + urgencyValue * 0.4;
  }

  /**
   * 计算完整优先级结果
   */
  calculatePriority(
    content: string,
    behavior?: BehaviorData,
    createdAt?: string
  ): PriorityResult {

    const importance = this.evaluateImportance(content, behavior);
    const urgency = this.evaluateUrgency(content, createdAt, behavior);

    // 计算分数
    const importanceValue = importance === 'high' ? 1 : importance === 'medium' ? 0.6 : 0.3;
    const urgencyValue = urgency === 'urgent' ? 1 : urgency === 'normal' ? 0.6 : 0.3;

    const keywordScore = this.calculateKeywordScore(content, 'importance');
    const behaviorScore = behavior ? this.calculateBehaviorScore(behavior) : 0;
    const timeDecay = createdAt ? this.calculateTimeDecay(createdAt) : 1;

    const score = importanceValue * 0.6 + urgencyValue * 0.4;

    return {
      importance,
      urgency,
      score: Math.round(score * 100),
      factors: {
        contentScore: keywordScore,
        behaviorScore,
        timeDecay,
      },
    };
  }

  /**
   * 分析想法
   */
  analyzeIdea(content: string): IdeaAnalysis {
    const analysis = this.analyzeContent(content);
    const priority = this.calculatePriority(content);

    return {
      practiceStatus: this.guessPracticeStatus(content),
      confidence: analysis.informationDensity,
      keywords: analysis.keywords,
      domain: analysis.domain,
      suggestedTags: this.generateTags(analysis),
      estimatedPriority: {
        importance: priority.importance,
        urgency: priority.urgency,
      },
    };
  }

  /**
   * 猜测实践状态
   */
  private guessPracticeStatus(content: string): PracticeStatusValue {
    const lowerContent = content.toLowerCase();

    // 完成状态关键词
    const doneKeywords = ['已完成', '完成了', '已经', '搞定', 'done', 'finished', 'completed'];
    if (doneKeywords.some((k) => lowerContent.includes(k))) {
      return 'done';
    }

    // 进行中状态关键词
    const activeKeywords = ['正在', '进行中', '计划中', '准备中', 'in progress', 'planning'];
    if (activeKeywords.some((k) => lowerContent.includes(k))) {
      return 'active';
    }

    // 待跟进状态关键词
    const pendingKeywords = ['待办', '待处理', '需要', '希望', 'todo', 'need', 'wish'];
    if (pendingKeywords.some((k) => lowerContent.includes(k))) {
      return 'pending';
    }

    return 'new';
  }

  /**
   * 生成标签
   */
  private generateTags(analysis: ContentAnalysis): string[] {
    const tags: string[] = [];

    if (analysis.domain) {
      tags.push(analysis.domain);
    }

    if (analysis.keywords.length > 0) {
      tags.push(...analysis.keywords.slice(0, 3));
    }

    if (analysis.informationDensity > 0.7) {
      tags.push('高密度');
    } else if (analysis.informationDensity < 0.3) {
      tags.push('低密度');
    }

    return tags;
  }

  /**
   * 排序想法列表
   */
  sortIdeas(ideas: Idea[]): Idea[] {
    return [...ideas].sort((a, b) => {
      // 首先按状态排序
      const statusOrder: Record<PracticeStatusValue, number> = {
        new: 0,
        pending: 1,
        active: 2,
        done: 3,
        falsified: 4,
      };

      const statusDiff = statusOrder[a.practiceStatus] - statusOrder[b.practiceStatus];
      if (statusDiff !== 0) return statusDiff;

      // 然后按优先级分数排序
      return b.priorityScore - a.priorityScore;
    });
  }

  /**
   * 获取提醒时间
   */
  calculateReminderTime(urgency: UrgencyLevelValue, createdAt: string): string | undefined {
    const createdDate = new Date(createdAt);

    switch (urgency) {
      case UrgencyLevel.URGENT:
        // 紧急：1小时后提醒
        return new Date(createdDate.getTime() + 60 * 60 * 1000).toISOString();
      case UrgencyLevel.NORMAL:
        // 一般：24小时后提醒
        return new Date(createdDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
      case UrgencyLevel.NOT_URGENT:
        // 不紧急：7天后提醒
        return new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  }
}

/**
 * 默认优先级引擎实例
 */
export const priorityEngine = new PriorityEngine();

/**
 * 导出类型
 */
export type { PriorityConfig, BehaviorData, ContentAnalysis };