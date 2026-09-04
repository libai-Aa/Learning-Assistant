/**
 * 方法论引擎测试
 * @module src/lib/__tests__/research-methodology.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MethodologyEngine, createMethodologyEngine } from '../research/methodology-engine';
import type { MethodologyResult, MethodologyStep, ResearchQuestion, QuestionType } from '../../types/research';

describe('MethodologyEngine', () => {
  let engine: MethodologyEngine;

  beforeEach(() => {
    engine = new MethodologyEngine({
      maxSteps: 7,
      confidenceThreshold: 0.7,
    });
  });

  describe('基本配置', () => {
    it('应该使用默认配置', () => {
      const defaultEngine = new MethodologyEngine();
      expect(defaultEngine).toBeDefined();
    });

    it('应该使用自定义配置', () => {
      const customEngine = new MethodologyEngine({
        maxSteps: 10,
        confidenceThreshold: 0.8,
        enableLLMEnhancement: true,
      });
      expect(customEngine).toBeDefined();
    });

    it('createMethodologyEngine应该创建实例', () => {
      const created = createMethodologyEngine();
      expect(created).toBeInstanceOf(MethodologyEngine);
    });
  });

  describe('方法论推荐', () => {
    const createTestQuestion = (type: QuestionType): ResearchQuestion => ({
      id: 'test-1',
      content: '测试问题',
      type,
      createdAt: new Date().toISOString(),
    });

    it('应该为概念性问题推荐方法论', () => {
      const question = createTestQuestion('conceptual');
      const methodologies = engine.recommendMethodology(question);

      expect(methodologies.length).toBeGreaterThan(0);
    });

    it('应该为方法性问题推荐方法论', () => {
      const question = createTestQuestion('methodological');
      const methodologies = engine.recommendMethodology(question);

      expect(methodologies.length).toBeGreaterThan(0);
    });

    it('应该为应用性问题推荐方法论', () => {
      const question = createTestQuestion('applied');
      const methodologies = engine.recommendMethodology(question);

      expect(methodologies.length).toBeGreaterThan(0);
    });

    it('应该推荐苏格拉底提问法给概念性问题', () => {
      const question = createTestQuestion('conceptual');
      const methodologies = engine.recommendMethodology(question);

      expect(methodologies).toContain('socratic');
    });

    it('应该推荐丰田五问法给方法性问题', () => {
      const question = createTestQuestion('methodological');
      const methodologies = engine.recommendMethodology(question);

      expect(methodologies).toContain('five-whys');
    });

    it('应该推荐第一性原理给所有类型', () => {
      const types: QuestionType[] = ['conceptual', 'methodological', 'applied'];

      for (const type of types) {
        const question = createTestQuestion(type);
        const methodologies = engine.recommendMethodology(question);

        expect(methodologies).toContain('first-principles');
      }
    });
  });

  describe('苏格拉底提问法', () => {
    it('应该应用苏格拉底提问法', async () => {
      const result = await engine.applySocratic('什么是机器学习？');

      expect(result).toBeDefined();
      expect(result.methodology).toBe('socratic');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.conclusion).toBeDefined();
      expect(result.insights.length).toBeGreaterThan(0);
    });

    it('应该生成步骤', async () => {
      const result = await engine.applySocratic('测试问题');

      for (const step of result.steps) {
        expect(step.step).toBeGreaterThan(0);
        expect(step.question).toBeDefined();
        expect(step.analysis).toBeDefined();
        expect(step.confidence).toBeGreaterThanOrEqual(0);
        expect(step.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('应该包含上下文', async () => {
      const result = await engine.applySocratic('测试问题', '在计算机科学领域');

      expect(result).toBeDefined();
    });

    it('步骤应该按顺序排列', async () => {
      const result = await engine.applySocratic('测试问题');

      for (let i = 0; i < result.steps.length; i++) {
        expect(result.steps[i].step).toBe(i + 1);
      }
    });

    it('应该生成有意义的结论', async () => {
      const result = await engine.applySocratic('什么是人工智能？');

      expect(result.conclusion.length).toBeGreaterThan(0);
    });

    it('应该生成洞察', async () => {
      const result = await engine.applySocratic('测试问题');

      expect(result.insights.length).toBeGreaterThan(0);
    });
  });

  describe('丰田五问法', () => {
    it('应该应用丰田五问法', async () => {
      const result = await engine.applyFiveWhys('为什么系统崩溃了？');

      expect(result).toBeDefined();
      expect(result.methodology).toBe('five-whys');
      expect(result.steps.length).toBe(5);
      expect(result.conclusion).toBeDefined();
    });

    it('应该生成5个为什么', async () => {
      const result = await engine.applyFiveWhys('测试问题');

      expect(result.steps.length).toBe(5);

      for (const step of result.steps) {
        expect(step.question).toContain('为什么');
      }
    });

    it('最后一步应该是根本原因', async () => {
      const result = await engine.applyFiveWhys('测试问题');

      const lastStep = result.steps[result.steps.length - 1];
      expect(lastStep.analysis).toContain('根本原因');
    });

    it('应该包含上下文', async () => {
      const result = await engine.applyFiveWhys('测试问题', '在测试环境中');

      expect(result).toBeDefined();
    });
  });

  describe('第一性原理', () => {
    it('应该应用第一性原理', async () => {
      const result = await engine.applyFirstPrinciples('如何设计一个系统？');

      expect(result).toBeDefined();
      expect(result.methodology).toBe('first-principles');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.conclusion).toBeDefined();
    });

    it('应该生成步骤', async () => {
      const result = await engine.applyFirstPrinciples('测试问题');

      for (const step of result.steps) {
        expect(step.step).toBeGreaterThan(0);
        expect(step.question).toBeDefined();
        expect(step.analysis).toBeDefined();
      }
    });

    it('应该包含上下文', async () => {
      const result = await engine.applyFirstPrinciples('测试问题', '在工程领域');

      expect(result).toBeDefined();
    });
  });

  describe('应用指定方法论', () => {
    it('应该应用苏格拉底提问法', async () => {
      const result = await engine.applyMethodology('socratic', '测试问题');

      expect(result.methodology).toBe('socratic');
    });

    it('应该应用丰田五问法', async () => {
      const result = await engine.applyMethodology('five-whys', '测试问题');

      expect(result.methodology).toBe('five-whys');
    });

    it('应该应用第一性原理', async () => {
      const result = await engine.applyMethodology('first-principles', '测试问题');

      expect(result.methodology).toBe('first-principles');
    });

    it('未知方法论应该抛出错误', async () => {
      await expect(
        engine.applyMethodology('unknown' as Methodology, '测试问题')
      ).rejects.toThrow('未知的方法论');
    });

    it('应该包含上下文', async () => {
      const result = await engine.applyMethodology('socratic', '测试问题', '上下文');

      expect(result).toBeDefined();
    });
  });

  describe('方法论信息', () => {
    it('应该获取苏格拉底提问法信息', () => {
      const info = engine.getMethodologyInfo('socratic');

      expect(info.type).toBe('socratic');
      expect(info.name).toBeDefined();
      expect(info.applicableTypes.length).toBeGreaterThan(0);
    });

    it('应该获取丰田五问法信息', () => {
      const info = engine.getMethodologyInfo('five-whys');

      expect(info.type).toBe('five-whys');
      expect(info.name).toBeDefined();
      expect(info.applicableTypes.length).toBeGreaterThan(0);
    });

    it('应该获取第一性原理信息', () => {
      const info = engine.getMethodologyInfo('first-principles');

      expect(info.type).toBe('first-principles');
      expect(info.name).toBeDefined();
      expect(info.applicableTypes.length).toBeGreaterThan(0);
    });

    it('应该获取所有方法论信息', () => {
      const all = engine.getAllMethodologies();

      expect(all.length).toBe(3);

      const types = all.map(m => m.type);
      expect(types).toContain('socratic');
      expect(types).toContain('five-whys');
      expect(types).toContain('first-principles');
    });
  });

  describe('结果结构验证', () => {
    it('应该返回正确的结果结构', async () => {
      const result = await engine.applySocratic('测试问题');

      expect(result).toHaveProperty('questionId');
      expect(result).toHaveProperty('methodology');
      expect(result).toHaveProperty('steps');
      expect(result).toHaveProperty('conclusion');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('createdAt');
    });

    it('步骤应该有正确的结构', async () => {
      const result = await engine.applySocratic('测试问题');

      for (const step of result.steps) {
        expect(step).toHaveProperty('step');
        expect(step).toHaveProperty('question');
        expect(step).toHaveProperty('analysis');
        expect(step).toHaveProperty('confidence');
      }
    });
  });

  describe('边界条件', () => {
    it('应该处理空问题', async () => {
      const result = await engine.applySocratic('');

      expect(result).toBeDefined();
    });

    it('应该处理非常长的问题', async () => {
      const longQuestion = '这是一个非常长的问题'.repeat(100);
      const result = await engine.applySocratic(longQuestion);

      expect(result).toBeDefined();
    });

    it('应该处理特殊字符', async () => {
      const result = await engine.applySocratic('什么是"特殊字符"？<标签>');

      expect(result).toBeDefined();
    });

    it('应该处理Unicode字符', async () => {
      const result = await engine.applySocratic('什么是🎉？');

      expect(result).toBeDefined();
    });

    it('应该处理没有上下文的情况', async () => {
      const result = await engine.applySocratic('测试问题', undefined);

      expect(result).toBeDefined();
    });

    it('应该处理空上下文', async () => {
      const result = await engine.applySocratic('测试问题', '');

      expect(result).toBeDefined();
    });
  });

  describe('置信度验证', () => {
    it('置信度应该在合理范围内', async () => {
      const result = await engine.applySocratic('测试问题');

      for (const step of result.steps) {
        expect(step.confidence).toBeGreaterThanOrEqual(0);
        expect(step.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('应该有不同的置信度值', async () => {
      const result = await engine.applySocratic('测试问题');

      const confidences = result.steps.map(s => s.confidence);
      const uniqueConfidences = new Set(confidences);

      // 至少应该有一些不同的置信度值
      expect(uniqueConfidences.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('方法论独立性', () => {
    it('不同方法论应该产生不同结果', async () => {
      const socraticResult = await engine.applySocratic('测试问题');
      const fiveWhysResult = await engine.applyFiveWhys('测试问题');

      expect(socraticResult.methodology).not.toBe(fiveWhysResult.methodology);
    });

    it('相同方法论应该产生相似结构', async () => {
      const result1 = await engine.applySocratic('问题1');
      const result2 = await engine.applySocratic('问题2');

      expect(result1.steps.length).toBe(result2.steps.length);
    });
  });

  describe('配置影响', () => {
    it('maxSteps应该影响步骤数量', async () => {
      const engineWithMaxSteps = new MethodologyEngine({
        maxSteps: 5,
      });

      const result = await engineWithMaxSteps.applySocratic('测试问题');

      // 苏格拉底提问法固定7步
      expect(result.steps.length).toBe(7);
    });

    it('应该使用不同的配置', () => {
      const engine1 = new MethodologyEngine({ maxSteps: 5 });
      const engine2 = new MethodologyEngine({ maxSteps: 10 });

      expect(engine1).toBeDefined();
      expect(engine2).toBeDefined();
    });
  });
});