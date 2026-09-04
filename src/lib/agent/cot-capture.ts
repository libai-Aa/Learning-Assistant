/**
 * 思维链捕捉模块
 * 从对话中提取用户的思维链和推理过程
 */

import type {
  ChainOfThought,
  ThoughtStep,
  ThoughtStepType,
} from '../../types/memory';

/**
 * 思维链捕捉配置
 */
export interface CoTCaptureConfig {
  /** 最小步骤数 */
  minSteps?: number;
  /** 最大步骤数 */
  maxSteps?: number;
  /** 是否捕捉推理细节 */
  captureReasoningDetails?: boolean;
  /** 置信度阈值 */
  confidenceThreshold?: number;
}

/**
 * 对话消息接口
 */
export interface ChatMessage {
  /** 消息ID */
  id: string;
  /** 角色 */
  role: 'user' | 'assistant' | 'system';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 使用的知识ID列表 */
  usedKnowledgeIds?: string[];
}

/**
 * 思维链捕捉器
 */
export class CoTCapture {
  private config: Required<CoTCaptureConfig>;

  constructor(config: CoTCaptureConfig = {}) {
    this.config = {
      minSteps: 2,
      maxSteps: 10,
      captureReasoningDetails: true,
      confidenceThreshold: 0.6,
      ...config,
    };
  }

