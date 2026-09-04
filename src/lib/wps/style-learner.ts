/**
 * 风格学习器 (StyleLearner)
 *
 * @description "更懂你的WPS"风格学习系统的第二层：从多个满意模板中学习
 *   用户的综合风格偏好，输出 UserStyleProfile。
 *
 *   设计思路（说人话）：
 *     这一层是"品位教练"——拿到品鉴师（StyleAnalyzer）给的多份品鉴报告，
 *     综合出一份"用户品位画像"。教练只从用户满意的模板（评分≥4 或标记满意）
 *     中学习，因为满意才代表品位。
 *
 *   核心能力：
 *     1. 批量学习：从模板列表一次性学习
 *     2. 增量学习：新模板加入时更新画像（含演变轨迹）
 *     3. 风格权重计算：按使用频率、评分加权，分场景记录
 *     4. 风格相似度计算：可解释的分量分解
 *     5. 风格推荐：给定场景推荐最匹配的风格
 *     6. 与 PreferenceLearner 集成：导出为通用偏好
 *
 *   数学抽象：
 *     设用户有 N 个满意模板，每个模板 i 的风格为 s_i、权重为 w_i，
 *     则用户综合风格 S = Σ(w_i * s_i) / Σ(w_i)。
 *     权重 w_i = usageCount_i * rating_i * recency_i，分别反映
 *     使用频率、满意程度、时间近因。
 *
 * @module src/lib/wps/style-learner
 */

import type {
  DocumentStyle,
  RequiredStyleLearnerConfig,
  StyleChange,
  StyleLearnerConfig,
  StyleRecommendation,
  StyleRecommendationRequest,
  StyleSimilarityBreakdown,
  UserStyleProfile,
  VisualStyle,
  TextualStyle,
  ContentStyle,
  ColorScheme,
  FontPreference,
  SizePreference,
  LayoutStyle,
} from '../../types/style';
import { DEFAULT_STYLE_LEARNER_CONFIG } from '../../types/style';
import type { DocumentTemplate } from '../../types/template';
import { StyleAnalyzer } from './style-analyzer';

// ============ 模板学习样本 ============

/**
 * 风格学习样本
 * 把模板 + 评分 + 满意标记封装成一个学习单元
 */
export interface StyleLearningSample {
  /** 模板 ID */
  templateId: string;
  /** 已分析的文档风格（优先使用，未提供则从 template 现场分析） */
  documentStyle?: DocumentStyle;
  /** 关联的模板（当 documentStyle 未提供时用于现场分析） */
  template?: DocumentTemplate;
  /** 用户评分 1-5（可选） */
  rating?: number;
  /** 用户是否显式标记满意（优先级高于评分阈值） */
  satisfied?: boolean;
  /** 使用次数（影响权重） */
  usageCount?: number;
  /** 学习时间戳（ISO 字符串） */
  timestamp?: string;
  /** 文档分类（用于权重表） */
  category?: string;
  /** 使用场景（用于权重表） */
  scenarios?: string[];
  /** 主题（用于权重表） */
  topics?: string[];
}

// ============ 工具函数 ============

/**
 * 生成风格演变事件 ID
 */
