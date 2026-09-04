/**
 * 问题发现引擎测试
 * @module src/lib/__tests__/question-discovery.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QuestionDiscoveryEngine, createQuestionDiscoveryEngine } from '../research/question-discovery';
import type { DiscoveredQuestion } from '../../types/research';

describe('QuestionDiscoveryEngine', () => {
  let engine: QuestionDiscoveryEngine;

  beforeEach(() => {
    engine = new QuestionDiscoveryEngine({
      minQuestionLength: 5,
      maxDiscoveries: 10,
      valueThreshold: 5,
    });
  });

  describe('基本配置', () => {
    it('应该使用默认配置', () => {
      const defaultEngine = new QuestionDiscoveryEngine();
      expect(defaultEngine).toBeDefined();
    });

    it('应该使用自定义配置', () => {
      const customEngine = new QuestionDiscoveryEngine({
        minQuestionLength: 10,
        maxDiscoveries: 5,
        valueThreshold: 8,
      });
      expect(customEngine).toBeDefined();
    });

    it('createQuestionDiscoveryEngine应该创建实例', () => {
      const created = createQuestionDiscoveryEngine();
      expect(created).toBeInstanceOf(QuestionDiscoveryEngine);
    });
  });

  describe('从文本发现问题', () => {
    it('应该发现疑问句', async () => {
      const text = '今天天气很好。什么是机器学习？我觉得应该学习一下。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].question).toContain('什么是机器学习');
    });

    it('应该发现多个疑问句', async () => {
      const text = `
        什么是人工智能？
        如何学习编程？
        为什么天空是蓝色的？
        这些是今天要研究的问题。
      `;
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBe(3);
    });

    it('应该返回完整的问题信息', async () => {
      const text = '什么是量子计算？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      const q = questions[0];
      expect(q.question).toBeDefined();
      expect(q.type).toBeDefined();
      expect(q.typeConfidence).toBeGreaterThanOrEqual(0);
      expect(q.typeConfidence).toBeLessThanOrEqual(1);
      expect(q.source).toEqual(source);
      expect(q.valueScore).toBeGreaterThanOrEqual(1);
      expect(q.valueScore).toBeLessThanOrEqual(10);
      expect(q.valueReason).toBeDefined();
      expect(q.recommendedMethodologies).toBeInstanceOf(Array);
    });

    it('应该处理没有问题的文本', async () => {
      const text = '今天天气很好。我去了公园散步。感觉非常放松。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBe(0);
    });

    it('应该处理空文本', async () => {
      const text = '';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions).toEqual([]);
    });

    it('应该处理短文本', async () => {
      const text = '你好？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 短于最小长度，应该被过滤
      expect(questions.length).toBe(0);
    });
  });

  describe('问题类型分类', () => {
    it('应该分类概念性问题', async () => {
      const text = '什么是机器学习？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].type).toBe('conceptual');
    });

    it('应该分类方法性问题', async () => {
      const text = '如何学习编程？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].type).toBe('methodological');
    });

    it('应该分类应用性问题', async () => {
      const text = '机器学习在医疗领域有什么应用？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 包含"应用"关键词
      expect(questions[0].type).toBeDefined();
    });

    it('应该计算类型置信度', async () => {
      const text = '什么是人工智能？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].typeConfidence).toBeGreaterThan(0);
      expect(questions[0].typeConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('矛盾点发现', () => {
    it('应该发现矛盾句', async () => {
      const text = '这个理论是正确的，但是实验结果却表明它是错误的。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
    });

    it('应该从矛盾句形成研究问题', async () => {
      const text = '方案A成本低，但是效率低。方案B效率高，但是成本高。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].source).toBe('contradiction');
    });

    it('应该处理多种矛盾关键词', async () => {
      const text = `
        这个方案很好，然而实施困难。
        理论上可行，但实际上却不可行。
        结果一致，相反预期相反。
      `;
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
    });
  });

  describe('知识缺口发现', () => {
    it('应该发现知识缺口', async () => {
      const text = '我们对这个领域的了解还不够清楚。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].source).toBe('gap');
    });

    it('应该从缺口形成问题', async () => {
      const text = '这个问题的答案未知。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].question).toContain('是什么');
    });

    it('应该处理多种缺口关键词', async () => {
      const text = `
        这个机制不清楚。
        那个原因不了解。
        这些是未知的。
        那些是未解决的。
        需要研究这个问题。
      `;
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
    });
  });

  describe('价值评估', () => {
    it('应该评估问题价值', async () => {
      const text = '这是一个重要的核心问题，必须解决。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].valueScore).toBeGreaterThanOrEqual(5);
    });

    it('矛盾问题应该有更高价值', async () => {
      const text = '理论上应该这样，但实际上却那样，这是一个矛盾。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 矛盾问题应该有加分
      expect(questions[0].valueScore).toBeGreaterThan(5);
    });

    it('应该生成评估理由', async () => {
      const text = '这是一个重要问题。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].valueReason).toBeDefined();
      expect(questions[0].valueReason.length).toBeGreaterThan(0);
    });

    it('长问题应该有加分', async () => {
      const text = '这是一个非常详细的问题，它包含了很多背景信息和上下文，需要深入研究。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 长问题应该有加分
      expect(questions[0].valueScore).toBeGreaterThanOrEqual(5);
    });
  });

  describe('方法论推荐', () => {
    it('应该推荐方法论', async () => {
      const text = '什么是机器学习？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].recommendedMethodologies.length).toBeGreaterThan(0);
    });

    it('应该推荐苏格拉底提问法', async () => {
      const text = '什么是这个概念？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].recommendedMethodologies).toContain('socratic');
    });

    it('应该推荐第一性原理', async () => {
      const text = '为什么这个现象会发生？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions[0].recommendedMethodologies).toContain('first-principles');
    });
  });

  describe('从对话发现问题', () => {
    it('应该从对话发现问题', async () => {
      const conversation = `
        用户: 你好，我想了解一下机器学习。
        AI: 你好！机器学习是人工智能的一个分支。
        用户: 什么是深度学习？
        AI: 深度学习是机器学习的一种方法。
        用户: 如何开始学习？
      `;
      const conversationId = 'conv-1';

      const questions = await engine.discoverFromConversation(conversation, conversationId);

      expect(questions.length).toBeGreaterThan(0);
    });

    it('应该标记来源为conversation', async () => {
      const conversation = '用户: 什么是人工智能？';
      const conversationId = 'conv-1';

      const questions = await engine.discoverFromConversation(conversation, conversationId);

      expect(questions[0].source.type).toBe('conversation');
      expect(questions[0].source.sourceId).toBe(conversationId);
    });
  });

  describe('从想法发现问题', () => {
    it('应该从想法发现问题', async () => {
      const ideaContent = '我有一个想法：研究机器学习在医疗领域的应用。什么是深度学习？';
      const ideaId = 'idea-1';

      const questions = await engine.discoverFromIdea(ideaContent, ideaId);

      expect(questions.length).toBeGreaterThan(0);
    });

    it('应该标记来源为idea', async () => {
      const ideaContent = '研究这个问题的答案未知。';
      const ideaId = 'idea-1';

      const questions = await engine.discoverFromIdea(ideaContent, ideaId);

      expect(questions[0].source.type).toBe('idea');
      expect(questions[0].source.sourceId).toBe(ideaId);
    });
  });

  describe('过滤和排序', () => {
    it('应该按价值排序', async () => {
      const text = `
        低价值问题。
        这是一个重要的核心问题。
        这是什么？
      `;
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 应该按价值降序排列
      for (let i = 1; i < questions.length; i++) {
        expect(questions[i - 1].valueScore).toBeGreaterThanOrEqual(questions[i].valueScore);
      }
    });

    it('应该过滤低价值问题', async () => {
      const engineWithHighThreshold = new QuestionDiscoveryEngine({
        minQuestionLength: 5,
        maxDiscoveries: 10,
        valueThreshold: 8, // 高阈值
      });

      const text = '这是什么？这是一个问题。';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engineWithHighThreshold.discoverFromText(text, source);

      // 低价值问题应该被过滤
      expect(questions.length).toBe(0);
    });

    it('应该限制最大发现数量', async () => {
      const text = `
        问题1是什么？
        问题2如何做？
        问题3为什么？
        问题4在哪里？
        问题5什么时候？
        问题6是谁？
        问题7怎么办？
        问题8怎么做？
        问题9如何理解？
        问题10怎么理解？
        问题11还有吗？
      `;
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 应该不超过最大数量
      expect(questions.length).toBeLessThanOrEqual(10);
    });

    it('应该去重', async () => {
      const text = '什么是机器学习？什么是机器学习？什么是机器学习？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 重复问题应该被去重
      const uniqueQuestions = new Set(questions.map(q => q.question));
      expect(questions.length).toBe(uniqueQuestions.size);
    });
  });

  describe('英文问题', () => {
    it('应该发现英文疑问句', async () => {
      const text = 'What is machine learning? How does it work?';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
    });

    it('应该发现英文疑问词', async () => {
      const text = 'How to learn programming? Why is the sky blue?';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
    });
  });

  describe('边界条件', () => {
    it('应该处理特殊字符', async () => {
      const text = '什么是"特殊字符"？什么是<标签>？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions.length).toBeGreaterThan(0);
    });

    it('应该处理Unicode字符', async () => {
      const text = '什么是🎉表情符号？什么是中文？';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      // 应该能处理Unicode
      expect(questions).toBeDefined();
    });

    it('应该处理非常长的文本', async () => {
      const longText = '这是一个问题？'.repeat(1000);
      const source = {
        type: 'text' as const,
        rawContent: longText,
      };

      const questions = await engine.discoverFromText(longText, source);

      expect(questions).toBeDefined();
    });

    it('应该处理只有空白的文本', async () => {
      const text = '   \n\n   ';
      const source = {
        type: 'text' as const,
        rawContent: text,
      };

      const questions = await engine.discoverFromText(text, source);

      expect(questions).toEqual([]);
    });
  });
});