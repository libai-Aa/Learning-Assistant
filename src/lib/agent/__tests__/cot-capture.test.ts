/**
 * 思维链捕捉模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CoTCapture, createCoTCapture } from '../cot-capture';
import type { ChatMessage } from '../cot-capture';

describe('CoTCapture', () => {
  let capture: CoTCapture;

  beforeEach(() => {
    capture = createCoTCapture({
      minSteps: 2,
      maxSteps: 10,
      captureReasoningDetails: true,
      confidenceThreshold: 0.6,
    });
  });

  describe('captureFromConversation', () => {
    it('应该从对话中捕捉思维链', async () => {
      const sessionId = 'test-session';
      const messages: ChatMessage[] = [
        {
          id: 'msg1',
          role: 'user',
          content: '如何理解牛顿第一定律？',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg2',
          role: 'assistant',
          content:
            '牛顿第一定律，也称为惯性定律，表明物体在不受外力作用时，将保持静止或匀速直线运动状态。首先，我们需要理解惯性的概念。因此，惯性是物体保持其运动状态的性质。',
          timestamp: new Date().toISOString(),
          usedKnowledgeIds: ['local_physics_1'],
        },
      ];

      const cot = await capture.captureFromConversation(sessionId, messages);

      expect(cot).not.toBeNull();
      expect(cot!.sessionId).toBe(sessionId);
      expect(cot!.question).toBe('如何理解牛顿第一定律？');
      expect(cot!.steps.length).toBeGreaterThanOrEqual(2);
      expect(cot!.knowledgeSource).toBe('local');
      expect(cot!.localKnowledgeCount).toBe(1);
    });

    it('当消息不足时返回null', async () => {
      const sessionId = 'test-session';
      const messages: ChatMessage[] = [
        {
          id: 'msg1',
          role: 'user',
          content: '你好',
          timestamp: new Date().toISOString(),
        },
      ];

      const cot = await capture.captureFromConversation(sessionId, messages);

      expect(cot).toBeNull();
    });

    it('当没有用户消息时返回null', async () => {
      const sessionId = 'test-session';
      const messages: ChatMessage[] = [
        {
          id: 'msg1',
          role: 'assistant',
          content: '你好！',
          timestamp: new Date().toISOString(),
        },
      ];

      const cot = await capture.captureFromConversation(sessionId, messages);

      expect(cot).toBeNull();
    });

    it('正确识别知识来源类型', async () => {
      const sessionId = 'test-session';

      // 测试本地知识
      const localMessages: ChatMessage[] = [
        {
          id: 'msg1',
          role: 'user',
          content: '测试问题',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg2',
          role: 'assistant',
          content: '测试答案',
          timestamp: new Date().toISOString(),
          usedKnowledgeIds: ['local_1', 'local_2'],
        },
      ];

      const localCot = await capture.captureFromConversation(
        sessionId,
        localMessages
      );
      expect(localCot!.knowledgeSource).toBe('local');

      // 测试外部知识
      const externalMessages: ChatMessage[] = [
        {
          id: 'msg1',
          role: 'user',
          content: '测试问题',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg2',
          role: 'assistant',
          content: '测试答案',
          timestamp: new Date().toISOString(),
        },
      ];

      const externalCot = await capture.captureFromConversation(
        sessionId,
        externalMessages
      );
      expect(externalCot!.knowledgeSource).toBe('external');
    });
  });

  describe('思维步骤提取', () => {
    it('应该包含多个思维步骤', async () => {
      const sessionId = 'test-session';
      const messages: ChatMessage[] = [
        {
          id: 'msg1',
          role: 'user',
          content: '什么是量子纠缠？',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg2',
          role: 'assistant',
          content:
            '量子纠缠是量子力学中的现象。首先，纠缠态是两个或多个粒子之间的特殊关联。因此，测量一个粒子会立即影响另一个粒子。结论是量子纠缠是量子计算的基础。',
          timestamp: new Date().toISOString(),
        },
      ];

      const cot = await capture.captureFromConversation(sessionId, messages);

      expect(cot!.steps.length).toBeGreaterThanOrEqual(3);
    });

    it('应该正确识别问题类型', async () => {
      const sessionId = 'test-session';

      // 测试理工科问题
      const stemMessages: ChatMessage[] = [
        {
          id: 'msg1',
          role: 'user',
          content: '如何计算导数？',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg2',
          role: 'assistant',
          content: '导数计算...',
          timestamp: new Date().toISOString(),
        },
      ];

      const stemCot = await capture.captureFromConversation(
        sessionId,
        stemMessages
      );
      expect(stemCot!.steps[1].thought).toContain('理工科');
    });
  });
});

describe('createCoTCapture', () => {
  it('应该创建默认的思维链捕捉器', () => {
    const capture = createCoTCapture();
    expect(capture).toBeInstanceOf(CoTCapture);
  });

  it('应该使用自定义配置', () => {
    const capture = createCoTCapture({
      minSteps: 5,
      maxSteps: 15,
    });
    expect(capture).toBeInstanceOf(CoTCapture);
  });
});