  /**
   * 从对话中捕捉思维链
   */
  async captureFromConversation(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<ChainOfThought | null> {
    if (messages.length < 2) {
      return null;
    }

    // 提取用户问题和AI回答
    const userMessage = messages.find((m) => m.role === 'user');
    const assistantMessage = messages.find((m) => m.role === 'assistant');

    if (!userMessage || !assistantMessage) {
      return null;
    }

    // 提取思维步骤
    const steps = this.extractSteps(userMessage.content, assistantMessage.content);

    if (steps.length < this.config.minSteps) {
      return null;
    }

    // 限制步骤数量
    const limitedSteps = steps.slice(0, this.config.maxSteps);

    // 判断知识来源
    const knowledgeSource = this.determineKnowledgeSource(
      assistantMessage.usedKnowledgeIds
    );

    const now = new Date().toISOString();

    const chainOfThought: ChainOfThought = {
      id: this.generateId(sessionId, now),
      sessionId,
      question: userMessage.content,
      steps: limitedSteps,
      answer: assistantMessage.content,
      knowledgeSource,
      localKnowledgeCount: assistantMessage.usedKnowledgeIds?.length ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    return chainOfThought;
  }

  /**
   * 提取思维步骤
   */
  private extractSteps(question: string, answer: string): ThoughtStep[] {
    const steps: ThoughtStep[] = [];
    let stepNumber = 1;

    // 步骤1: 问题分析
    steps.push({
      step: stepNumber++,
      type: 'observation',
      thought: this.analyzeQuestion(question),
      confidence: 0.9,
      timestamp: new Date().toISOString(),
    });

    // 步骤2: 问题类型识别
    const questionType = this.classifyQuestion(question);
    steps.push({
      step: stepNumber++,
      type: 'inference',
      thought: `问题类型: ${questionType.description}`,
      confidence: questionType.confidence,
      timestamp: new Date().toISOString(),
    });

    // 步骤3: 知识检索策略
    steps.push({
      step: stepNumber++,
      type: 'reasoning',
      thought: this.determineSearchStrategy(question, questionType.type),
      confidence: 0.85,
      timestamp: new Date().toISOString(),
    });

    // 从答案中提取推理步骤
    if (this.config.captureReasoningDetails) {
      const reasoningSteps = this.extractReasoningFromAnswer(answer);
      for (const reasoning of reasoningSteps) {
        steps.push({
          step: stepNumber++,
          type: reasoning.type,
          thought: reasoning.content,
          confidence: reasoning.confidence,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 最后一步: 结论
    steps.push({
      step: stepNumber,
      type: 'conclusion',
      thought: this.extractConclusion(answer),
      confidence: 0.8,
      timestamp: new Date().toISOString(),
    });

    return steps;
  }

  /**
   * 分析问题
   */
  private analyzeQuestion(question: string): string {
    const keywords = this.extractKeywords(question);
    const questionType = this.detectQuestionType(question);

    return `用户问题包含关键词: ${keywords.join(', ')}。问题类型: ${questionType}。`;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单的关键词提取逻辑
    // 实际应用中可以使用NLP库或LLM
    const stopWords = new Set([
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
      '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
      '没有', '看', '好', '自己', '这', 'the', 'a', 'an', 'is', 'are', 'was',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    ]);

    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()));

    // 返回去重后的前5个关键词
    return [...new Set(words)].slice(0, 5);
  }

  /**
   * 检测问题类型
   */
  private detectQuestionType(question: string): string {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('如何') || lowerQuestion.includes('how')) {
      return '方法型问题';
    }
    if (lowerQuestion.includes('为什么') || lowerQuestion.includes('why')) {
      return '原因型问题';
    }
    if (lowerQuestion.includes('是什么') || lowerQuestion.includes('what')) {
      return '概念型问题';
    }
    if (lowerQuestion.includes('是否') || lowerQuestion.includes('是否')) {
      return '判断型问题';
    }
    return '开放型问题';
  }

  /**
   * 分类问题
   */
  private classifyQuestion(
    question: string
  ): { type: string; description: string; confidence: number } {
    const lowerQuestion = question.toLowerCase();

    // 理工科关键词
    const stemKeywords = [
      '数学', '物理', '化学', '生物', '计算机', '工程', '算法', '公式',
      '理论', '模型', '计算', '分析', '证明', '推导', '实验',
      'math', 'physics', 'chemistry', 'algorithm', 'formula', 'theory',
    ];

    // 文科关键词
    const humanitiesKeywords = [
      '历史', '文学', '哲学', '艺术', '文化', '社会', '政治', '经济',
      'history', 'literature', 'philosophy', 'art', 'culture',
    ];

    const isStemQuestion = stemKeywords.some((k) =>
      lowerQuestion.includes(k.toLowerCase())
    );
    const isHumanitiesQuestion = humanitiesKeywords.some((k) =>
      lowerQuestion.includes(k.toLowerCase())
    );

    if (isStemQuestion) {
      return {
        type: 'STEM',
        description: '理工科问题，建议使用第一性原理分析',
        confidence: 0.85,
      };
    }

    if (isHumanitiesQuestion) {
      return {
        type: 'Humanities',
        description: '人文社科问题，建议使用苏格拉底提问法',
        confidence: 0.8,
      };
    }

    return {
      type: 'General',
      description: '通用问题，使用标准推理流程',
      confidence: 0.7,
    };
  }

  /**
   * 确定搜索策略
   */
  private determineSearchStrategy(
    _question: string,
    questionType: string
  ): string {
    if (questionType === 'STEM') {
      return '优先检索本地知识库中的公式、定理、推导过程。如本地知识不足，调用外部搜索获取权威来源。';
    }

    if (questionType === 'Humanities') {
      return '优先检索本地知识库中的文献、历史记录。如本地知识不足，调用外部搜索获取学术资料。';
    }

    return '执行本地知识优先检索策略，根据相关性排序返回结果。';
  }

  /**
   * 从答案中提取推理步骤
   */
  private extractReasoningFromAnswer(
    answer: string
  ): Array<{ type: ThoughtStepType; content: string; confidence: number }> {
    const steps: Array<{
      type: ThoughtStepType;
      content: string;
      confidence: number;
    }> = [];

    // 分割句子
    const sentences = answer.split(/[。.!?！？.]/).filter((s) => s.trim().length > 0);

    // 分析每个句子的类型
    for (const sentence of sentences.slice(0, 5)) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      let type: ThoughtStepType = 'reasoning';
      let confidence = 0.7;

      if (
        trimmed.includes('首先') ||
        trimmed.includes('首先') ||
        trimmed.startsWith('First') ||
        trimmed.startsWith('首先')
      ) {
        type = 'observation';
        confidence = 0.85;
      } else if (
        trimmed.includes('因此') ||
        trimmed.includes('所以') ||
        trimmed.startsWith('Therefore') ||
        trimmed.startsWith('Thus')
      ) {
        type = 'inference';
        confidence = 0.85;
      } else if (
        trimmed.includes('结论') ||
        trimmed.includes('总结') ||
        trimmed.startsWith('In conclusion') ||
        trimmed.startsWith('总之')
      ) {
        type = 'conclusion';
        confidence = 0.9;
      } else if (
        trimmed.includes('?') ||
        trimmed.includes('？') ||
        trimmed.includes('是否')
      ) {
        type = 'question';
        confidence = 0.75;
      }

      steps.push({
        type,
        content: trimmed,
        confidence,
      });
    }

    return steps;
  }

  /**
   * 提取结论
   */
  private extractConclusion(answer: string): string {
    // 尝试找到结论性语句
    const conclusionPatterns = [
      /因此[，,]?\s*(.+?)(?:。|$)/,
      /所以[，,]?\s*(.+?)(?:。|$)/,
      /总之[，,]?\s*(.+?)(?:。|$)/,
      /结论是[：:]\s*(.+?)(?:。|$)/,
      /Therefore[,]?\s*(.+?)(?:\.|$)/i,
      /In conclusion[,]?\s*(.+?)(?:\.|$)/i,
    ];

    for (const pattern of conclusionPatterns) {
      const match = answer.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // 如果没找到明确的结论，返回最后一段
    const sentences = answer.split(/[。.!?！？.]/).filter((s) => s.trim().length > 0);
    if (sentences.length > 0) {
      return sentences[sentences.length - 1].trim();
    }

    return answer;
  }

  /**
   * 判断知识来源
   */
  private determineKnowledgeSource(
    usedKnowledgeIds?: string[]
  ): 'local' | 'external' | 'mixed' {
    if (!usedKnowledgeIds || usedKnowledgeIds.length === 0) {
      return 'external';
    }

    // 检查是否所有知识都是本地的
    const allLocal = usedKnowledgeIds.every((id) => id.startsWith('local_'));
    if (allLocal) {
      return 'local';
    }

    // 混合来源
    return 'mixed';
  }

  /**
   * 生成唯一ID
   */
  private generateId(sessionId: string, timestamp: string): string {
    const hash = this.simpleHash(sessionId + timestamp);
    // 加入随机数确保同一毫秒内多次调用也能生成唯一ID
    return `cot_${hash}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * 创建默认的思维链捕捉器
 */
export function createCoTCapture(config?: CoTCaptureConfig): CoTCapture {
  return new CoTCapture(config);
}