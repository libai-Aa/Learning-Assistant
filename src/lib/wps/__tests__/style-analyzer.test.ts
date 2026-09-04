/**
 * 风格分析器 (StyleAnalyzer) 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  StyleAnalyzer,
  styleAnalyzer,
  normalizeHexColor,
  colorBrightness,
  isDarkColor,
  analyzeColorScheme,
  analyzeFontPreference,
  analyzeSizePreference,
  analyzeLayoutStyle,
  estimateWhitespaceRatio,
  inferVisualDensity,
  inferImageUsage,
  inferChartUsage,
  inferToneStyle,
  inferSentenceLength,
  inferVocabularyLevel,
  inferStructurePattern,
  calculateFormalityLevel,
  calculateConciseness,
  inferTopicPreference,
  inferExampleUsage,
  inferDataUsage,
  inferCategory,
  calculateAnalysisConfidence,
} from '../style-analyzer';
import type { StyleAnalysisInput } from '../../../types/style';

// ============ 工具函数测试 ============

describe('normalizeHexColor', () => {
  it('应该规范化 6 位 hex', () => {
    expect(normalizeHexColor('#1A56DB')).toBe('#1a56db');
    expect(normalizeHexColor('1a56db')).toBe('#1a56db');
  });

  it('应该展开 3 位简写', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('abc')).toBe('#aabbcc');
  });

  it('应该拒绝非法输入', () => {
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor('#xyz')).toBeNull();
    expect(normalizeHexColor('#1234567')).toBeNull();
  });
});

describe('colorBrightness', () => {
  it('白色亮度应为 255', () => {
    expect(colorBrightness('#ffffff')).toBeCloseTo(255, 0);
  });

  it('黑色亮度应为 0', () => {
    expect(colorBrightness('#000000')).toBeCloseTo(0, 0);
  });

  it('非法颜色返回默认值 128', () => {
    expect(colorBrightness('invalid')).toBe(128);
  });
});

describe('isDarkColor', () => {
  it('黑色是深色', () => {
    expect(isDarkColor('#000000')).toBe(true);
  });

  it('白色不是深色', () => {
    expect(isDarkColor('#ffffff')).toBe(false);
  });
});

// ============ 颜色分析测试 ============

describe('analyzeColorScheme', () => {
  it('空颜色列表应返回默认配色', () => {
    const scheme = analyzeColorScheme([]);
    expect(scheme.background.length).toBeGreaterThan(0);
    expect(scheme.isDark).toBe(false);
    expect(scheme.paletteType).toBe('monochrome');
  });

  it('应该按语义角色分组颜色', () => {
    const scheme = analyzeColorScheme([
      '#1a56db',  // primary
      '#f59e0b',  // accent
      '#ffffff',  // background
    ]);
    expect(scheme.primary).toContain('#1a56db');
    expect(scheme.accent).toContain('#f59e0b');
    expect(scheme.background).toContain('#ffffff');
  });

  it('应该尊重 isDarkTheme 参数', () => {
    const scheme = analyzeColorScheme(['#1a56db'], true);
    expect(scheme.isDark).toBe(true);
  });

  it('应该处理深色背景', () => {
    const scheme = analyzeColorScheme(['#0f172a']);
    expect(scheme.isDark).toBe(true);
  });

  it('应该推断调色板类型', () => {
    expect(analyzeColorScheme(['#1a56db']).paletteType).toBe('monochrome');
    expect(analyzeColorScheme(['#1a56db', '#ffffff']).paletteType).toBe('complementary');
    expect(analyzeColorScheme(['#1a56db', '#ffffff', '#f59e0b', '#22c55e']).paletteType).toBe('analogous');
    expect(analyzeColorScheme(['#1a56db', '#ffffff', '#f59e0b', '#22c55e', '#7c3aed', '#dc2626']).paletteType).toBe('custom');
  });
});

// ============ 字体分析测试 ============

describe('analyzeFontPreference', () => {
  it('空字体列表应返回默认', () => {
    const pref = analyzeFontPreference([]);
    expect(pref.primaryFont).toBe('sans-serif');
    expect(pref.category).toBe('sans-serif');
  });

  it('应该识别衬线字体', () => {
    const pref = analyzeFontPreference(['Times New Roman', '宋体']);
    expect(pref.category).toBe('serif');
  });

  it('应该识别无衬线字体', () => {
    const pref = analyzeFontPreference(['思源黑体', '微软雅黑']);
    expect(pref.category).toBe('sans-serif');
  });

  it('应该识别等宽字体', () => {
    const pref = analyzeFontPreference(['Consolas', 'Courier New']);
    expect(pref.category).toBe('monospace');
  });

  it('应该识别混合字体', () => {
    const pref = analyzeFontPreference(['思源黑体', '宋体']);
    expect(pref.category).toBe('mixed');
  });

  it('应该推断字重偏好', () => {
    expect(analyzeFontPreference(['思源黑体 Bold']).weightPreference).toBe('bold');
    expect(analyzeFontPreference(['思源黑体 Light']).weightPreference).toBe('light');
    expect(analyzeFontPreference(['思源黑体 Regular']).weightPreference).toBe('regular');
  });
});

// ============ 字号分析测试 ============

describe('analyzeSizePreference', () => {
  it('空字号返回常规', () => {
    expect(analyzeSizePreference([]).tendency).toBe('regular');
  });

  it('应该识别小字号', () => {
    const pref = analyzeSizePreference([8, 9, 10]);
    expect(pref.tendency).toBe('small');
  });

  it('应该识别大字号', () => {
    const pref = analyzeSizePreference([18, 24, 36]);
    expect(pref.tendency).toBe('large');
  });

  it('应该正确分配标题/正文/注释字号', () => {
    const pref = analyzeSizePreference([10, 12, 18]);
    expect(pref.caption).toBe(10);
    expect(pref.body).toBe(12);
    expect(pref.title).toBe(18);
  });
});

// ============ 布局分析测试 ============

describe('analyzeLayoutStyle', () => {
  it('PPT 应使用 cover-center 或 grid', () => {
    const layout = analyzeLayoutStyle('ppt', false, 30);
    expect(layout.type).toBe('cover-center');
    const layout2 = analyzeLayoutStyle('ppt', false, 150);
    expect(layout2.type).toBe('grid');
  });

  it('Word 应使用 single-column 或 multi-column', () => {
    expect(analyzeLayoutStyle('word', false).type).toBe('single-column');
    expect(analyzeLayoutStyle('word', true).type).toBe('multi-column');
  });

  it('多栏应使用 justify 对齐', () => {
    expect(analyzeLayoutStyle('word', true).alignment).toBe('justify');
  });
});

describe('estimateWhitespaceRatio', () => {
  it('少字数应高留白', () => {
    expect(estimateWhitespaceRatio(30)).toBe(0.8);
  });
  it('多字数应低留白', () => {
    expect(estimateWhitespaceRatio(300)).toBe(0.2);
  });
  it('未定义应返回默认', () => {
    expect(estimateWhitespaceRatio(undefined)).toBe(0.4);
  });
});

// ============ 密度与使用强度测试 ============

describe('inferVisualDensity', () => {
  it('少字数应为 sparse', () => {
    expect(inferVisualDensity(50)).toBe('sparse');
  });
  it('中等字数应为 medium', () => {
    expect(inferVisualDensity(150)).toBe('medium');
  });
  it('多字数应为 dense', () => {
    expect(inferVisualDensity(300)).toBe('dense');
  });
});

describe('inferImageUsage', () => {
  it('无图片为 none', () => {
    expect(inferImageUsage(0, 10)).toBe('none');
    expect(inferImageUsage(undefined, 10)).toBe('none');
  });
  it('少量图片为 light', () => {
    expect(inferImageUsage(5, 10)).toBe('light');
  });
  it('中等图片为 moderate', () => {
    expect(inferImageUsage(20, 10)).toBe('moderate');
  });
  it('大量图片为 heavy', () => {
    expect(inferImageUsage(60, 10)).toBe('heavy');
  });
});

describe('inferChartUsage', () => {
  it('无图表为 none', () => {
    expect(inferChartUsage(0, 10)).toBe('none');
  });
  it('少量图表为 light', () => {
    expect(inferChartUsage(2, 10)).toBe('light');
  });
});

// ============ 文本风格测试 ============

describe('inferToneStyle', () => {
  it('空文本为 neutral', () => {
    expect(inferToneStyle('')).toBe('neutral');
  });

  it('正式信号为 formal', () => {
    expect(inferToneStyle('综上所述，研究表明该方案有效。因此，我们据此推断...')).toBe('formal');
  });

  it('随意信号为 casual', () => {
    expect(inferToneStyle('咱们一起来搞定这个事情，awesome！')).toBe('casual');
  });

  it('学术信号为 academic', () => {
    expect(inferToneStyle('本文的 abstract 描述了 methodology。参考文献附后。')).toBe('academic');
  });

  it('说服信号为 persuasive', () => {
    expect(inferToneStyle('我们应该必须采取这个方案，强烈推荐。')).toBe('persuasive');
  });
});

describe('inferSentenceLength', () => {
  it('短句为 short', () => {
    expect(inferSentenceLength('你好。再见。谢谢。好的。')).toBe('short');
  });

  it('长句为 long', () => {
    const longText = '这是一个非常非常非常非常非常长的句子，包含了很多很多很多很多很多的内容，用来测试长句识别功能是否正常工作。'.repeat(3);
    expect(inferSentenceLength(longText)).toBe('long');
  });

  it('空文本为 medium', () => {
    expect(inferSentenceLength('')).toBe('medium');
  });
});

describe('inferVocabularyLevel', () => {
  it('简单词汇为 simple', () => {
    expect(inferVocabularyLevel('我们可以这样做，就是这样。')).toBe('simple');
  });

  it('高级词汇为 advanced', () => {
    expect(inferVocabularyLevel('该拓扑结构的渐近行为与同构性质相关。')).toBe('advanced');
  });

  it('混合词汇为 mixed', () => {
    expect(inferVocabularyLevel('我们可以分析该拓扑结构的范式。')).toBe('mixed');
  });
});

describe('inferStructurePattern', () => {
  it('问题-方案模式', () => {
    expect(inferStructurePattern('当前存在的问题是X。我们的解决方案是Y。')).toBe('problem-solution');
  });

  it('时间顺序模式', () => {
    expect(inferStructurePattern('首先做A，其次做B，然后做C，最后做D。')).toBe('chronological');
  });

  it('金字塔模式', () => {
    expect(inferStructurePattern('结论是X。核心观点是Y。总分结构展开。')).toBe('pyramid');
  });

  it('对比模式', () => {
    expect(inferStructurePattern('A 与 B 相比，差异在于...')).toBe('comparison');
  });

  it('空文本为 custom', () => {
    expect(inferStructurePattern('')).toBe('custom');
  });
});

describe('calculateFormalityLevel', () => {
  it('空文本为 0.5', () => {
    expect(calculateFormalityLevel('')).toBe(0.5);
  });

  it('正式文本应高于 0.5', () => {
    expect(calculateFormalityLevel('综上所述，因此，研究表明')).toBeGreaterThan(0.5);
  });

  it('非正式文本应低于 0.5', () => {
    expect(calculateFormalityLevel('咱们搞定啦哈哈')).toBeLessThan(0.5);
  });

  it('应在 [0,1] 范围内', () => {
    const value = calculateFormalityLevel('综上所述咱们搞定');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});

describe('calculateConciseness', () => {
  it('空文本为 0.5', () => {
    expect(calculateConciseness('')).toBe(0.5);
  });

  it('短句应较高简洁度', () => {
    expect(calculateConciseness('你好。再见。')).toBeGreaterThan(0.5);
  });

  it('冗余词应降低简洁度', () => {
    const concise = calculateConciseness('这是A。这是B。');
    const redundant = calculateConciseness('也就是说，这是A。换句话说，这是B。');
    expect(redundant).toBeLessThan(concise);
  });
});

// ============ 内容风格测试 ============

describe('inferTopicPreference', () => {
  it('应该从文本推断主题', () => {
    const topics = inferTopicPreference('本文分析数据趋势与统计指标');
    expect(topics).toContain('数据分析');
  });

  it('应该合并显式主题', () => {
    const topics = inferTopicPreference('内容', ['自定义主题']);
    expect(topics).toContain('自定义主题');
  });

  it('空文本应返回空列表', () => {
    expect(inferTopicPreference('')).toEqual([]);
  });
});

describe('inferExampleUsage', () => {
  it('无例子为 rare', () => {
    expect(inferExampleUsage('这是理论描述。')).toBe('rare');
  });
  it('少量例子为 occasional', () => {
    expect(inferExampleUsage('例如A。比如B。')).toBe('occasional');
  });
  it('多例子为 frequent', () => {
    expect(inferExampleUsage('例如A。比如B。举例C。案例D。')).toBe('frequent');
  });
});

describe('inferDataUsage', () => {
  it('定量数据', () => {
    expect(inferDataUsage('同比增长 30%，占比 50%')).toBe('quantitative');
  });
  it('定性数据', () => {
    expect(inferDataUsage('用户体验感受良好，反馈正面')).toBe('qualitative');
  });
  it('混合数据', () => {
    expect(inferDataUsage('占比 50%，用户感受良好')).toBe('mixed');
  });
  it('无数据', () => {
    expect(inferDataUsage('这是描述性文字')).toBe('none');
  });
});

// ============ 分类推断测试 ============

describe('inferCategory', () => {
  it('学术分类', () => {
    expect(inferCategory('这是一篇论文，包含 abstract 和参考文献')).toBe('academic');
  });
  it('商务分类', () => {
    expect(inferCategory('这是商业计划书，用于融资')).toBe('business');
  });
  it('未命中返回 undefined', () => {
    expect(inferCategory('普通文本')).toBeUndefined();
  });
});

// ============ 置信度测试 ============

describe('calculateAnalysisConfidence', () => {
  it('空输入为 0', () => {
    const input: StyleAnalysisInput = { documentType: 'word' };
    expect(calculateAnalysisConfidence(input)).toBe(0);
  });

  it('完整输入应高置信度', () => {
    const input: StyleAnalysisInput = {
      documentType: 'ppt',
      textContent: '这是一段足够长的文本内容用于测试置信度计算',
      colors: ['#1a56db'],
      fonts: ['思源黑体'],
      fontSizes: [12, 18],
      pageCount: 10,
      imageCount: 5,
    };
    expect(calculateAnalysisConfidence(input)).toBeGreaterThan(0.5);
  });
});

// ============ 集成分析测试 ============

describe('StyleAnalyzer', () => {
  const analyzer = new StyleAnalyzer();

  it('应该分析完整文档', () => {
    const input: StyleAnalysisInput = {
      documentType: 'ppt',
      textContent: '综上所述，研究表明该数据分析方案有效。因此我们据此推断，首先做A，其次做B。',
      colors: ['#1a56db', '#ffffff', '#f59e0b'],
      fonts: ['思源黑体'],
      fontSizes: [12, 18, 24],
      pageCount: 10,
      avgWordsPerPage: 100,
      imageCount: 20,
      chartCount: 5,
    };
    const style = analyzer.analyze(input);

    expect(style.documentType).toBe('ppt');
    expect(style.visual.colorScheme.primary.length).toBeGreaterThan(0);
    expect(style.visual.fontFamily.primaryFont).toBe('思源黑体');
    expect(style.textual.toneStyle).toBe('formal');
    expect(style.content.topicPreference.length).toBeGreaterThan(0);
    expect(style.confidence).toBeGreaterThan(0);
  });

  it('analyzePPT 便捷方法', () => {
    const style = analyzer.analyzePPT({
      textContent: '演示文稿',
      avgWordsPerPage: 30,
    });
    expect(style.documentType).toBe('ppt');
    expect(style.visual.visualDensity).toBe('sparse');
  });

  it('analyzeWord 便捷方法', () => {
    const style = analyzer.analyzeWord({
      textContent: '正文内容',
    });
    expect(style.documentType).toBe('word');
  });

  it('analyzeArticle 便捷方法', () => {
    const style = analyzer.analyzeArticle({
      textContent: '文章内容',
    });
    expect(style.documentType).toBe('word');
  });

  it('空输入应返回合理默认值', () => {
    const style = analyzer.analyze({ documentType: 'word' });
    expect(style.visual.visualDensity).toBe('medium');
    expect(style.textual.toneStyle).toBe('neutral');
    expect(style.content.topicPreference).toEqual([]);
    expect(style.confidence).toBe(0);
  });
});

describe('styleAnalyzer 单例', () => {
  it('应该可用', () => {
    expect(styleAnalyzer).toBeInstanceOf(StyleAnalyzer);
  });
});