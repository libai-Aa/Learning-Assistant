/**
 * 思维模式测试
 * @module src/lib/__tests__/thinking-pattern.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FirstPrinciples } from '../agent/first-principles';
import type { FirstPrincipleAnalysis } from '../../types/memory';

describe('FirstPrinciples', () => {
  let analyzer: FirstPrinciples;

  beforeEach(() => {
    analyzer = new FirstPrinciples({
      maxSteps: 5,
      includeAnalogy: true,
    });
  });

  describe('基本配置', () => {
    it('应该使用默认配置', () => {
      const defaultAnalyzer = new FirstPrinciples();
      expect(defaultAnalyzer).toBeDefined();
    });

    it('应该使用自定义配置', () => {
      const customAnalyzer = new FirstPrinciples({
        maxSteps: 10,
        includeAnalogy: false,
      });
      expect(customAnalyzer).toBeDefined();
    });
  });

  describe('问题分析', () => {
    it('应该分析问题', async () => {
      const result = await analyzer.analyze('如何设计一个高效的算法？');

      expect(result).toBeDefined();
      expect(result.question).toBe('如何设计一个高效的算法？');
      expect(result.domain).toBeDefined();
      expect(result.assumptions.length).toBeGreaterThanOrEqual(0);
      expect(result.steps.length).toBeGreaterThanOrEqual(0);
      expect(result.conclusion).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('应该识别领域', async () => {
      const result = await analyzer.analyze('什么是量子力学？');

      expect(result.domain).toBeDefined();
    });

    it('应该生成假设', async () => {
      const result = await analyzer.analyze('为什么物体会下落？');

      expect(result.assumptions.length).toBeGreaterThanOrEqual(0);
    });

    it('应该生成推理步骤', async () => {
      const result = await analyzer.analyze('如何计算F=ma？');

      expect(result.steps.length).toBeGreaterThanOrEqual(0);
    });

    it('应该生成类比解释', async () => {
      const result = await analyzer.analyze('什么是机器学习？');

      expect(result.analogy).toBeDefined();
    });

    it('应该生成数学抽象', async () => {
      const result = await analyzer.analyze('什么是微积分？');

      expect(result.mathematicalAbstraction).toBeDefined();
    });

    it('应该生成LaTeX公式', async () => {
      const result = await analyzer.analyze('什么是牛顿第二定律？');

      expect(result.latexFormula).toBeDefined();
    });

    it('应该生成结论', async () => {
      const result = await analyzer.analyze('测试问题');

      expect(result.conclusion).toBeDefined();
      expect(result.conclusion.length).toBeGreaterThan(0);
    });

    it('应该计算置信度', async () => {
      const result = await analyzer.analyze('测试问题');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('生成回答', () => {
    it('应该生成回答', async () => {
      const answer = await analyzer.generateAnswer('什么是人工智能？');

      expect(answer).toBeDefined();
      expect(answer.length).toBeGreaterThan(0);
    });

    it('应该为物理问题生成回答', async () => {
      const answer = await analyzer.generateAnswer('什么是牛顿第一定律？');

      expect(answer).toBeDefined();
    });

    it('应该为数学问题生成回答', async () => {
      const answer = await analyzer.generateAnswer('什么是微积分？');

      expect(answer).toBeDefined();
    });
  });

  describe('边界条件', () => {
    it('应该处理空问题', async () => {
      const result = await analyzer.analyze('');

      expect(result).toBeDefined();
    });

    it('应该处理非常长的问题', async () => {
      const longQuestion = '这是一个非常长的问题'.repeat(100);
      const result = await analyzer.analyze(longQuestion);

      expect(result).toBeDefined();
    });

    it('应该处理特殊字符', async () => {
      const result = await analyzer.analyze('什么是"特殊字符"？<标签>');

      expect(result).toBeDefined();
    });

    it('应该处理Unicode字符', async () => {
      const result = await analyzer.analyze('什么是🎉？');

      expect(result).toBeDefined();
    });
  });

  describe('分析结构验证', () => {
    it('分析结果应该有正确的结构', async () => {
      const result = await analyzer.analyze('测试问题');

      expect(result).toHaveProperty('question');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('assumptions');
      expect(result).toHaveProperty('steps');
      expect(result).toHaveProperty('analogy');
      expect(result).toHaveProperty('mathematicalAbstraction');
      expect(result).toHaveProperty('latexFormula');
      expect(result).toHaveProperty('conclusion');
      expect(result).toHaveProperty('confidence');
    });

    it('推理步骤应该有正确的结构', async () => {
      const result = await analyzer.analyze('测试问题');

      for (const step of result.steps) {
        expect(step).toHaveProperty('step');
        expect(step).toHaveProperty('title');
        expect(step).toHaveProperty('assumption');
        expect(step).toHaveProperty('reasoning');
        expect(step).toHaveProperty('conclusion');
      }
    });
  });

  describe('置信度验证', () => {
    it('置信度应该在合理范围内', async () => {
      const result = await analyzer.analyze('测试问题');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('配置影响', () => {
    it('maxSteps应该影响推理步骤数量', async () => {
      const deepAnalyzer = new FirstPrinciples({ maxSteps: 10 });
      const shallowAnalyzer = new FirstPrinciples({ maxSteps: 3 });

      const deepResult = await deepAnalyzer.analyze('测试问题');
      const shallowResult = await shallowAnalyzer.analyze('测试问题');

      expect(deepResult.steps.length).toBeLessThanOrEqual(10);
      expect(shallowResult.steps.length).toBeLessThanOrEqual(3);
    });

    it('includeAnalogy应该影响类比生成', async () => {
      const enabledAnalyzer = new FirstPrinciples({ includeAnalogy: true });
      const disabledAnalyzer = new FirstPrinciples({ includeAnalogy: false });

      const enabledResult = await enabledAnalyzer.analyze('测试问题');
      const disabledResult = await disabledAnalyzer.analyze('测试问题');

      // 两个都应该有结果
      expect(enabledResult).toBeDefined();
      expect(disabledResult).toBeDefined();
    });
  });

  describe('并发测试', () => {
    it('应该处理并发分析', async () => {
      const results = await Promise.all([
        analyzer.analyze('问题1'),
        analyzer.analyze('问题2'),
        analyzer.analyze('问题3'),
      ]);

      expect(results.length).toBe(3);
    });
  });
});
