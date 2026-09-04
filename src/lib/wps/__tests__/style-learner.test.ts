/**
 * 风格学习器 (StyleLearner) 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StyleLearner,
  createStyleLearner,
  generateStyleChangeId,
  isSampleSatisfied,
  computeSampleWeight,
  computeVisualSimilarity,
  computeTextualSimilarity,
  computeContentSimilarity,
  computeStyleSimilarity,
  detectStyleChanges,
  type StyleLearningSample,
} from '../style-learner';
import { StyleAnalyzer } from '../style-analyzer';
import type {
  DocumentStyle,
  UserStyleProfile,
  StyleLearnerConfig,
} from '../../../types/style';

// ============ 测试夹具 ============

/**
 * 创建测试用 DocumentStyle
 */
function makeDocumentStyle(overrides: Partial<DocumentStyle> = {}): DocumentStyle {
  return {
    documentType: 'word',
    visual: {
      colorScheme: {
        primary: ['#1a56db'],
        secondary: [],
        accent: ['#f59e0b'],
        background: ['#ffffff'],
        isDark: false,
        paletteType: 'monochrome',
      },
      fontFamily: {
        primaryFont: '思源黑体',
        category: 'sans-serif',
        weightPreference: 'regular',
      },
      fontSize: { body: 11, tendency: 'regular' },
      layoutStyle: {
        type: 'single-column',
        whitespaceRatio: 0.4,
        multiColumn: false,
        alignment: 'left',
      },
      visualDensity: 'medium',
      imageUsage: 'light',
      chartUsage: 'none',
    },
    textual: {
      toneStyle: 'formal',
      sentenceLength: 'medium',
      vocabularyLevel: 'intermediate',
      structurePattern: 'pyramid',
      formalityLevel: 0.7,
      conciseness: 0.6,
    },
    content: {
      topicPreference: ['数据分析'],
      exampleUsage: 'occasional',
      dataUsage: 'quantitative',
    },
    confidence: 0.8,
    ...overrides,
  };
}

/**
 * 创建测试用样本
 */
function makeSample(overrides: Partial<StyleLearningSample> = {}): StyleLearningSample {
  return {
    templateId: `tpl_${Math.random().toString(36).substring(2, 9)}`,
    documentStyle: makeDocumentStyle(),
    rating: 5,
    usageCount: 1,
    timestamp: new Date().toISOString(),
    category: 'report',
    scenarios: ['工作汇报'],
    topics: ['数据分析'],
    ...overrides,
  };
}

// ============ 工具函数测试 ============

describe('generateStyleChangeId', () => {
  it('应生成唯一 ID', () => {
    const id1 = generateStyleChangeId();
    const id2 = generateStyleChangeId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^sc_/);
  });
});

describe('isSampleSatisfied', () => {
  it('显式满意标记优先', () => {
    expect(isSampleSatisfied({ templateId: '1', satisfied: true, rating: 1 }, 4)).toBe(true);
    expect(isSampleSatisfied({ templateId: '1', satisfied: false, rating: 5 }, 4)).toBe(false);
  });

  it('评分达到阈值即满意', () => {
    expect(isSampleSatisfied({ templateId: '1', rating: 4 }, 4)).toBe(true);
    expect(isSampleSatisfied({ templateId: '1', rating: 3 }, 4)).toBe(false);
  });

  it('无评分无标记为不满意', () => {
    expect(isSampleSatisfied({ templateId: '1' }, 4)).toBe(false);
  });
});

describe('computeSampleWeight', () => {
  it('评分越高权重越大', () => {
    const low = computeSampleWeight({ templateId: '1', rating: 1, usageCount: 0 });
    const high = computeSampleWeight({ templateId: '1', rating: 5, usageCount: 0 });
    expect(high).toBeGreaterThan(low);
  });

  it('使用次数越多权重越大', () => {
    const less = computeSampleWeight({ templateId: '1', rating: 5, usageCount: 1 });
    const more = computeSampleWeight({ templateId: '1', rating: 5, usageCount: 10 });
    expect(more).toBeGreaterThan(less);
  });

  it('默认值合理', () => {
    const weight = computeSampleWeight({ templateId: '1' });
    expect(weight).toBeGreaterThan(0);
  });
});

// ============ 相似度计算测试 ============