export function generateStyleChangeId(): string {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 判断样本是否满意
 * 满意判定：显式标记 satisfied 优先；否则看评分是否达到阈值
 */
export function isSampleSatisfied(
  sample: StyleLearningSample,
  threshold: number
): boolean {
  if (sample.satisfied === true) return true;
  if (sample.satisfied === false) return false;
  if (sample.rating === undefined) return false;
  return sample.rating >= threshold;
}

/**
 * 计算样本权重
 * w = (rating / 5) * (1 + log(1 + usageCount)) * recencyFactor
 * - rating 越高权重越大
 * - usageCount 越多权重越大（对数压缩，避免热门模板过度主导）
 * - recencyFactor 由调用方按需注入（默认 1）
 */
export function computeSampleWeight(
  sample: StyleLearningSample,
  recencyFactor = 1
): number {
  const rating = sample.rating ?? 4; // 默认按满意阈值
  const usageCount = sample.usageCount ?? 0;
  const ratingFactor = rating / 5;
  const usageFactor = 1 + Math.log(1 + usageCount);
  return ratingFactor * usageFactor * recencyFactor;
}

// ============ 风格聚合 ============

/**
 * 聚合配色方案
 * 取所有样本中频次最高的颜色作为代表
 */
function aggregateColorScheme(schemes: ColorScheme[], weights: number[]): ColorScheme {
  if (schemes.length === 0) {
    return {
      primary: [], secondary: [], accent: [], background: [],
      isDark: false, paletteType: 'custom',
    };
  }

  // 按角色收集 (color -> weight sum)
  const collect = (lists: string[][]) => {
    const map = new Map<string, number>();
    lists.forEach((list, i) => {
      const w = weights[i] ?? 1;
      for (const c of list) {
        map.set(c, (map.get(c) || 0) + w);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  };

  const primary = collect(schemes.map((s) => s.primary)).slice(0, 4);
  const secondary = collect(schemes.map((s) => s.secondary)).slice(0, 4);
  const accent = collect(schemes.map((s) => s.accent)).slice(0, 4);
  const background = collect(schemes.map((s) => s.background)).slice(0, 3);

  // isDark: 加权多数表决
  const darkWeight = schemes.reduce(
    (acc, s, i) => acc + (s.isDark ? weights[i] ?? 1 : 0),
    0
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const isDark = totalWeight > 0 && darkWeight > totalWeight / 2;

  // paletteType: 取众数
  const paletteCounts = new Map<ColorScheme['paletteType'], number>();
  schemes.forEach((s, i) => {
    const w = weights[i] ?? 1;
    paletteCounts.set(s.paletteType, (paletteCounts.get(s.paletteType) || 0) + w);
  });
  const paletteType = Array.from(paletteCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'custom';

  return { primary, secondary, accent, background, isDark, paletteType };
}

/**
 * 聚合字体偏好
 */
function aggregateFontPreference(fonts: FontPreference[], weights: number[]): FontPreference {
  if (fonts.length === 0) {
    return {
      primaryFont: 'sans-serif',
      category: 'sans-serif',
      weightPreference: 'regular',
    };
  }
  // 主字体：取权重最高的
  const fontMap = new Map<string, number>();
  fonts.forEach((f, i) => {
    const w = weights[i] ?? 1;
    fontMap.set(f.primaryFont, (fontMap.get(f.primaryFont) || 0) + w);
  });
  const primaryFont = Array.from(fontMap.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'sans-serif';

  // 次字体：取首个非空
  const secondaryFont = fonts.find((f) => f.secondaryFont)?.secondaryFont;

  // category / weightPreference: 取众数
  const mode = <T,>(values: T[], weights: number[]): T | undefined => {
    const counts = new Map<T, number>();
    values.forEach((v, i) => {
      const w = weights[i] ?? 1;
      counts.set(v, (counts.get(v) || 0) + w);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  };

  return {
    primaryFont,
    secondaryFont,
    category: mode(fonts.map((f) => f.category), weights) || 'sans-serif',
    weightPreference: mode(fonts.map((f) => f.weightPreference), weights) || 'regular',
  };
}

/**
 * 聚合字号偏好
 */
function aggregateSizePreference(sizes: SizePreference[], weights: number[]): SizePreference {
  if (sizes.length === 0) return { tendency: 'regular' };

  const weightedAvg = (values: number[]) => {
    const total = values.reduce((acc, v, i) => acc + v * (weights[i] ?? 1), 0);
    const wsum = weights.slice(0, values.length).reduce((a, b) => a + b, 0);
    return wsum > 0 ? total / wsum : undefined;
  };

  const titles = sizes.map((s) => s.title).filter((v): v is number => v !== undefined);
  const bodies = sizes.map((s) => s.body).filter((v): v is number => v !== undefined);
  const captions = sizes.map((s) => s.caption).filter((v): v is number => v !== undefined);

  const tendencyCounts = new Map<SizePreference['tendency'], number>();
  sizes.forEach((s, i) => {
    const w = weights[i] ?? 1;
    tendencyCounts.set(s.tendency, (tendencyCounts.get(s.tendency) || 0) + w);
  });
  const tendency = Array.from(tendencyCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'regular';

  return {
    title: weightedAvg(titles),
    body: weightedAvg(bodies),
    caption: weightedAvg(captions),
    tendency,
  };
}

/**
 * 聚合布局风格
 */
function aggregateLayoutStyle(layouts: LayoutStyle[], weights: number[]): LayoutStyle {
  if (layouts.length === 0) {
    return { type: 'single-column', whitespaceRatio: 0.4, multiColumn: false, alignment: 'left' };
  }

  const typeCounts = new Map<string, number>();
  layouts.forEach((l, i) => {
    const w = weights[i] ?? 1;
    typeCounts.set(l.type, (typeCounts.get(l.type) || 0) + w);
  });
  const type = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'single-column';

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const whitespaceRatio = layouts.reduce(
    (acc, l, i) => acc + l.whitespaceRatio * (weights[i] ?? 1),
    0
  ) / Math.max(totalWeight, 1);

  const multiColumnWeight = layouts.reduce(
    (acc, l, i) => acc + (l.multiColumn ? weights[i] ?? 1 : 0),
    0
  );
  const multiColumn = totalWeight > 0 && multiColumnWeight > totalWeight / 2;

  const alignmentCounts = new Map<LayoutStyle['alignment'], number>();
  layouts.forEach((l, i) => {
    const w = weights[i] ?? 1;
    alignmentCounts.set(l.alignment, (alignmentCounts.get(l.alignment) || 0) + w);
  });
  const alignment = Array.from(alignmentCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'left';

  return { type, whitespaceRatio, multiColumn, alignment };
}

/**
 * 聚合视觉风格
 */
function aggregateVisualStyle(styles: VisualStyle[], weights: number[]): VisualStyle {
  if (styles.length === 0) {
    return {
      colorScheme: {
        primary: [], secondary: [], accent: [], background: [],
        isDark: false, paletteType: 'custom',
      },
      fontFamily: { primaryFont: 'sans-serif', category: 'sans-serif', weightPreference: 'regular' },
      fontSize: { tendency: 'regular' },
      layoutStyle: { type: 'single-column', whitespaceRatio: 0.4, multiColumn: false, alignment: 'left' },
      visualDensity: 'medium',
      imageUsage: 'none',
      chartUsage: 'none',
    };
  }

  // 枚举字段取众数
  const mode = <T extends string>(values: T[], weights: number[]): T => {
    const counts = new Map<T, number>();
    values.forEach((v, i) => {
      const w = weights[i] ?? 1;
      counts.set(v, (counts.get(v) || 0) + w);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || values[0];
  };

  return {
    colorScheme: aggregateColorScheme(styles.map((s) => s.colorScheme), weights),
    fontFamily: aggregateFontPreference(styles.map((s) => s.fontFamily), weights),
    fontSize: aggregateSizePreference(styles.map((s) => s.fontSize), weights),
    layoutStyle: aggregateLayoutStyle(styles.map((s) => s.layoutStyle), weights),
    visualDensity: mode(styles.map((s) => s.visualDensity), weights),
    imageUsage: mode(styles.map((s) => s.imageUsage), weights),
    chartUsage: mode(styles.map((s) => s.chartUsage), weights),
  };
}

/**
 * 聚合文本风格
 */
function aggregateTextualStyle(styles: TextualStyle[], weights: number[]): TextualStyle {
  if (styles.length === 0) {
    return {
      toneStyle: 'neutral',
      sentenceLength: 'medium',
      vocabularyLevel: 'intermediate',
      structurePattern: 'custom',
      formalityLevel: 0.5,
      conciseness: 0.5,
    };
  }

  const mode = <T extends string>(values: T[], weights: number[]): T => {
    const counts = new Map<T, number>();
    values.forEach((v, i) => {
      const w = weights[i] ?? 1;
      counts.set(v, (counts.get(v) || 0) + w);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || values[0];
  };

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedAvg = (values: number[]) =>
    values.reduce((acc, v, i) => acc + v * (weights[i] ?? 1), 0) / Math.max(totalWeight, 1);

  return {
    toneStyle: mode(styles.map((s) => s.toneStyle), weights),
    sentenceLength: mode(styles.map((s) => s.sentenceLength), weights),
    vocabularyLevel: mode(styles.map((s) => s.vocabularyLevel), weights),
    structurePattern: mode(styles.map((s) => s.structurePattern), weights),
    formalityLevel: weightedAvg(styles.map((s) => s.formalityLevel)),
    conciseness: weightedAvg(styles.map((s) => s.conciseness)),
  };
}

/**
 * 聚合内容风格
 */
function aggregateContentStyle(styles: ContentStyle[], weights: number[]): ContentStyle {
  if (styles.length === 0) {
    return {
      topicPreference: [],
      exampleUsage: 'rare',
      dataUsage: 'none',
    };
  }

  const mode = <T extends string>(values: T[], weights: number[]): T => {
    const counts = new Map<T, number>();
    values.forEach((v, i) => {
      const w = weights[i] ?? 1;
      counts.set(v, (counts.get(v) || 0) + w);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || values[0];
  };

  // 主题偏好：按权重累计频次，取 Top N
  const topicMap = new Map<string, number>();
  styles.forEach((s, i) => {
    const w = weights[i] ?? 1;
    for (const t of s.topicPreference) {
      topicMap.set(t, (topicMap.get(t) || 0) + w);
    }
  });
  const topicPreference = Array.from(topicMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);

  // 引用风格：取众数（忽略 undefined）
  const citationStyles = styles.map((s) => s.citationStyle).filter((v): v is string => !!v);
  const citationStyle = citationStyles.length > 0
    ? mode(citationStyles, weights)
    : undefined;

  return {
    topicPreference,
    exampleUsage: mode(styles.map((s) => s.exampleUsage), weights),
    dataUsage: mode(styles.map((s) => s.dataUsage), weights),
    citationStyle,
  };
}

// ============ 风格相似度 ============

/**
 * 计算颜色列表的 Jaccard 相似度
 */
function colorJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  setA.forEach((c) => { if (setB.has(c)) intersection++; });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 计算视觉风格相似度 [0,1]
 */
export function computeVisualSimilarity(a: VisualStyle, b: VisualStyle): number {
  // 颜色相似度：逐角色计算 Jaccard，跳过两个都为空的角色
  const colorRoles: Array<[string[], string[]]> = [
    [a.colorScheme.primary, b.colorScheme.primary],
    [a.colorScheme.secondary, b.colorScheme.secondary],
    [a.colorScheme.accent, b.colorScheme.accent],
    [a.colorScheme.background, b.colorScheme.background],
  ];
  let colorSum = 0;
  let colorCount = 0;
  for (const [listA, listB] of colorRoles) {
    // 两个都为空视为该角色无信号，跳过
    if (listA.length === 0 && listB.length === 0) continue;
    colorSum += colorJaccard(listA, listB);
    colorCount++;
  }
  const colorScore = colorCount === 0 ? 1 : colorSum / colorCount;

  const fontScore = (
    (a.fontFamily.primaryFont === b.fontFamily.primaryFont ? 1 : 0) +
    (a.fontFamily.category === b.fontFamily.category ? 1 : 0) +
    (a.fontFamily.weightPreference === b.fontFamily.weightPreference ? 1 : 0)
  ) / 3;

  const layoutScore = (
    (a.layoutStyle.type === b.layoutStyle.type ? 1 : 0) +
    (1 - Math.abs(a.layoutStyle.whitespaceRatio - b.layoutStyle.whitespaceRatio)) +
    (a.layoutStyle.multiColumn === b.layoutStyle.multiColumn ? 1 : 0) +
    (a.layoutStyle.alignment === b.layoutStyle.alignment ? 1 : 0)
  ) / 4;

  const enumScore = (
    (a.visualDensity === b.visualDensity ? 1 : 0) +
    (a.imageUsage === b.imageUsage ? 1 : 0) +
    (a.chartUsage === b.chartUsage ? 1 : 0)
  ) / 3;

  return (colorScore + fontScore + layoutScore + enumScore) / 4;
}

/**
 * 计算文本风格相似度 [0,1]
 */
export function computeTextualSimilarity(a: TextualStyle, b: TextualStyle): number {
  const enumScore = (
    (a.toneStyle === b.toneStyle ? 1 : 0) +
    (a.sentenceLength === b.sentenceLength ? 1 : 0) +
    (a.vocabularyLevel === b.vocabularyLevel ? 1 : 0) +
    (a.structurePattern === b.structurePattern ? 1 : 0)
  ) / 4;

  const continuousScore = (
    (1 - Math.abs(a.formalityLevel - b.formalityLevel)) +
    (1 - Math.abs(a.conciseness - b.conciseness))
  ) / 2;

  return (enumScore + continuousScore) / 2;
}

/**
 * 计算内容风格相似度 [0,1]
 */
export function computeContentSimilarity(a: ContentStyle, b: ContentStyle): number {
  const topicScore = colorJaccard(a.topicPreference, b.topicPreference);
  const enumScore = (
    (a.exampleUsage === b.exampleUsage ? 1 : 0) +
    (a.dataUsage === b.dataUsage ? 1 : 0) +
    (a.citationStyle === b.citationStyle ? 1 : 0)
  ) / 3;
  return (topicScore + enumScore) / 2;
}

/**
 * 计算文档风格相似度（含分量分解）
 *
 * 综合分数 = 0.4 * visual + 0.35 * textual + 0.25 * content
 * 权重反映"视觉差异最显眼、文本风格次之、内容主题相对灵活"
 */
export function computeStyleSimilarity(
  a: DocumentStyle,
  b: DocumentStyle
): StyleSimilarityBreakdown {
  const visual = computeVisualSimilarity(a.visual, b.visual);
  const textual = computeTextualSimilarity(a.textual, b.textual);
  const content = computeContentSimilarity(a.content, b.content);
  const overall = visual * 0.4 + textual * 0.35 + content * 0.25;
  return { visual, textual, content, overall };
}

// ============ 风格变化检测 ============

/**
 * 序列化风格字段值，用于演变事件记录
 */
function serializeStyleValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 检测两个视觉风格之间的变化
 */
function detectVisualChanges(
  oldStyle: VisualStyle,
  newStyle: VisualStyle,
  templateId: string,
  timestamp: string
): StyleChange[] {
  const changes: StyleChange[] = [];
  const fields: Array<{ field: string; oldVal: unknown; newVal: unknown; magnitude: number }> = [
    {
      field: 'visualDensity',
      oldVal: oldStyle.visualDensity,
      newVal: newStyle.visualDensity,
      magnitude: oldStyle.visualDensity === newStyle.visualDensity ? 0 : 0.5,
    },
    {
      field: 'imageUsage',
      oldVal: oldStyle.imageUsage,
      newVal: newStyle.imageUsage,
      magnitude: oldStyle.imageUsage === newStyle.imageUsage ? 0 : 0.5,
    },
    {
      field: 'chartUsage',
      oldVal: oldStyle.chartUsage,
      newVal: newStyle.chartUsage,
      magnitude: oldStyle.chartUsage === newStyle.chartUsage ? 0 : 0.5,
    },
    {
      field: 'colorScheme',
      oldVal: oldStyle.colorScheme,
      newVal: newStyle.colorScheme,
      magnitude: 1 - computeVisualSimilarity(oldStyle, newStyle),
    },
  ];

  for (const { field, oldVal, newVal, magnitude } of fields) {
    if (magnitude > 0) {
      changes.push({
        id: generateStyleChangeId(),
        timestamp,
        templateId,
        dimension: 'visual',
        field,
        oldValue: serializeStyleValue(oldVal),
        newValue: serializeStyleValue(newVal),
        magnitude,
      });
    }
  }
  return changes;
}

/**
 * 检测两个文本风格之间的变化
 */
function detectTextualChanges(
  oldStyle: TextualStyle,
  newStyle: TextualStyle,
  templateId: string,
  timestamp: string
): StyleChange[] {
  const changes: StyleChange[] = [];
  const enumFields: Array<keyof TextualStyle> = [
    'toneStyle', 'sentenceLength', 'vocabularyLevel', 'structurePattern',
  ];

  for (const field of enumFields) {
    if (oldStyle[field] !== newStyle[field]) {
      changes.push({
        id: generateStyleChangeId(),
        timestamp,
        templateId,
        dimension: 'textual',
        field,
        oldValue: String(oldStyle[field]),
        newValue: String(newStyle[field]),
        magnitude: 0.5,
      });
    }
  }

  const formalityDelta = Math.abs(oldStyle.formalityLevel - newStyle.formalityLevel);
  if (formalityDelta > 0) {
    changes.push({
      id: generateStyleChangeId(),
      timestamp,
      templateId,
      dimension: 'textual',
      field: 'formalityLevel',
      oldValue: serializeStyleValue(oldStyle.formalityLevel),
      newValue: serializeStyleValue(newStyle.formalityLevel),
      magnitude: formalityDelta,
    });
  }

  const concisenessDelta = Math.abs(oldStyle.conciseness - newStyle.conciseness);
  if (concisenessDelta > 0) {
    changes.push({
      id: generateStyleChangeId(),
      timestamp,
      templateId,
      dimension: 'textual',
      field: 'conciseness',
      oldValue: serializeStyleValue(oldStyle.conciseness),
      newValue: serializeStyleValue(newStyle.conciseness),
      magnitude: concisenessDelta,
    });
  }

  return changes;
}

/**
 * 检测两个内容风格之间的变化
 */
function detectContentChanges(
  oldStyle: ContentStyle,
  newStyle: ContentStyle,
  templateId: string,
  timestamp: string
): StyleChange[] {
  const changes: StyleChange[] = [];

  if (oldStyle.exampleUsage !== newStyle.exampleUsage) {
    changes.push({
      id: generateStyleChangeId(), timestamp, templateId,
      dimension: 'content', field: 'exampleUsage',
      oldValue: oldStyle.exampleUsage, newValue: newStyle.exampleUsage, magnitude: 0.5,
    });
  }
  if (oldStyle.dataUsage !== newStyle.dataUsage) {
    changes.push({
      id: generateStyleChangeId(), timestamp, templateId,
      dimension: 'content', field: 'dataUsage',
      oldValue: oldStyle.dataUsage, newValue: newStyle.dataUsage, magnitude: 0.5,
    });
  }
  if (oldStyle.citationStyle !== newStyle.citationStyle) {
    changes.push({
      id: generateStyleChangeId(), timestamp, templateId,
      dimension: 'content', field: 'citationStyle',
      oldValue: oldStyle.citationStyle || '', newValue: newStyle.citationStyle || '',
      magnitude: 0.5,
    });
  }

  const topicDiff = 1 - computeContentSimilarity(oldStyle, newStyle);
  if (topicDiff > 0) {
    changes.push({
      id: generateStyleChangeId(), timestamp, templateId,
      dimension: 'content', field: 'topicPreference',
      oldValue: serializeStyleValue(oldStyle.topicPreference),
      newValue: serializeStyleValue(newStyle.topicPreference),
      magnitude: topicDiff,
    });
  }

  return changes;
}

/**
 * 检测两个文档风格之间的所有变化
 */
export function detectStyleChanges(
  oldStyle: DocumentStyle,
  newStyle: DocumentStyle,
  templateId: string,
  timestamp: string,
  magnitudeThreshold: number
): StyleChange[] {
  const allChanges = [
    ...detectVisualChanges(oldStyle.visual, newStyle.visual, templateId, timestamp),
    ...detectTextualChanges(oldStyle.textual, newStyle.textual, templateId, timestamp),
    ...detectContentChanges(oldStyle.content, newStyle.content, templateId, timestamp),
  ];
  return allChanges.filter((c) => c.magnitude >= magnitudeThreshold);
}

// ============ 风格学习器 ============

/**
 * 风格学习器
 *
 * 维护用户风格画像，支持批量学习、增量学习、风格推荐。
 * 设计为单用户实例（每个用户一个 StyleLearner），便于隔离测试。
 */
export class StyleLearner {
  private config: RequiredStyleLearnerConfig;
  private analyzer: StyleAnalyzer;
  private profile: UserStyleProfile | null = null;
  /** 已学习的样本（templateId -> sample），用于增量更新 */
  private samples: Map<string, StyleLearningSample> = new Map();

  constructor(
    config: StyleLearnerConfig = {},
    analyzer: StyleAnalyzer = new StyleAnalyzer()
  ) {
    this.config = { ...DEFAULT_STYLE_LEARNER_CONFIG, ...config };
    this.analyzer = analyzer;
  }

  /**
   * 从样本批量学习风格
   * 会过滤掉不满意样本，然后聚合得到综合画像
   *
   * @param userId 用户 ID
   * @param samples 学习样本列表
   * @returns 用户风格画像
   */
  learn(userId: string, samples: StyleLearningSample[]): UserStyleProfile {
    // 过滤满意样本
    const satisfiedSamples = samples.filter((s) =>
      isSampleSatisfied(s, this.config.satisfactionThreshold)
    );

    // 缓存样本
    for (const sample of satisfiedSamples) {
      this.samples.set(sample.templateId, sample);
    }

    return this.rebuildProfile(userId);
  }

  /**
   * 增量学习：加入单个新样本并更新画像
   *
   * @param userId 用户 ID
   * @param sample 新样本
   * @returns 更新后的画像；若样本不满意则返回当前画像不变
   */
  learnIncremental(userId: string, sample: StyleLearningSample): UserStyleProfile {
    if (!isSampleSatisfied(sample, this.config.satisfactionThreshold)) {
      // 不满意样本不学习，但保证 profile 存在
      if (!this.profile) {
        this.profile = this.createEmptyProfile(userId);
      }
      return this.profile;
    }

    const previousProfile = this.profile;
    this.samples.set(sample.templateId, sample);
    const newProfile = this.rebuildProfile(userId);

    // 记算演变轨迹
    if (previousProfile) {
      const newStyle: DocumentStyle = {
        documentType: 'word',
        visual: newProfile.preferredStyles.visual,
        textual: newProfile.preferredStyles.textual,
        content: newProfile.preferredStyles.content,
        confidence: newProfile.learningHistory.confidenceLevel,
      };
      const oldStyle: DocumentStyle = {
        documentType: 'word',
        visual: previousProfile.preferredStyles.visual,
        textual: previousProfile.preferredStyles.textual,
        content: previousProfile.preferredStyles.content,
        confidence: previousProfile.learningHistory.confidenceLevel,
      };
      const changes = detectStyleChanges(
        oldStyle,
        newStyle,
        sample.templateId,
        sample.timestamp || new Date().toISOString(),
        this.config.changeMagnitudeThreshold
      );
      newProfile.styleEvolution = [
        ...previousProfile.styleEvolution,
        ...changes,
      ].slice(-this.config.evolutionHistoryLimit);
    }

    this.profile = newProfile;
    return newProfile;
  }

  /**
   * 当模板评分变化时调整权重
   * 等价于更新对应样本的 rating 后重建画像
   */
  updateSampleRating(
    userId: string,
    templateId: string,
    rating: number
  ): UserStyleProfile {
    const sample = this.samples.get(templateId);
    if (sample) {
      sample.rating = rating;
      return this.rebuildProfile(userId);
    }
    if (!this.profile) {
      this.profile = this.createEmptyProfile(userId);
    }
    return this.profile;
  }

  /**
   * 获取当前用户风格画像
   */
  getProfile(): UserStyleProfile | null {
    return this.profile;
  }

  /**
   * 风格推荐：给定场景从已学习样本中推荐最匹配的风格
   *
   * @param request 推荐请求
   * @returns 推荐结果列表（按匹配度降序）
   */
  recommend(request: StyleRecommendationRequest): StyleRecommendation[] {
    if (!this.profile || this.samples.size === 0) return [];

    // 构造目标风格画像（基于当前 preferredStyles + 场景过滤）
    const targetStyle: DocumentStyle = {
      documentType: request.documentType || 'word',
      category: request.category,
      visual: this.profile.preferredStyles.visual,
      textual: this.profile.preferredStyles.textual,
      content: this.profile.preferredStyles.content,
      confidence: 1,
    };

    const topK = request.topK ?? 3;
    const candidates: Array<{ style: DocumentStyle; sample: StyleLearningSample }> = [];

    for (const sample of this.samples.values()) {
      const style = this.getSampleDocumentStyle(sample);
      if (!style) continue;
      // 按请求过滤
      if (request.documentType && style.documentType !== request.documentType) continue;
      if (request.category && style.category !== request.category) continue;
      candidates.push({ style, sample });
    }

    return candidates
      .map(({ style, sample }) => {
        const breakdown = computeStyleSimilarity(targetStyle, style);
        const reasons = this.explainRecommendation(targetStyle, style, breakdown, request);
        // 场景加权：场景/主题命中加分
        let score = breakdown.overall;
        if (request.scenario && sample.scenarios?.includes(request.scenario)) {
          score += 0.1;
        }
        if (request.topic && sample.topics?.includes(request.topic)) {
          score += 0.1;
        }
        return {
          style,
          score: Math.min(1, score),
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 计算给定风格与用户画像的相似度
   */
  computeSimilarityToProfile(style: DocumentStyle): StyleSimilarityBreakdown | null {
    if (!this.profile) return null;
    const profileStyle: DocumentStyle = {
      documentType: style.documentType,
      visual: this.profile.preferredStyles.visual,
      textual: this.profile.preferredStyles.textual,
      content: this.profile.preferredStyles.content,
      confidence: 1,
    };
    return computeStyleSimilarity(profileStyle, style);
  }

  /**
   * 重置学习器
   */
  reset(): void {
    this.profile = null;
    this.samples.clear();
  }

  /**
   * 导出画像（用于持久化）
   */
  exportProfile(): UserStyleProfile | null {
    return this.profile ? { ...this.profile } : null;
  }

  /**
   * 导入画像（用于持久化恢复）
   */
  importProfile(profile: UserStyleProfile): void {
    this.profile = { ...profile };
  }

  /**
   * 导出样本（用于持久化）
   */
  exportSamples(): StyleLearningSample[] {
    return Array.from(this.samples.values());
  }

  /**
   * 导入样本（用于持久化恢复）
   */
  importSamples(samples: StyleLearningSample[]): void {
    this.samples.clear();
    for (const s of samples) {
      this.samples.set(s.templateId, s);
    }
  }

  // ============ 内部方法 ============

  /**
   * 从样本中获取文档风格
   * 优先使用预分析的 documentStyle，否则从 template 现场分析
   */
  private getSampleDocumentStyle(sample: StyleLearningSample): DocumentStyle | null {
    if (sample.documentStyle) return sample.documentStyle;
    if (sample.template) {
      return this.analyzeTemplate(sample.template);
    }
    return null;
  }

  /**
   * 把 DocumentTemplate 转换为 StyleAnalysisInput 并分析
   */
  private analyzeTemplate(template: DocumentTemplate): DocumentStyle {
    const input = {
      documentType: template.type,
      category: template.category,
      textContent: template.notes,
      colors: template.styleFeatures.colorScheme,
      fonts: template.styleFeatures.fontFamily,
    };
    return this.analyzer.analyze(input);
  }

  /**
   * 重建用户画像
   */
  private rebuildProfile(userId: string): UserStyleProfile {
    const samples = Array.from(this.samples.values());
    const now = new Date().toISOString();

    if (samples.length === 0) {
      this.profile = this.createEmptyProfile(userId);
      return this.profile;
    }

    // 计算每个样本权重
    const weights = samples.map((s) => computeSampleWeight(s));

    // 提取每个样本的 DocumentStyle
    const styles: DocumentStyle[] = [];
    const validWeights: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const style = this.getSampleDocumentStyle(samples[i]);
      if (style) {
        styles.push(style);
        validWeights.push(weights[i]);
      }
    }

    if (styles.length === 0) {
      this.profile = this.createEmptyProfile(userId);
      return this.profile;
    }

    const visual = aggregateVisualStyle(
      styles.map((s) => s.visual),
      validWeights
    );
    const textual = aggregateTextualStyle(
      styles.map((s) => s.textual),
      validWeights
    );
    const content = aggregateContentStyle(
      styles.map((s) => s.content),
      validWeights
    );

    // 计算权重表
    const styleWeights = this.computeStyleWeights(samples, weights);

    // 计算置信度
    const confidenceLevel = this.computeConfidence(styles.length);

    // 保留旧演变轨迹（增量学习时由 learnIncremental 追加）
    const styleEvolution = this.profile?.styleEvolution || [];

    const profile: UserStyleProfile = {
      userId,
      preferredStyles: { visual, textual, content },
      styleWeights,
      learningHistory: {
        templatesAnalyzed: styles.length,
        lastUpdated: now,
        confidenceLevel,
      },
      styleEvolution,
      createdAt: this.profile?.createdAt || now,
    };

    this.profile = profile;
    return profile;
  }

  /**
   * 计算风格权重表
   */
  private computeStyleWeights(
    samples: StyleLearningSample[],
    weights: number[]
  ): { byCategory: Record<string, number>; byScenario: Record<string, number>; byTopic: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    const byScenario: Record<string, number> = {};
    const byTopic: Record<string, number> = {};

    samples.forEach((sample, i) => {
      const w = weights[i];
      if (sample.category) {
        byCategory[sample.category] = (byCategory[sample.category] || 0) + w;
      }
      for (const scenario of sample.scenarios || []) {
        byScenario[scenario] = (byScenario[scenario] || 0) + w;
      }
      for (const topic of sample.topics || []) {
        byTopic[topic] = (byTopic[topic] || 0) + w;
      }
    });

    return { byCategory, byScenario, byTopic };
  }

  /**
   * 计算学习置信度
   * 样本数达到 minTemplatesForConfidence 后开始增长
   */
  private computeConfidence(templateCount: number): number {
    if (templateCount < this.config.minTemplatesForConfidence) {
      // 不足阈值时按比例给低置信度
      return (templateCount / this.config.minTemplatesForConfidence) * 0.3;
    }
    const excess = templateCount - this.config.minTemplatesForConfidence;
    return Math.min(
      this.config.maxConfidence,
      0.3 + excess * this.config.confidenceGrowthFactor
    );
  }

  /**
   * 创建空画像
   */
  private createEmptyProfile(userId: string): UserStyleProfile {
    const now = new Date().toISOString();
    return {
      userId,
      preferredStyles: {
        visual: {
          colorScheme: {
            primary: [], secondary: [], accent: [], background: [],
            isDark: false, paletteType: 'custom',
          },
          fontFamily: {
            primaryFont: 'sans-serif', category: 'sans-serif', weightPreference: 'regular',
          },
          fontSize: { tendency: 'regular' },
          layoutStyle: {
            type: 'single-column', whitespaceRatio: 0.4, multiColumn: false, alignment: 'left',
          },
          visualDensity: 'medium',
          imageUsage: 'none',
          chartUsage: 'none',
        },
        textual: {
          toneStyle: 'neutral',
          sentenceLength: 'medium',
          vocabularyLevel: 'intermediate',
          structurePattern: 'custom',
          formalityLevel: 0.5,
          conciseness: 0.5,
        },
        content: {
          topicPreference: [],
          exampleUsage: 'rare',
          dataUsage: 'none',
        },
      },
      styleWeights: { byCategory: {}, byScenario: {}, byTopic: {} },
      learningHistory: {
        templatesAnalyzed: 0,
        lastUpdated: now,
        confidenceLevel: 0,
      },
      styleEvolution: [],
      createdAt: now,
    };
  }

  /**
   * 生成推荐理由（可解释性）
   */
  private explainRecommendation(
    target: DocumentStyle,
    candidate: DocumentStyle,
    breakdown: StyleSimilarityBreakdown,
    request: StyleRecommendationRequest
  ): string[] {
    const reasons: string[] = [];

    // 具体字段对比理由
    if (target.visual.colorScheme.primary.some(
      (c) => candidate.visual.colorScheme.primary.includes(c)
    )) {
      reasons.push('主色调一致');
    }
    if (target.textual.toneStyle === candidate.textual.toneStyle) {
      reasons.push(`语气风格相同（${candidate.textual.toneStyle}）`);
    }
    if (target.textual.structurePattern === candidate.textual.structurePattern) {
      reasons.push(`结构模式相同（${candidate.textual.structurePattern}）`);
    }

    if (breakdown.visual > 0.7) reasons.push('视觉风格高度匹配（配色/字体/布局）');
    else if (breakdown.visual > 0.4) reasons.push('视觉风格基本匹配');

    if (breakdown.textual > 0.7) reasons.push('文本风格高度匹配（语气/句式/结构）');
    else if (breakdown.textual > 0.4) reasons.push('文本风格基本匹配');

    if (breakdown.content > 0.7) reasons.push('内容主题高度匹配');
    else if (breakdown.content > 0.4) reasons.push('内容主题部分匹配');

    if (request.scenario) {
      reasons.push(`场景「${request.scenario}」加权`);
    }
    if (request.topic) {
      reasons.push(`主题「${request.topic}」加权`);
    }

    reasons.push(`综合匹配度 ${(breakdown.overall * 100).toFixed(1)}%`);
    return reasons;
  }
}

/**
 * 创建默认风格学习器
 */
export function createStyleLearner(
  config?: StyleLearnerConfig,
  analyzer?: StyleAnalyzer
): StyleLearner {
  return new StyleLearner(config, analyzer);
}