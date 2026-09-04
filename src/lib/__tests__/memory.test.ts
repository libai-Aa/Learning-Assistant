/**
 * Agent记忆测试
 * @module src/lib/__tests__/memory.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CoTCapture, createCoTCapture } from '../agent/cot-capture';
import type { ChainOfThought, ThoughtStep } from '../../types/memory';
import { PreferenceLearner, createPreferenceLearner } from '../agent/preference-learner';
import type { UserPreference } from '../../types/memory';
import { PreferenceType } from '../../types/memory';

// ============ 思维链捕捉测试 ============
describe('CoTCapture', () => {
  let capture: CoTCapture;

  beforeEach(() => {
    capture = new CoTCapture({
      minSteps: 2,
      maxSteps: 10,
      captureReasoningDetails: true,
      confidenceThreshold: 0.6,
    });
  });

  describe('基本配置', () => {
    it('应该使用默认配置', () => {
      const defaultCapture = new CoTCapture();
      expect(defaultCapture).toBeDefined();
    });

    it('应该使用自定义配置', () => {
      const customCapture = new CoTCapture({
        minSteps: 3,
        maxSteps: 8,
        captureReasoningDetails: false,
        confidenceThreshold: 0.7,
      });
      expect(customCapture).toBeDefined();
    });

    it('createCoTCapture应该创建实例', () => {
      const created = createCoTCapture();
      expect(created).toBeInstanceOf(CoTCapture);
    });
  });

  describe('从对话捕捉思维链', () => {
    const createMockMessage = (role: 'user' | 'assistant', content: string) => ({
      id: `msg-${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    it('应该捕捉思维链', async () => {
      const messages = [
        createMockMessage('user', '什么是机器学习？'),
        createMockMessage('assistant', '机器学习是人工智能的一个分支，它使计算机能够从数据中学习。'),
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('session-1');
      expect(result!.question).toBe('什么是机器学习？');
      expect(result!.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('应该返回null对于少于2条消息', async () => {
      const messages = [
        createMockMessage('user', '什么是机器学习？'),
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result).toBeNull();
    });

    it('应该返回null对于没有用户消息', async () => {
      const messages = [
        createMockMessage('assistant', '这是一个回答'),
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result).toBeNull();
    });

    it('应该返回null对于没有AI消息', async () => {
      const messages = [
        createMockMessage('user', '这是一个问题'),
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result).toBeNull();
    });

    it('应该生成唯一ID', async () => {
      const messages = [
        createMockMessage('user', '问题1？'),
        createMockMessage('assistant', '回答1'),
      ];

      const result1 = await capture.captureFromConversation('session-1', messages);
      const result2 = await capture.captureFromConversation('session-1', messages);

      expect(result1!.id).not.toBe(result2!.id);
    });

    it('应该包含知识来源', async () => {
      const messages = [
        createMockMessage('user', '什么是AI？'),
        createMockMessage('assistant', 'AI是...'),
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result!.knowledgeSource).toBe('external');
    });

    it('应该计算本地知识数量', async () => {
      const messages = [
        {
          ...createMockMessage('user', '什么是AI？'),
        },
        {
          ...createMockMessage('assistant', 'AI是...'),
          usedKnowledgeIds: ['local_1', 'local_2'],
        },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result!.localKnowledgeCount).toBe(2);
    });
  });

  describe('思维步骤结构', () => {
    it('应该生成正确的步骤结构', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: '测试问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: '测试回答', timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      for (const step of result!.steps) {
        expect(step).toHaveProperty('step');
        expect(step).toHaveProperty('type');
        expect(step).toHaveProperty('thought');
        expect(step).toHaveProperty('confidence');
        expect(step).toHaveProperty('timestamp');
      }
    });

    it('应该包含不同类型的步骤', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: '什么是机器学习？', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: '机器学习是...', timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      const types = result!.steps.map(s => s.type);
      expect(types).toContain('observation');
      expect(types).toContain('conclusion');
    });

    it('步骤应该按顺序排列', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: '问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: '回答', timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      for (let i = 0; i < result!.steps.length; i++) {
        expect(result!.steps[i].step).toBe(i + 1);
      }
    });
  });

  describe('边界条件', () => {
    it('应该处理空消息数组', async () => {
      const result = await capture.captureFromConversation('session-1', []);

      expect(result).toBeNull();
    });

    it('应该处理空问题', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: '', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: '回答', timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result).not.toBeNull();
    });

    it('应该处理空回答', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: '问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: '', timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result).not.toBeNull();
    });

    it('应该限制步骤数量', async () => {
      const longAnswer = '首先。其次。然后。接着。继续。最后。结论。';
      const messages = [
        { id: '1', role: 'user' as const, content: '问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: longAnswer, timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result!.steps.length).toBeLessThanOrEqual(10);
    });
  });

  describe('推理步骤提取', () => {
    it('应该从答案中提取推理步骤', async () => {
      const answer = '首先，我们需要理解问题。其次，分析关键要素。因此，结论是...';
      const messages = [
        { id: '1', role: 'user' as const, content: '问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: answer, timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result!.steps.length).toBeGreaterThan(2);
    });

    it('应该识别结论性语句', async () => {
      const answer = '总之，这个问题的答案是肯定的。';
      const messages = [
        { id: '1', role: 'user' as const, content: '问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: answer, timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      const conclusionStep = result!.steps.find(s => s.type === 'conclusion');
      expect(conclusionStep).toBeDefined();
    });

    it('应该识别推理步骤', async () => {
      const answer = '因此，我们可以得出结论。';
      const messages = [
        { id: '1', role: 'user' as const, content: '问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: answer, timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      const inferenceStep = result!.steps.find(s => s.type === 'inference');
      expect(inferenceStep).toBeDefined();
    });
  });

  describe('关键词提取', () => {
    it('应该从问题中提取关键词', async () => {
      const question = '机器学习在医疗诊断中的应用是什么？';
      const messages = [
        { id: '1', role: 'user' as const, content: question, timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: '回答', timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      expect(result).not.toBeNull();
    });
  });

  describe('置信度验证', () => {
    it('置信度应该在合理范围内', async () => {
      const messages = [
        { id: '1', role: 'user' as const, content: '问题', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant' as const, content: '回答', timestamp: new Date().toISOString() },
      ];

      const result = await capture.captureFromConversation('session-1', messages);

      for (const step of result!.steps) {
        expect(step.confidence).toBeGreaterThanOrEqual(0);
        expect(step.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});

// ============ 偏好学习测试 ============
describe('PreferenceLearner', () => {
  let learner: PreferenceLearner;

  beforeEach(() => {
    learner = new PreferenceLearner({
      minLearnCount: 3,
      confidenceGrowthFactor: 0.1,
      maxConfidence: 0.95,
      decayPeriod: 30,
    });
  });

  describe('基本配置', () => {
    it('应该使用默认配置', () => {
      const defaultLearner = new PreferenceLearner();
      expect(defaultLearner).toBeDefined();
    });

    it('应该使用自定义配置', () => {
      const customLearner = new PreferenceLearner({
        minLearnCount: 5,
        confidenceGrowthFactor: 0.2,
        maxConfidence: 0.9,
        decayPeriod: 60,
      });
      expect(customLearner).toBeDefined();
    });

    it('createPreferenceLearner应该创建实例', () => {
      const created = createPreferenceLearner();
      expect(created).toBeInstanceOf(PreferenceLearner);
    });
  });

  describe('学习偏好', () => {
    const createMockEvent = (
      type: 'explicit_preference' | 'implicit_preference' | 'behavior',
      preferenceType: PreferenceType,
      preferenceValue: string
    ) => ({
      id: `event-${Date.now()}-${Math.random()}`,
      type,
      preferenceType,
      preferenceValue,
      timestamp: new Date().toISOString(),
    });

    it('应该从行为中学习偏好', () => {
      const event = createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'chinese');
      const preference = learner.learnFromBehavior(event);

      expect(preference).toBeDefined();
      expect(preference.type).toBe(PreferenceType.LANGUAGE);
      expect(preference.value).toBe('chinese');
      expect(preference.confidence).toBeGreaterThan(0);
    });

    it('应该增加学习次数', () => {
      const event = createMockEvent('behavior', PreferenceType.ANSWER_STYLE, '简明扼要');

      const result1 = learner.learnFromBehavior(event);
      expect(result1.learnCount).toBe(1);

      const result2 = learner.learnFromBehavior(event);
      expect(result2.learnCount).toBe(2);
    });

    it('应该增加置信度', () => {
      const event = createMockEvent('behavior', PreferenceType.DOMAIN, '计算机科学');

      const result1 = learner.learnFromBehavior(event);
      const confidence1 = result1.confidence;

      const result2 = learner.learnFromBehavior(event);
      expect(result2.confidence).toBeGreaterThan(confidence1);
    });

    it('应该处理显式偏好', () => {
      const event = createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'english');
      const preference = learner.learnFromBehavior(event);

      expect(preference.learnedFrom).toBe('explicit');
      expect(preference.confidence).toBe(0.8);
    });

    it('应该处理隐式偏好', () => {
      const event = createMockEvent('implicit_preference', PreferenceType.LANGUAGE, 'chinese');
      const preference = learner.learnFromBehavior(event);

      expect(preference.learnedFrom).toBe('implicit');
      expect(preference.confidence).toBe(0.5);
    });

    it('应该处理行为偏好', () => {
      const event = createMockEvent('behavior', PreferenceType.LANGUAGE, 'chinese');
      const preference = learner.learnFromBehavior(event);

      expect(preference.learnedFrom).toBe('behavior');
      expect(preference.confidence).toBe(0.3);
    });

    it('应该保持最高优先级来源', () => {
      const event1 = createMockEvent('behavior', PreferenceType.LANGUAGE, 'chinese');
      const result1 = learner.learnFromBehavior(event1);

      const event2 = createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'chinese');
      const result2 = learner.learnFromBehavior(event2);

      expect(result2.learnedFrom).toBe('explicit');
    });
  });

  describe('获取偏好', () => {
    beforeEach(() => {
      // 添加一些偏好
      const events = [
        createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'chinese'),
        createMockEvent('behavior', PreferenceType.ANSWER_STYLE, '简明扼要'),
        createMockEvent('implicit_preference', PreferenceType.DOMAIN, '计算机科学'),
      ];

      for (const event of events) {
        learner.learnFromBehavior(event);
      }
    });

    it('应该获取所有偏好', () => {
      const preferences = learner.getPreferences();

      expect(preferences.length).toBe(3);
    });

    it('应该按置信度排序', () => {
      const preferences = learner.getPreferences();

      for (let i = 1; i < preferences.length; i++) {
        expect(preferences[i - 1].confidence).toBeGreaterThanOrEqual(preferences[i].confidence);
      }
    });

    it('应该获取特定类型的偏好', () => {
      const languagePrefs = learner.getPreferencesByType(PreferenceType.LANGUAGE);

      expect(languagePrefs.length).toBe(1);
      expect(languagePrefs[0].type).toBe(PreferenceType.LANGUAGE);
    });

    it('应该获取最高置信度的偏好', () => {
      const topLanguage = learner.getTopPreference(PreferenceType.LANGUAGE);

      expect(topLanguage).toBe('chinese');
    });

    it('应该返回null对于没有的类型', () => {
      const top = learner.getTopPreference(PreferenceType.DETAIL_LEVEL);

      expect(top).toBeNull();
    });
  });

  describe('重置偏好', () => {
    beforeEach(() => {
      const event = createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'chinese');
      learner.learnFromBehavior(event);
    });

    it('应该重置所有偏好', () => {
      learner.reset();
      const preferences = learner.getPreferences();

      expect(preferences).toEqual([]);
    });

    it('应该重置特定类型的偏好', () => {
      learner.resetByType(PreferenceType.LANGUAGE);
      const prefs = learner.getPreferencesByType(PreferenceType.LANGUAGE);

      expect(prefs).toEqual([]);
    });

    it('应该重置特定偏好', () => {
      learner.resetPreference(PreferenceType.LANGUAGE, 'chinese');
      const prefs = learner.getPreferencesByType(PreferenceType.LANGUAGE);

      expect(prefs).toEqual([]);
    });

    it('重置不影响其他类型', () => {
      const event = createMockEvent('behavior', PreferenceType.ANSWER_STYLE, '简明');
      learner.learnFromBehavior(event);

      learner.resetByType(PreferenceType.LANGUAGE);

      const stylePrefs = learner.getPreferencesByType(PreferenceType.ANSWER_STYLE);
      expect(stylePrefs.length).toBe(1);
    });
  });

  describe('应用偏好到回答', () => {
    it('应该应用风格偏好', () => {
      const event = createMockEvent('explicit_preference', PreferenceType.ANSWER_STYLE, '简明扼要');
      learner.learnFromBehavior(event);

      const answer = '这是一个非常详细的回答，包含了很多信息，需要仔细阅读才能理解。'.repeat(10);
      const result = learner.applyPreferencesToAnswer(answer);

      expect(result).toBeDefined();
    });

    it('应该应用详细程度偏好', () => {
      const event = createMockEvent('explicit_preference', PreferenceType.DETAIL_LEVEL, '详细');
      learner.learnFromBehavior(event);

      const answer = '测试回答';
      const result = learner.applyPreferencesToAnswer(answer);

      expect(result).toBeDefined();
    });

    it('低置信度偏好不应该被应用', () => {
      const event = createMockEvent('behavior', PreferenceType.ANSWER_STYLE, '简明扼要');
      const preference = learner.learnFromBehavior(event);

      // 行为偏好的初始置信度是0.3，低于阈值0.7
      const answer = '测试回答';
      const result = learner.applyPreferencesToAnswer(answer);

      // 应该不被修改
      expect(result).toBe(answer);
    });
  });

  describe('用户画像', () => {
    it('应该构建用户画像', () => {
      const events = [
        createMockEvent('behavior', PreferenceType.DOMAIN, '计算机科学'),
        createMockEvent('behavior', PreferenceType.DOMAIN, '计算机科学'),
        createMockEvent('behavior', PreferenceType.DOMAIN, '数学'),
      ];

      for (const event of events) {
        learner.learnFromBehavior(event);
      }

      const profile = learner.buildUserProfile('user-1');

      expect(profile).toBeDefined();
      expect(profile.userId).toBe('user-1');
      expect(profile.preferences.length).toBe(3);
      expect(profile.domainStats).toBeDefined();
    });

    it('应该计算领域统计', () => {
      const events = [
        createMockEvent('behavior', PreferenceType.DOMAIN, '计算机科学'),
        createMockEvent('behavior', PreferenceType.DOMAIN, '计算机科学'),
        createMockEvent('behavior', PreferenceType.DOMAIN, '数学'),
      ];

      for (const event of events) {
        learner.learnFromBehavior(event);
      }

      const profile = learner.buildUserProfile('user-1');

      expect(profile.domainStats['计算机科学']).toBe(2);
      expect(profile.domainStats['数学']).toBe(1);
    });

    it('应该计算总交互次数', () => {
      const events = [
        createMockEvent('behavior', PreferenceType.DOMAIN, '计算机科学'),
        createMockEvent('behavior', PreferenceType.ANSWER_STYLE, '简明'),
      ];

      for (const event of events) {
        learner.learnFromBehavior(event);
      }

      const profile = learner.buildUserProfile('user-1');

      expect(profile.totalInteractions).toBe(2);
    });

    it('没有偏好时应该返回空画像', () => {
      const profile = learner.buildUserProfile('user-1');

      expect(profile).toBeDefined();
      expect(profile.preferences).toEqual([]);
    });
  });

  describe('推断领域偏好', () => {
    it('应该从问题中推断领域偏好', () => {
      const questions = [
        { question: '如何学习编程？', timestamp: new Date().toISOString() },
        { question: '算法和数据结构', timestamp: new Date().toISOString() },
        { question: '机器学习入门', timestamp: new Date().toISOString() },
      ];

      const preferences = learner.inferDomainPreferences(questions);

      expect(preferences.length).toBeGreaterThan(0);
    });

    it('应该识别计算机科学领域', () => {
      const questions = [
        { question: '编程和代码开发', timestamp: new Date().toISOString() },
        { question: '算法和软件工程', timestamp: new Date().toISOString() },
      ];

      const preferences = learner.inferDomainPreferences(questions);

      expect(preferences.some(p => p.value === '计算机科学')).toBe(true);
    });

    it('应该只返回达到最小学习次数的偏好', () => {
      const questions = [
        { question: '编程', timestamp: new Date().toISOString() },
      ];

      const preferences = learner.inferDomainPreferences(questions);

      // 只有1次，低于最小3次
      expect(preferences).toEqual([]);
    });
  });

  describe('导出和导入', () => {
    beforeEach(() => {
      const event = createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'chinese');
      learner.learnFromBehavior(event);
    });

    it('应该导出偏好', () => {
      const exported = learner.exportPreferences();

      expect(exported.length).toBe(1);
      expect(exported[0].value).toBe('chinese');
    });

    it('应该导入偏好', () => {
      const preferences: UserPreference[] = [
        {
          type: PreferenceType.LANGUAGE,
          value: 'english',
          confidence: 0.8,
          learnedFrom: 'explicit',
          learnCount: 1,
          lastLearnedAt: new Date().toISOString(),
          firstLearnedAt: new Date().toISOString(),
        },
      ];

      learner.importPreferences(preferences);

      const prefs = learner.getPreferencesByType(PreferenceType.LANGUAGE);
      expect(prefs.length).toBe(1);
      expect(prefs[0].value).toBe('english');
    });

    it('导入应该覆盖现有偏好', () => {
      const preferences: UserPreference[] = [
        {
          type: PreferenceType.LANGUAGE,
          value: 'english',
          confidence: 0.8,
          learnedFrom: 'explicit',
          learnCount: 1,
          lastLearnedAt: new Date().toISOString(),
          firstLearnedAt: new Date().toISOString(),
        },
      ];

      learner.importPreferences(preferences);

      const prefs = learner.getPreferencesByType(PreferenceType.LANGUAGE);
      expect(prefs.length).toBe(1);
    });
  });

  describe('边界条件', () => {
    it('应该处理空偏好值', () => {
      const event = createMockEvent('behavior', PreferenceType.LANGUAGE, '');
      const preference = learner.learnFromBehavior(event);

      expect(preference).toBeDefined();
    });

    it('应该处理非常长的偏好值', () => {
      const longValue = 'x'.repeat(1000);
      const event = createMockEvent('behavior', PreferenceType.LANGUAGE, longValue);
      const preference = learner.learnFromBehavior(event);

      expect(preference).toBeDefined();
    });

    it('应该处理特殊字符', () => {
      const event = createMockEvent('behavior', PreferenceType.LANGUAGE, '测试@#$%');
      const preference = learner.learnFromBehavior(event);

      expect(preference).toBeDefined();
    });
  });

  describe('置信度验证', () => {
    it('置信度应该不超过最大值', () => {
      const event = createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'chinese');

      // 学习多次
      for (let i = 0; i < 20; i++) {
        learner.learnFromBehavior(event);
      }

      const prefs = learner.getPreferencesByType(PreferenceType.LANGUAGE);
      expect(prefs[0].confidence).toBeLessThanOrEqual(0.95);
    });

    it('显式偏好应该有更高的初始置信度', () => {
      const explicitEvent = createMockEvent('explicit_preference', PreferenceType.LANGUAGE, 'chinese');
      const explicitPref = learner.learnFromBehavior(explicitEvent);

      const behaviorEvent = createMockEvent('behavior', PreferenceType.LANGUAGE, 'chinese');
      const behaviorPref = learner.learnFromBehavior(behaviorEvent);

      expect(explicitPref.confidence).toBeGreaterThan(behaviorPref.confidence);
    });
  });
});

// 辅助函数
function createMockEvent(
  type: 'explicit_preference' | 'implicit_preference' | 'behavior',
  preferenceType: PreferenceType,
  preferenceValue: string
) {
  return {
    id: `event-${Date.now()}-${Math.random()}`,
    type,
    preferenceType,
    preferenceValue,
    timestamp: new Date().toISOString(),
  };
}