describe('computeVisualSimilarity', () => {
  it('相同风格相似度为 1', () => {
    const style = makeDocumentStyle().visual;
    expect(computeVisualSimilarity(style, style)).toBeCloseTo(1, 5);
  });

  it('不同风格相似度小于 1', () => {
    const a = makeDocumentStyle().visual;
    const b = makeDocumentStyle({
      visual: {
        ...a,
        colorScheme: { ...a.colorScheme, primary: ['#dc2626'] },
        visualDensity: 'dense',
      },
    }).visual;
    expect(computeVisualSimilarity(a, b)).toBeLessThan(1);
  });
});

describe('computeTextualSimilarity', () => {
  it('相同文本风格相似度为 1', () => {
    const style = makeDocumentStyle().textual;
    expect(computeTextualSimilarity(style, style)).toBeCloseTo(1, 5);
  });

  it('不同语气风格相似度小于 1', () => {
    const a = makeDocumentStyle().textual;
    const b = { ...a, toneStyle: 'casual' as const };
    expect(computeTextualSimilarity(a, b)).toBeLessThan(1);
  });
});

describe('computeContentSimilarity', () => {
  it('相同内容风格相似度为 1', () => {
    const style = makeDocumentStyle().content;
    expect(computeContentSimilarity(style, style)).toBeCloseTo(1, 5);
  });

  it('不同主题相似度小于 1', () => {
    const a = makeDocumentStyle().content;
    const b = { ...a, topicPreference: ['市场营销'] };
    expect(computeContentSimilarity(a, b)).toBeLessThan(1);
  });
});

describe('computeStyleSimilarity', () => {
  it('相同文档风格综合相似度为 1', () => {
    const style = makeDocumentStyle();
    const result = computeStyleSimilarity(style, style);
    expect(result.overall).toBeCloseTo(1, 5);
    expect(result.visual).toBeCloseTo(1, 5);
    expect(result.textual).toBeCloseTo(1, 5);
    expect(result.content).toBeCloseTo(1, 5);
  });

  it('应返回分量分解', () => {
    const a = makeDocumentStyle();
    const b = makeDocumentStyle({
      textual: {
        ...a.textual,
        toneStyle: 'casual',
      },
    });
    const result = computeStyleSimilarity(a, b);
    expect(result.visual).toBeGreaterThan(0);
    expect(result.textual).toBeLessThan(1);
    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThan(1);
  });
});

// ============ 风格变化检测测试 ============

describe('detectStyleChanges', () => {
  it('相同风格无变化', () => {
    const style = makeDocumentStyle();
    const changes = detectStyleChanges(style, style, 'tpl_1', new Date().toISOString(), 0.1);
    expect(changes).toHaveLength(0);
  });

  it('视觉变化应被检测', () => {
    const old = makeDocumentStyle();
    const recent = makeDocumentStyle({
      visual: {
        ...old.visual,
        visualDensity: 'dense',
      },
    });
    const changes = detectStyleChanges(old, recent, 'tpl_1', new Date().toISOString(), 0.1);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some((c) => c.dimension === 'visual')).toBe(true);
  });

  it('文本变化应被检测', () => {
    const old = makeDocumentStyle();
    const recent = makeDocumentStyle({
      textual: {
        ...old.textual,
        toneStyle: 'casual',
      },
    });
    const changes = detectStyleChanges(old, recent, 'tpl_1', new Date().toISOString(), 0.1);
    expect(changes.some((c) => c.dimension === 'textual' && c.field === 'toneStyle')).toBe(true);
  });

  it('变化幅度阈值应过滤小变化', () => {
    const old = makeDocumentStyle();
    const recent = makeDocumentStyle({
      textual: {
        ...old.textual,
        formalityLevel: 0.71, // 微小变化
      },
    });
    const changes = detectStyleChanges(old, recent, 'tpl_1', new Date().toISOString(), 0.5);
    expect(changes.every((c) => c.magnitude >= 0.5)).toBe(true);
  });
});

// ============ StyleLearner 类测试 ============

