/**
 * 第一性原理模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FirstPrinciples,
  createFirstPrinciples,
  analyzeFirstPrinciples,
  answerFirstPrinciples,
} from '../first-principles';
import type { FirstPrincipleAnalysis } from '../../../types/memory';

describe('FirstPrinciples', () => {
  let analyzer: FirstPrinciples;

  beforeEach(() => {
    analyzer = createFirstPrinciples({
      maxSteps: 5,
      includeAnalogy: true,
      includeMathematicalAbstraction: true,
      includeLatexFormula: true,
      confidenceThreshold: 0.7,
    });
  });

  describe('analyze', () => {
    it('应该分析物理问题', async () => {
      const question = '为什么物体会下落？';
      const analysis = await analyzer.analyze(question);

      expect(analysis.question).toBe(question);
      expect(analysis.domain).toBe('物理学');
      expect(analysis.assumptions.length).toBeGreaterThan(0);
      expect(analysis.steps.length).toBeGreaterThan(0);
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.conclusion.length).toBeGreaterThan(0);
    });

    it('应该分析数学问题', async () => {
      const question = '如何计算导数？';
      const analysis = await analyzer.analyze(question);

      expect(analysis.domain).toBe('数学');
      expect(analysis.steps.length).toBeGreaterThan(0);
    });

    it('应该分析计算机科学问题', async () => {
      const question = '什么是算法复杂度？';
      const analysis = await analyzer.analyze(question);

      expect(analysis.domain).toBe('计算机科学');
      expect(analysis.steps.length).toBeGreaterThan(0);
    });

    it('应该包含类比解释', async () => {
      const question = '什么是加速度？';
      const analysis = await analyzer.analyze(question);

      expect(analysis.analogy.length).toBeGreaterThan(0);
    });

    it('应该包含数学抽象', async () => {
      const question = '如何计算速度？';
      const analysis = await analyzer.analyze(question);

      expect(analysis.mathematicalAbstraction.length).toBeGreaterThan(0);
    });

    it('应该包含LaTeX公式', async () => {
      const question = '什么是牛顿第二定律？';
      const analysis = await analyzer.analyze(question);

      expect(analysis.latexFormula.length).toBeGreaterThan(0);
      expect(analysis.latexFormula).toContain('$$');
    });

    it('应该生成有效的推理步骤', async () => {
      const question = '为什么苹果会落地？';
      const analysis = await analyzer.analyze(question);

      for (const step of analysis.steps) {
        expect(step.step).toBeGreaterThan(0);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.assumption.length).toBeGreaterThan(0);
        expect(step.reasoning.length).toBeGreaterThan(0);
        expect(step.conclusion.length).toBeGreaterThan(0);
      }
    });

    it('置信度应该在合理范围内', async () => {
      const question = '什么是力？';
      const analysis = await analyzer.analyze(question);

      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('generateAnswer', () => {
    it('应该生成格式化的回答', async () => {
      const question = '什么是能量守恒定律？';
      const answer = await analyzer.generateAnswer(question);

      expect(answer.length).toBeGreaterThan(0);
      expect(answer).toContain('第一性原理分析');
      expect(answer).toContain('基础假设');
      expect(answer).toContain('推理步骤');
      expect(answer).toContain('结论');
    });

    it('应该包含所有必要部分', async () => {
      const question = '如何计算功？';
      const answer = await analyzer.generateAnswer(question);

      // 检查是否包含关键部分
      expect(answer).toContain('问题');
      expect(answer).toContain('领域分类');
      expect(answer).toContain('置信度');
    });
  });

  describe('问题分类', () => {
    it('应该正确分类物理问题', async () => {
      const physicsQuestions = [
        '什么是牛顿第一定律？',
        '如何计算力？',
        '电磁波是什么？',
        '量子力学的原理是什么？',
      ];

      for (const question of physicsQuestions) {
        const analysis = await analyzer.analyze(question);
        expect(analysis.domain).toBe('物理学');
      }
    });

    it('应该正确分类数学问题', async () => {
      const mathQuestions = [
        '如何求导数？',
        '微积分的基本定理是什么？',
        '如何解方程？',
        '矩阵乘法怎么计算？',
      ];

      for (const question of mathQuestions) {
        const analysis = await analyzer.analyze(question);
        expect(analysis.domain).toBe('数学');
      }
    });

    it('应该正确分类计算机科学问题', async () => {
      const csQuestions = [
        '什么是算法？',
        '数据结构有哪些？',
        '机器学习怎么工作？',
        '神经网络的原理是什么？',
      ];

      for (const question of csQuestions) {
        const analysis = await analyzer.analyze(question);
        expect(analysis.domain).toBe('计算机科学');
      }
    });

    it('应该处理未知领域问题', async () => {
      const question = '今天天气怎么样？';
      const analysis = await analyzer.analyze(question);

      // 未知领域应该被分类为"其他"
      expect(analysis.domain).toBe('其他');
    });
  });

  describe('配置选项', () => {
    it('应该支持禁用类比', async () => {
      const noAnalogyAnalyzer = createFirstPrinciples({
        includeAnalogy: false,
      });

      const question = '什么是速度？';
      const analysis = await noAnalogyAnalyzer.analyze(question);

      expect(analysis.analogy).toBe('');
    });

    it('应该支持禁用数学抽象', async () => {
      const noMathAnalyzer = createFirstPrinciples({
        includeMathematicalAbstraction: false,
      });

      const question = '什么是力？';
      const analysis = await noMathAnalyzer.analyze(question);

      expect(analysis.mathematicalAbstraction).toBe('');
    });

    it('应该支持禁用LaTeX公式', async () => {
      const noLatexAnalyzer = createFirstPrinciples({
        includeLatexFormula: false,
      });

      const question = '什么是牛顿定律？';
      const analysis = await noLatexAnalyzer.analyze(question);

      expect(analysis.latexFormula).toBe('');
    });

    it('应该限制最大步骤数', async () => {
      const limitedAnalyzer = createFirstPrinciples({
        maxSteps: 3,
      });

      const question = '为什么物体会下落？';
      const analysis = await limitedAnalyzer.analyze(question);

      expect(analysis.steps.length).toBeLessThanOrEqual(3);
    });
  });
});

describe('便捷函数', () => {
  describe('analyzeFirstPrinciples', () => {
    it('应该分析问题', async () => {
      const question = '什么是加速度？';
      const analysis = await analyzeFirstPrinciples(question);

      expect(analysis.question).toBe(question);
      expect(analysis.domain).toBe('物理学');
    });

    it('应该使用自定义配置', async () => {
      const question = '测试问题';
      const analysis = await analyzeFirstPrinciples(question, {
        maxSteps: 3,
      });

      expect(analysis.steps.length).toBeLessThanOrEqual(3);
    });
  });

  describe('answerFirstPrinciples', () => {
    it('应该生成回答', async () => {
      const question = '什么是力？';
      const answer = await answerFirstPrinciples(question);

      expect(answer.length).toBeGreaterThan(0);
      expect(answer).toContain('第一性原理分析');
    });
  });
});

describe('FirstPrincipleAnalysis 类型', () => {
  it('应该符合接口定义', async () => {
    const question = '测试问题';
    const analysis = await analyzeFirstPrinciples(question);

    // 检查所有必需字段
    expect(typeof analysis.question).toBe('string');
    expect(typeof analysis.domain).toBe('string');
    expect(Array.isArray(analysis.assumptions)).toBe(true);
    expect(Array.isArray(analysis.steps)).toBe(true);
    expect(typeof analysis.analogy).toBe('string');
    expect(typeof analysis.mathematicalAbstraction).toBe('string');
    expect(typeof analysis.latexFormula).toBe('string');
    expect(typeof analysis.conclusion).toBe('string');
    expect(typeof analysis.confidence).toBe('number');

    // 检查步骤结构
    for (const step of analysis.steps) {
      expect(typeof step.step).toBe('number');
      expect(typeof step.title).toBe('string');
      expect(typeof step.assumption).toBe('string');
      expect(typeof step.reasoning).toBe('string');
      expect(typeof step.conclusion).toBe('string');
    }
  });
});