/**
 * 偏好学习模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PreferenceLearner,
  createPreferenceLearner,
} from '../preference-learner';
import type { UserBehaviorEvent } from '../preference-learner';
import { PreferenceType } from '../../../types/memory';

describe('PreferenceLearner', () => {
  let learner: PreferenceLearner;

  beforeEach(() => {
    learner = createPreferenceLearner({
      minLearnCount: 3,
      confidenceGrowthFactor: 0.1,
      maxConfidence: 0.95,
      decayPeriod: 30,
    });
  });

  describe('learnFromBehavior', () => {
    it('应该从显式偏好中学习', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'explicit_preference',
        preferenceType: PreferenceType.LANGUAGE,
        preferenceValue: 'chinese',
        timestamp: new Date().toISOString(),
      };

      const preference = learner.learnFromBehavior(event);

      expect(preference.type).toBe(PreferenceType.LANGUAGE);
      expect(preference.value).toBe('chinese');
      expect(preference.learnedFrom).toBe('explicit');
      expect(preference.learnCount).toBe(1);
      expect(preference.confidence).toBeGreaterThan(0.7);
    });

    it('应该从隐式行为中学习', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'behavior',
        preferenceType: PreferenceType.ANSWER_STYLE,
        preferenceValue: '简明扼要',
        timestamp: new Date().toISOString(),
      };

      const preference = learner.learnFromBehavior(event);

      expect(preference.type).toBe(PreferenceType.ANSWER_STYLE);
      expect(preference.value).toBe('简明扼要');
      expect(preference.learnedFrom).toBe('behavior');
      expect(preference.confidence).toBeLessThan(0.5);
    });

    it('应该增加置信度', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'explicit_preference',
        preferenceType: PreferenceType.LANGUAGE,
        preferenceValue: 'chinese',
        timestamp: new Date().toISOString(),
      };

      // 第一次学习
      const first = learner.learnFromBehavior(event);
      expect(first.confidence).toBe(0.8);

      // 第二次学习
      const second = learner.learnFromBehavior({
        ...event,
        id: 'event2',
        timestamp: new Date().toISOString(),
      });
      expect(second.confidence).toBeGreaterThan(first.confidence);
      expect(second.learnCount).toBe(2);
    });

    it('应该正确处理相同偏好', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'behavior',
        preferenceType: PreferenceType.DOMAIN,
        preferenceValue: '计算机科学',
        timestamp: new Date().toISOString(),
      };

      // 多次学习相同偏好
      learner.learnFromBehavior(event);
      learner.learnFromBehavior({ ...event, id: 'event2' });
      learner.learnFromBehavior({ ...event, id: 'event3' });

      const preferences = learner.getPreferences();
      expect(preferences.length).toBe(1);
      expect(preferences[0].learnCount).toBe(3);
    });
  });

  describe('getPreferences', () => {
    beforeEach(() => {
      // 添加一些偏好
      const events: UserBehaviorEvent[] = [
        {
          id: 'event1',
          type: 'explicit_preference',
          preferenceType: PreferenceType.LANGUAGE,
          preferenceValue: 'chinese',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'event2',
          type: 'behavior',
          preferenceType: PreferenceType.ANSWER_STYLE,
          preferenceValue: '简明扼要',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'event3',
          type: 'behavior',
          preferenceType: PreferenceType.DOMAIN,
          preferenceValue: '计算机科学',
          timestamp: new Date().toISOString(),
        },
      ];

      learner.learnFromBehaviors(events);
    });

    it('应该返回所有偏好', () => {
      const preferences = learner.getPreferences();
      expect(preferences.length).toBe(3);
    });

    it('应该按置信度排序', () => {
      const preferences = learner.getPreferences();
      for (let i = 0; i < preferences.length - 1; i++) {
        expect(preferences[i].confidence).toBeGreaterThanOrEqual(
          preferences[i + 1].confidence
        );
      }
    });

    it('应该返回特定类型的偏好', () => {
      const languagePrefs = learner.getPreferencesByType(
        PreferenceType.LANGUAGE
      );
      expect(languagePrefs.length).toBe(1);
      expect(languagePrefs[0].value).toBe('chinese');
    });

    it('应该返回最高置信度的偏好', () => {
      const top = learner.getTopPreference(PreferenceType.LANGUAGE);
      expect(top).toBe('chinese');
    });

    it('对不存在的类型返回null', () => {
      const top = learner.getTopPreference(PreferenceType.INTERACTION_MODE);
      expect(top).toBeNull();
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'behavior',
        preferenceType: PreferenceType.LANGUAGE,
        preferenceValue: 'chinese',
        timestamp: new Date().toISOString(),
      };
      learner.learnFromBehavior(event);
    });

    it('应该重置所有偏好', () => {
      learner.reset();
      expect(learner.getPreferences().length).toBe(0);
    });

    it('应该重置特定类型的偏好', () => {
      learner.resetByType(PreferenceType.LANGUAGE);
      expect(
        learner.getPreferencesByType(PreferenceType.LANGUAGE).length
      ).toBe(0);
    });

    it('应该重置特定偏好', () => {
      learner.resetPreference(PreferenceType.LANGUAGE, 'chinese');
      expect(learner.getTopPreference(PreferenceType.LANGUAGE)).toBeNull();
    });
  });

  describe('applyPreferencesToAnswer', () => {
    it('应该应用风格偏好', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'explicit_preference',
        preferenceType: PreferenceType.ANSWER_STYLE,
        preferenceValue: '简明扼要',
        timestamp: new Date().toISOString(),
      };
      learner.learnFromBehavior(event);

      const longAnswer =
        '这是一个非常详细的回答，包含了大量的解释和说明，用于测试简明扼要的功能是否正常工作。';
      const modified = learner.applyPreferencesToAnswer(longAnswer);

      expect(modified.length).toBeLessThanOrEqual(203); // 200 + '...'
    });

    it('应该应用通俗易懂偏好', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'explicit_preference',
        preferenceType: PreferenceType.ANSWER_STYLE,
        preferenceValue: '通俗易懂',
        timestamp: new Date().toISOString(),
      };
      learner.learnFromBehavior(event);

      const answer = '神经网络是一种算法模型。';
      const modified = learner.applyPreferencesToAnswer(answer);

      expect(modified).toContain('类似人脑的"学习系统"');
    });

    it('低置信度偏好不应应用', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'behavior',
        preferenceType: PreferenceType.ANSWER_STYLE,
        preferenceValue: '简明扼要',
        timestamp: new Date().toISOString(),
      };
      learner.learnFromBehavior(event); // 低置信度

      const longAnswer = '这是一个比较长的回答内容。';
      const modified = learner.applyPreferencesToAnswer(longAnswer);

      // 置信度低，不应修改
      expect(modified).toBe(longAnswer);
    });
  });

  describe('buildUserProfile', () => {
    it('应该构建用户画像', () => {
      const events: UserBehaviorEvent[] = [
        {
          id: 'event1',
          type: 'explicit_preference',
          preferenceType: PreferenceType.LANGUAGE,
          preferenceValue: 'chinese',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'event2',
          type: 'behavior',
          preferenceType: PreferenceType.DOMAIN,
          preferenceValue: '计算机科学',
          timestamp: new Date().toISOString(),
        },
      ];

      learner.learnFromBehaviors(events);

      const profile = learner.buildUserProfile('user1');

      expect(profile.userId).toBe('user1');
      expect(profile.preferences.length).toBe(2);
      expect(profile.totalInteractions).toBe(2);
    });
  });

  describe('inferDomainPreferences', () => {
    it('应该从问题中推断领域偏好', () => {
      const questions = [
        {
          question: '如何实现一个算法？',
          timestamp: new Date().toISOString(),
        },
        {
          question: '数据结构有哪些？',
          timestamp: new Date().toISOString(),
        },
        {
          question: '编程语言哪个好？',
          timestamp: new Date().toISOString(),
        },
      ];

      const prefs = learner.inferDomainPreferences(questions);

      expect(prefs.length).toBeGreaterThan(0);
      expect(prefs[0].type).toBe(PreferenceType.DOMAIN);
      expect(prefs[0].value).toBe('计算机科学');
    });
  });

  describe('import/export', () => {
    it('应该导出偏好数据', () => {
      const event: UserBehaviorEvent = {
        id: 'event1',
        type: 'explicit_preference',
        preferenceType: PreferenceType.LANGUAGE,
        preferenceValue: 'chinese',
        timestamp: new Date().toISOString(),
      };
      learner.learnFromBehavior(event);

      const exported = learner.exportPreferences();
      expect(exported.length).toBe(1);
      expect(exported[0].value).toBe('chinese');
    });

    it('应该导入偏好数据', () => {
      const preferences = [
        {
          type: PreferenceType.LANGUAGE,
          value: 'english',
          confidence: 0.8,
          learnedFrom: 'explicit' as const,
          learnCount: 1,
          lastLearnedAt: new Date().toISOString(),
          firstLearnedAt: new Date().toISOString(),
        },
      ];

      learner.importPreferences(preferences);
      expect(learner.getTopPreference(PreferenceType.LANGUAGE)).toBe('english');
    });
  });
});

describe('createPreferenceLearner', () => {
  it('应该创建默认的偏好学习器', () => {
    const learner = createPreferenceLearner();
    expect(learner).toBeInstanceOf(PreferenceLearner);
  });

  it('应该使用自定义配置', () => {
    const learner = createPreferenceLearner({
      minLearnCount: 5,
      maxConfidence: 0.9,
    });
    expect(learner).toBeInstanceOf(PreferenceLearner);
  });
});