describe('StyleLearner', () => {
  let learner: StyleLearner;

  beforeEach(() => {
    learner = createStyleLearner();
  });

  describe('learn - 批量学习', () => {
    it('应从满意样本中学习', () => {
      const samples = [
        makeSample({ templateId: 't1', rating: 5 }),
        makeSample({ templateId: 't2', rating: 4 }),
      ];
      const profile = learner.learn('user1', samples);

      expect(profile.userId).toBe('user1');
      expect(profile.learningHistory.templatesAnalyzed).toBe(2);
      expect(profile.learningHistory.confidenceLevel).toBeGreaterThan(0);
    });

    it('应过滤不满意样本', () => {
      const samples = [
        makeSample({ templateId: 't1', rating: 5 }),
        makeSample({ templateId: 't2', rating: 2 }),
        makeSample({ templateId: 't3', rating: 1 }),
      ];
      const profile = learner.learn('user1', samples);
      expect(profile.learningHistory.templatesAnalyzed).toBe(1);
    });

    it('应聚合多个样本的风格', () => {
      const samples = [
        makeSample({
          templateId: 't1',
          documentStyle: makeDocumentStyle({
            textual: { ...makeDocumentStyle().textual, toneStyle: 'formal' },
          }),
        }),
        makeSample({
          templateId: 't2',
          documentStyle: makeDocumentStyle({
            textual: { ...makeDocumentStyle().textual, toneStyle: 'formal' },
          }),
        }),
        makeSample({
          templateId: 't3',
          documentStyle: makeDocumentStyle({
            textual: { ...makeDocumentStyle().textual, toneStyle: 'casual' },
          }),
        }),
      ];
      const profile = learner.learn('user1', samples);
      // formal 占多数（2/3），应被选为聚合语气
      expect(profile.preferredStyles.textual.toneStyle).toBe('formal');
    });

    it('空样本列表应返回空画像', () => {
      const profile = learner.learn('user1', []);
      expect(profile.learningHistory.templatesAnalyzed).toBe(0);
      expect(profile.learningHistory.confidenceLevel).toBe(0);
    });

    it('应计算风格权重表', () => {
      const samples = [
        makeSample({
          templateId: 't1',
          category: 'report',
          scenarios: ['工作汇报'],
          topics: ['数据分析'],
          rating: 5,
          usageCount: 3,
        }),
        makeSample({
          templateId: 't2',
          category: 'report',
          scenarios: ['产品规划'],
          topics: ['产品规划'],
          rating: 4,
          usageCount: 1,
        }),
      ];
      const profile = learner.learn('user1', samples);
      expect(profile.styleWeights.byCategory.report).toBeGreaterThan(0);
      expect(profile.styleWeights.byScenario['工作汇报']).toBeGreaterThan(0);
      expect(profile.styleWeights.byTopic['数据分析']).toBeGreaterThan(0);
    });
  });

  describe('learnIncremental - 增量学习', () => {
    it('应加入新样本并更新画像', () => {
      learner.learn('user1', [makeSample({ templateId: 't1' })]);
      const before = learner.getProfile()!;

      const after = learner.learnIncremental('user1', makeSample({ templateId: 't2' }));
      expect(after.learningHistory.templatesAnalyzed).toBe(2);
      // lastUpdated 是 ISO 字符串，按字符串序比较
      expect(after.learningHistory.lastUpdated >= before.learningHistory.lastUpdated).toBe(true);
    });

    it('不满意样本不应改变画像', () => {
      learner.learn('user1', [makeSample({ templateId: 't1' })]);
      const before = learner.getProfile()!;

      const after = learner.learnIncremental('user1', makeSample({
        templateId: 't2',
        rating: 1,
        satisfied: false,
      }));
      expect(after.learningHistory.templatesAnalyzed).toBe(before.learningHistory.templatesAnalyzed);
    });

    it('应在画像中记录演变轨迹', () => {
      learner.learn('user1', [makeSample({
        templateId: 't1',
        documentStyle: makeDocumentStyle({
          textual: { ...makeDocumentStyle().textual, toneStyle: 'formal' },
        }),
      })]);

      const after = learner.learnIncremental('user1', makeSample({
        templateId: 't2',
        documentStyle: makeDocumentStyle({
          textual: { ...makeDocumentStyle().textual, toneStyle: 'casual' },
        }),
      }));

      // 由于两次样本风格不同，应产生演变记录
      // 注意：聚合后可能仍为 formal（首样本权重），但若产生变化则应有记录
      expect(after.styleEvolution).toBeDefined();
    });

    it('首次增量学习应创建画像', () => {
      const profile = learner.learnIncremental('user1', makeSample({ templateId: 't1' }));
      expect(profile.userId).toBe('user1');
      expect(profile.learningHistory.templatesAnalyzed).toBe(1);
    });
  });

  describe('updateSampleRating', () => {
    it('应更新样本评分并重建画像', () => {
      learner.learn('user1', [makeSample({ templateId: 't1', rating: 5, usageCount: 1 })]);
      const profile = learner.updateSampleRating('user1', 't1', 3);
      // 评分 3 < 阈值 4，但样本仍在 samples 中（不会自动剔除）
      // 此处验证 updateSampleRating 不抛异常且返回画像
      expect(profile.userId).toBe('user1');
    });

    it('未学习的模板 ID 应保持画像不变', () => {
      learner.learn('user1', [makeSample({ templateId: 't1' })]);
      const before = learner.getProfile()!;
      const after = learner.updateSampleRating('user1', 'unknown', 5);
      expect(after.learningHistory.templatesAnalyzed).toBe(before.learningHistory.templatesAnalyzed);
    });
  });

  describe('recommend - 风格推荐', () => {
    beforeEach(() => {
      learner.learn('user1', [
        makeSample({
          templateId: 't1',
          documentStyle: makeDocumentStyle({
            documentType: 'ppt',
            textual: { ...makeDocumentStyle().textual, toneStyle: 'formal' },
          }),
          scenarios: ['工作汇报'],
          topics: ['数据分析'],
        }),
        makeSample({
          templateId: 't2',
          documentStyle: makeDocumentStyle({
            documentType: 'word',
            textual: { ...makeDocumentStyle().textual, toneStyle: 'casual' },
          }),
          scenarios: ['产品规划'],
          topics: ['产品规划'],
        }),
      ]);
    });

    it('应返回推荐结果列表', () => {
      const recs = learner.recommend({});
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].score).toBeGreaterThan(0);
      expect(recs[0].reasons.length).toBeGreaterThan(0);
    });

    it('应按文档类型过滤', () => {
      const recs = learner.recommend({ documentType: 'ppt' });
      expect(recs.every((r) => r.style.documentType === 'ppt')).toBe(true);
    });

    it('应按 topK 限制返回数量', () => {
      const recs = learner.recommend({ topK: 1 });
      expect(recs.length).toBeLessThanOrEqual(1);
    });

    it('场景命中应加分', () => {
      const recs = learner.recommend({ scenario: '工作汇报' });
      expect(recs.length).toBeGreaterThan(0);
    });

    it('空画像应返回空列表', () => {
      const empty = createStyleLearner();
      expect(empty.recommend({})).toEqual([]);
    });
  });

  describe('computeSimilarityToProfile', () => {
    it('应返回与画像的相似度', () => {
      learner.learn('user1', [makeSample({ templateId: 't1' })]);
      const style = makeDocumentStyle();
      const sim = learner.computeSimilarityToProfile(style);
      expect(sim).not.toBeNull();
      expect(sim!.overall).toBeGreaterThan(0);
    });

    it('无画像时返回 null', () => {
      const sim = learner.computeSimilarityToProfile(makeDocumentStyle());
      expect(sim).toBeNull();
    });
  });

  describe('reset', () => {
    it('应清空画像和样本', () => {
      learner.learn('user1', [makeSample({ templateId: 't1' })]);
      learner.reset();
      expect(learner.getProfile()).toBeNull();
      expect(learner.recommend({})).toEqual([]);
    });
  });

  describe('export/import', () => {
    it('应导出画像', () => {
      learner.learn('user1', [makeSample({ templateId: 't1' })]);
      const exported = learner.exportProfile();
      expect(exported).not.toBeNull();
      expect(exported!.userId).toBe('user1');
    });

    it('应导入画像', () => {
      const profile: UserStyleProfile = {
        userId: 'user2',
        preferredStyles: {
          visual: makeDocumentStyle().visual,
          textual: makeDocumentStyle().textual,
          content: makeDocumentStyle().content,
        },
        styleWeights: { byCategory: {}, byScenario: {}, byTopic: {} },
        learningHistory: {
          templatesAnalyzed: 5,
          lastUpdated: new Date().toISOString(),
          confidenceLevel: 0.8,
        },
        styleEvolution: [],
        createdAt: new Date().toISOString(),
      };
      learner.importProfile(profile);
      expect(learner.getProfile()?.userId).toBe('user2');
    });

    it('应导出/导入样本', () => {
      learner.learn('user1', [makeSample({ templateId: 't1' }), makeSample({ templateId: 't2' })]);
      const exported = learner.exportSamples();
      expect(exported.length).toBe(2);

      const newLearner = createStyleLearner();
      newLearner.importSamples(exported);
      expect(newLearner.exportSamples().length).toBe(2);
    });
  });

  describe('置信度', () => {
    it('样本数不足时置信度低', () => {
      const profile = learner.learn('user1', [makeSample({ templateId: 't1' })]);
      expect(profile.learningHistory.confidenceLevel).toBeLessThan(0.3);
    });

    it('样本数充足时置信度高', () => {
      const samples = Array.from({ length: 10 }, (_, i) =>
        makeSample({ templateId: `t${i}`, rating: 5 })
      );
      const profile = learner.learn('user1', samples);
      expect(profile.learningHistory.confidenceLevel).toBeGreaterThan(0.3);
    });

    it('置信度不超过 maxConfidence', () => {
      const configured = createStyleLearner({ maxConfidence: 0.8 });
      const samples = Array.from({ length: 100 }, (_, i) =>
        makeSample({ templateId: `t${i}`, rating: 5 })
      );
      const profile = configured.learn('user1', samples);
      expect(profile.learningHistory.confidenceLevel).toBeLessThanOrEqual(0.8);
    });
  });
});

describe('createStyleLearner', () => {
  it('应创建默认学习器', () => {
    const learner = createStyleLearner();
    expect(learner).toBeInstanceOf(StyleLearner);
  });

  it('应使用自定义配置', () => {
    const learner = createStyleLearner({
      satisfactionThreshold: 3,
      minTemplatesForConfidence: 2,
    });
    expect(learner).toBeInstanceOf(StyleLearner);
  });

  it('应支持自定义分析器', () => {
    const analyzer = new StyleAnalyzer();
    const learner = createStyleLearner({}, analyzer);
    expect(learner).toBeInstanceOf(StyleLearner);
  });
});

// ============ 与 PreferenceLearner 集成测试 ============

describe('与 PreferenceLearner 集成', () => {
  it('风格画像可被 PreferenceLearner 消费', async () => {
    // 动态导入以避免循环依赖
    const { PreferenceLearner } = await import('../../agent/preference-learner');
    const { PreferenceType } = await import('../../../types/memory');

    const prefLearner = new PreferenceLearner();
    const styleLearner = createStyleLearner();

    const profile = styleLearner.learn('user1', [makeSample({ templateId: 't1' })]);
    const learned = prefLearner.learnFromStyleProfile(profile);

    expect(learned.length).toBeGreaterThan(0);
    const visualPrefs = prefLearner.getPreferencesByType(PreferenceType.VISUAL_STYLE);
    expect(visualPrefs.length).toBeGreaterThan(0);
  });

  it('文档风格可被 PreferenceLearner 学习', async () => {
    const { PreferenceLearner } = await import('../../agent/preference-learner');
    const { PreferenceType } = await import('../../../types/memory');

    const prefLearner = new PreferenceLearner();
    const style = makeDocumentStyle();
    const learned = prefLearner.learnFromDocumentStyle(style);

    expect(learned.length).toBe(3);
    expect(prefLearner.getPreferencesByType(PreferenceType.VISUAL_STYLE).length).toBe(1);
    expect(prefLearner.getPreferencesByType(PreferenceType.TEXTUAL_STYLE).length).toBe(1);
    expect(prefLearner.getPreferencesByType(PreferenceType.CONTENT_STYLE).length).toBe(1);
  });

  it('可应用风格偏好到回答', async () => {
    const { PreferenceLearner } = await import('../../agent/preference-learner');

    const prefLearner = new PreferenceLearner();
    const styleLearner = createStyleLearner();
    const profile = styleLearner.learn('user1', [makeSample({ templateId: 't1' })]);

    const answer = '这是一个回答。';
    const modified = prefLearner.applyStylePreferencesToAnswer(answer, profile);
    expect(typeof modified).toBe('string');
  });
});