/**
 * 文章写作器 (ArticleWriter)
 *
 * @description "更懂你的WPS"之文章写作辅助核心逻辑层。
 *   通过"模板 + 偏好 + 知识库"三件套，让 AI 像一个懂用户品位的助理，
 *   自动产出符合用户习惯的文章，并最终调用本机 WPS 完成可编辑的制作。
 *
 *   设计思路（说人话）：
 *     这个文件是"AI 写文章的总指挥"。它把整个流程拆成几个阶段：
 *       1. 分析需求 —— 搞清楚用户要写什么、给谁看、多少字
 *       2. 选模板   —— 从用户满意的模板库里挑一个最合适的基底
 *       3. 应用风格 —— 把学到的用户写作风格画像套上去
 *       4. 检索素材 —— 从知识库里捞出和主题相关的内容
 *       5. 生成大纲 —— 拟出章节结构，用户可以编辑
 *       6. 写正文   —— 一段一段写，每段都套用风格、引用素材
 *       7. 一致性检查 —— 通读一遍，确保风格不漂移
 *       8. 调 WPS   —— 把成品送到 WPS，让用户继续编辑
 *
 *   物理原理类比：
 *     就像一个"懂你品位的老编辑"——他先听你说要写什么，
 *     翻翻你以前满意的稿子找参考，按你的语气习惯写，
 *     写完还自己校对一遍风格，最后递给你一份可改的 Word。
 *
 *   依赖关系：
 *     - WPSBridge：调本机 WPS 创建/编辑 Word 文档
 *     - TemplateManager：从用户满意模板库里挑模板
 *     - StyleLearnerAdapter：拿到用户写作风格画像（W3 提供）
 *     - KnowledgeRetriever：从知识库捞素材（默认接 wiki-store）
 *
 *   降级策略：
 *     - 没有模板库 → 用文章类型默认骨架
 *     - 没有风格画像 → 用中性默认风格
 *     - 没有知识库 → 写"骨架型"内容，不引用素材
 *     - 没有 WPS → 只返回文本，不创建文档
 *
 * @module src/lib/wps/article-writer
 */

import type {
  WPSContentChange,
  WPSDocument,
} from '../../types/wps';
import {
  WPSError,
} from '../../types/wps';
import { getWPSBridge } from './wps-bridge';
import { templateManager } from './template-manager';
import type { DocumentTemplate } from '../../types/template';
import {
  TemplateCategory,
} from '../../types/template';
import type { UserStyleProfile } from '../../types/style';
import {
  ArticleType,
  ARTICLE_TYPE_SKELETON,
  ARTICLE_TYPE_TO_CATEGORY,
  ARTICLE_TYPE_TO_USE_CASES,
  ArticleGenerationStage,
  type ArticleGenerationProgress,
  type ArticleGenerationStageValue,
  type ArticleFeedback,
  type ArticleOutline,
  type ArticleOutlineEdit,
  type ArticleProgressCallback,
  type ArticleSection,
  type ArticleTypeValue,
  type ArticleWritingRequest,
  type ArticleWritingResult,
  type ArticleWriterConfig,
  type KnowledgeRetriever,
  type KnowledgeSnippet,
  type StyleLearnerAdapter,
  type TemplateMatchContext,
} from '../../types/article-writing';
import { DEFAULT_ARTICLE_WRITER_CONFIG } from '../../types/article-writing';

// ============ 工具函数 ============

/**
 * 生成文章 ID
 * 形如 `art_<base36时间戳>_<随机后缀>`
 */
export function generateArticleId(): string {
  return `art_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 估算中文字符数（含中英混排）
 * 中文按字计，英文按词计，简单近似
 */
export function estimateWordCount(text: string): number {
  if (!text) return 0;
  // 中文字符数
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 英文单词数（去掉中文后按空白拆分）
  const nonCjk = text.replace(/[\u4e00-\u9fa5]/g, ' ');
  const enWords = (nonCjk.match(/[A-Za-z][A-Za-z0-9'-]*/g) || []).length;
  return cjk + enWords;
}

/**
 * 按字数把章节分配权重
 * 总字数按权重比例分到各章节
 */
export function distributeWordCount(
  totalWords: number,
  sectionWeights: number[]
): number[] {
  const sum = sectionWeights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const equal = Math.floor(totalWords / sectionWeights.length);
    return sectionWeights.map(() => equal);
  }
  const raw = sectionWeights.map((w) => (w / sum) * totalWords);
  // 取整并修正尾差
  const floored = raw.map((r) => Math.max(50, Math.floor(r)));
  const diff = totalWords - floored.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    // 把尾差加到最大章节
    const maxIdx = floored.indexOf(Math.max(...floored));
    floored[maxIdx] = Math.max(50, floored[maxIdx] + diff);
  }
  return floored;
}

/**
 * 简单关键词提取
 * 用于把主题/目的拆成检索关键词
 */
export function extractKeywords(text: string, max = 6): string[] {
  if (!text) return [];
  // 去停用词（极简版）
  const stopwords = new Set([
    '的', '了', '和', '是', '在', '我', '有', '与', '对', '为',
    'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for',
  ]);
  // 中文按字切（粗粒度），英文按词切
  const tokens: string[] = [];
  const englishWords = text.toLowerCase().match(/[a-z][a-z0-9'-]*/g) || [];
  englishWords.forEach((w) => {
    if (!stopwords.has(w) && w.length > 2) tokens.push(w);
  });
  // 中文：把英文清掉后按非空白字符切
  const cjkText = text.replace(/[A-Za-z0-9]/g, ' ');
  const cjkChunks = cjkText
    .split(/[\s，。、；：！？""''（）()【】《》\-—…·]+/)
    .filter((s) => s.trim().length > 0);
  cjkChunks.forEach((chunk) => {
    if (!stopwords.has(chunk) && chunk.length >= 2) tokens.push(chunk);
  });
  // 去重保序
  const seen = new Set<string>();
  const unique: string[] = [];
  tokens.forEach((t) => {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  });
  return unique.slice(0, max);
}

// ============ 默认风格画像 ============

/**
 * 中性默认风格画像
 * 在用户尚无学习画像时使用，保证流程可跑
 */
export function createDefaultStyleProfile(userId: string): UserStyleProfile {
  const now = new Date().toISOString();
  return {
    userId,
    preferredStyles: {
      visual: {
        colorScheme: {
          primary: ['#1a56db'],
          secondary: ['#64748b'],
          accent: ['#f59e0b'],
          background: ['#ffffff'],
          isDark: false,
          paletteType: 'custom',
        },
        fontFamily: {
          primaryFont: '思源黑体',
          category: 'sans-serif',
          weightPreference: 'regular',
        },
        fontSize: {
          tendency: 'regular',
        },
        layoutStyle: {
          type: 'flow',
          whitespaceRatio: 0.3,
          multiColumn: false,
          alignment: 'justify',
        },
        visualDensity: 'medium',
        imageUsage: 'light',
        chartUsage: 'light',
      },
      textual: {
        toneStyle: 'neutral',
        sentenceLength: 'medium',
        vocabularyLevel: 'intermediate',
        structurePattern: 'pyramid',
        formalityLevel: 0.5,
        conciseness: 0.6,
      },
      content: {
        topicPreference: [],
        exampleUsage: 'occasional',
        dataUsage: 'mixed',
      },
    },
    styleWeights: {
      byCategory: {},
      byScenario: {},
      byTopic: {},
    },
    learningHistory: {
      templatesAnalyzed: 0,
      lastUpdated: now,
      confidenceLevel: 0,
    },
    styleEvolution: [],
    createdAt: now,
  };
}

// ============ 模板选择 ============

/**
 * 把文章需求映射到模板匹配上下文
 */
export function buildTemplateMatchContext(request: ArticleWritingRequest): TemplateMatchContext {
  const category = ARTICLE_TYPE_TO_CATEGORY[request.type];
  const useCases = [...ARTICLE_TYPE_TO_USE_CASES[request.type]];
  // 把目的/读者也作为使用场景线索
  if (request.purpose) useCases.push(request.purpose);
  if (request.audience) useCases.push(request.audience);

  const suitableFor: string[] = [];
  extractKeywords(request.topic, 4).forEach((kw) => suitableFor.push(kw));

  return {
    topic: request.topic,
    type: request.type,
    purpose: request.purpose,
    audience: request.audience,
    category,
    useCases,
    suitableFor,
  };
}

/**
 * 选择最匹配的模板
 *
 * 策略：
 * 1. 用户指定 templateId → 直接用
 * 2. 否则按场景推荐 → 取 top1
 * 3. 都没有 → 返回 null（用默认骨架）
 */
export function selectTemplate(
  request: ArticleWritingRequest,
  context: TemplateMatchContext
): DocumentTemplate | null {
  // 1. 显式指定
  if (request.templateId) {
    const tpl = templateManager.getTemplate(request.templateId);
    if (tpl) return tpl;
  }
  // 2. 按场景推荐
  const recommendations = templateManager.recommendByScenario(
    {
      category: context.category,
      useCases: context.useCases,
      suitableFor: context.suitableFor,
      type: 'word',
    },
    1
  );
  if (recommendations.length > 0) {
    return recommendations[0].template;
  }
  // 3. 退而求其次：取该分类下评分最高的模板
  if (context.category) {
    const candidates = templateManager.getByCategory(context.category);
    const rated = candidates
      .filter((t) => t.type === 'word')
      .sort((a, b) => (b.userRating || 0) - (a.userRating || 0));
    if (rated.length > 0) return rated[0];
  }
  // 4. 都没有
  return null;
}

// ============ 风格应用 ============

/**
 * 解析风格画像
 *
 * 优先用 StyleLearnerAdapter；不可用时回退到默认画像
 */
export function resolveStyleProfile(
  adapter: StyleLearnerAdapter | undefined,
  context: TemplateMatchContext,
  defaultUserId: string
): UserStyleProfile {
  if (adapter) {
    const recommended = adapter.recommendStyle({
      category: context.category,
      scenario: context.useCases[0],
      topic: context.topic,
    });
    if (recommended) return recommended;
    const profile = adapter.getProfile();
    if (profile) return profile;
  }
  return createDefaultStyleProfile(defaultUserId);
}

// ============ 知识检索 ============

/**
 * 默认知识检索器
 * 不依赖外部 store，避免循环依赖；调用方可注入真实实现
 */
export class NullKnowledgeRetriever implements KnowledgeRetriever {
  retrieve(_query: string, _limit?: number): KnowledgeSnippet[] {
    return [];
  }
}

/**
 * 检索知识素材
 */
export function retrieveKnowledge(
  retriever: KnowledgeRetriever,
  request: ArticleWritingRequest,
  maxSnippets: number
): KnowledgeSnippet[] {
  const query = request.knowledgeBaseQuery || request.topic;
  if (!query.trim()) return [];
  try {
    return retriever.retrieve(query, maxSnippets);
  } catch {
    // 检索失败不阻塞流程
    return [];
  }
}

// ============ 大纲生成 ============

/**
 * 根据文章类型得到默认骨架章节
 */
export function buildSkeletonSections(
  type: ArticleTypeValue,
  totalWords: number
): ArticleSection[] {
  const skeleton = ARTICLE_TYPE_SKELETON[type] || ARTICLE_TYPE_SKELETON.custom;
  // 章节权重：首尾章节稍轻，中间章节稍重
  const weights = skeleton.map((_, idx) => {
    if (idx === 0 || idx === skeleton.length - 1) return 1;
    return 2;
  });
  const wordPerSection = distributeWordCount(totalWords, weights);
  return skeleton.map(([level, heading], idx) => ({
    index: idx + 1,
    heading,
    level,
    keyPoints: [],
    estimatedWords: wordPerSection[idx],
  }));
}

/**
 * 根据用户给定的大纲字符串数组构建章节
 */
export function buildSectionsFromOutline(
  outline: string[],
  totalWords: number
): ArticleSection[] {
  if (outline.length === 0) return [];
  const weights = outline.map(() => 1);
  const wordPerSection = distributeWordCount(totalWords, weights);
  return outline.map((heading, idx) => ({
    index: idx + 1,
    heading,
    level: 1,
    keyPoints: [],
    estimatedWords: wordPerSection[idx],
  }));
}

/**
 * 为章节生成关键要点
 *
 * 启发式：从主题/目的/素材里抽取要点线索
 */
export function generateKeyPoints(
  section: ArticleSection,
  request: ArticleWritingRequest,
  snippets: KnowledgeSnippet[],
  maxKeyPoints: number
): string[] {
  const points: string[] = [];

  // 第一章节常用引入语
  if (section.index === 1) {
    points.push(`引入主题：${request.topic}`);
    if (request.purpose) points.push(`写作目的：${request.purpose}`);
    if (request.audience) points.push(`面向读者：${request.audience}`);
  }

  // 末章节常用收束语
  const totalSections = snippets.length; // 仅作占位判断
  if (section.index > 1 && section.index >= totalSections) {
    points.push('总结核心观点');
    points.push('提出展望或行动建议');
  }

  // 从知识素材中提炼要点
  for (const snip of snippets) {
    if (points.length >= maxKeyPoints) break;
    const firstLine = snip.text.split(/[\n。！？]/)[0]?.trim();
    if (firstLine && firstLine.length > 4 && firstLine.length <= 60) {
      points.push(firstLine);
    }
  }

  // 兜底：保证至少 2 个要点
  if (points.length === 0) {
    points.push(`围绕"${section.heading}"展开论述`);
    points.push('结合实例说明');
  }

  return points.slice(0, maxKeyPoints);
}

/**
 * 生成文章大纲
 */
export function generateOutline(
  request: ArticleWritingRequest,
  styleProfile: UserStyleProfile,
  snippets: KnowledgeSnippet[],
  config: ArticleWriterConfig
): ArticleOutline {
  const totalWords = request.wordCount || estimateDefaultWordCount(request.type);
  let sections: ArticleSection[];

  if (request.outline && request.outline.length > 0) {
    sections = buildSectionsFromOutline(request.outline, totalWords);
  } else {
    sections = buildSkeletonSections(request.type, totalWords);
  }

  // 为每个章节填充要点
  sections = sections.map((sec) => ({
    ...sec,
    keyPoints: generateKeyPoints(sec, request, snippets, config.maxKeyPointsPerSection),
  }));

  const estimatedWordCount = sections.reduce((sum, s) => sum + s.estimatedWords, 0);

  return {
    title: request.topic,
    subtitle: request.purpose,
    sections,
    estimatedWordCount,
    styleProfile,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 按文章类型给出默认字数
 */
export function estimateDefaultWordCount(type: ArticleTypeValue): number {
  switch (type) {
    case ArticleType.ACADEMIC:
      return 5000;
    case ArticleType.TECHNICAL:
      return 3000;
    case ArticleType.BUSINESS:
      return 2500;
    case ArticleType.ESSAY:
      return 1200;
    case ArticleType.NEWS:
      return 800;
    case ArticleType.TUTORIAL:
      return 2000;
    case ArticleType.REVIEW:
      return 1500;
    default:
      return 2000;
  }
}

// ============ 章节内容生成 ============

/**
 * 风格画像 → 语气词模板
 */
function toneOpeners(profile: UserStyleProfile): string[] {
  const tone = profile.preferredStyles.textual.toneStyle;
  switch (tone) {
    case 'formal':
      return ['综上所述', '据此可知', '研究表明', '从实践来看'];
    case 'academic':
      return ['研究显示', '已有文献指出', '基于上述分析', '从理论层面看'];
    case 'persuasive':
      return ['值得注意的是', '关键在于', '不容忽视的是', '由此可见'];
    case 'casual':
      return ['说实话', '其实', '你想啊', '说白了'];
    default:
      return ['总的来说', '从实际情况看', '在此基础上', '进一步说'];
  }
}

/**
 * 风格画像 → 句式偏好
 */
function sentenceStrategy(profile: UserStyleProfile): {
  avgSentenceLen: number;
  useTransitions: boolean;
} {
  const len = profile.preferredStyles.textual.sentenceLength;
  const avgSentenceLen = len === 'short' ? 20 : len === 'long' ? 60 : 40;
  // 简洁程度高 → 多用过渡词
  const useTransitions = profile.preferredStyles.textual.conciseness > 0.4;
  return { avgSentenceLen, useTransitions };
}

/**
 * 生成单个章节的正文
 *
 * 策略：
 * - 用要点作为骨架，逐点展开成段
 * - 套用风格画像的语气词与句长偏好
 * - 引用知识素材片段作为佐证
 * - 不足字数时用过渡句补充
 */
export function generateSectionContent(
  section: ArticleSection,
  profile: UserStyleProfile,
  snippets: KnowledgeSnippet[],
  request: ArticleWritingRequest,
  maxWords: number
): { content: string; references: string[] } {
  const openers = toneOpeners(profile);
  const { avgSentenceLen, useTransitions } = sentenceStrategy(profile);
  const paragraphs: string[] = [];
  const references: string[] = [];

  // 章节小标题段
  paragraphs.push(`${'  '.repeat(section.level - 1)}${section.heading}\n`);

  // 引言段（首章节）
  if (section.index === 1) {
    const intro = buildIntroParagraph(request, profile);
    paragraphs.push(intro);
  }

  // 逐要点展开
  section.keyPoints.forEach((point, idx) => {
    const opener = openers[idx % openers.length];
    const sentences: string[] = [];

    // 主句：opener + 要点
    sentences.push(`${opener}，${point}。`);

    // 用知识素材佐证
    const snip = snippets[idx % Math.max(1, snippets.length)];
    if (snip && snip.text) {
      const evidence = snip.text.slice(0, avgSentenceLen * 2).trim();
      if (evidence) {
        sentences.push(`例如：${evidence}。`);
        if (!references.includes(snip.id)) references.push(snip.id);
      }
    }

    // 风格化补充句
    if (sentences.join('').length < avgSentenceLen * 3) {
      sentences.push(buildElaboration(point, profile));
    }

    paragraphs.push(sentences.join(''));
  });

  // 过渡句
  if (useTransitions && section.keyPoints.length > 1) {
    paragraphs.push('基于以上几点，可以进一步梳理出下文所述的思路。');
  }

  // 末章节收束段
  if (isLastSection(section, request)) {
    paragraphs.push(buildConclusionParagraph(request, profile));
  }

  let content = paragraphs.join('\n\n');

  // 字数控制：超出截断，不足补足
  const current = estimateWordCount(content);
  if (current > maxWords) {
    content = truncateToWordCount(content, maxWords);
  } else if (current < Math.floor(maxWords * 0.6)) {
    content = padToWordCount(content, maxWords, profile);
  }

  return { content, references };
}

/**
 * 判断是否为末章节
 */
function isLastSection(section: ArticleSection, request: ArticleWritingRequest): boolean {
  const skeleton = ARTICLE_TYPE_SKELETON[request.type] || ARTICLE_TYPE_SKELETON.custom;
  const total = request.outline?.length || skeleton.length;
  return section.index >= total;
}

/**
 * 构建引言段
 */
function buildIntroParagraph(
  request: ArticleWritingRequest,
  profile: UserStyleProfile
): string {
  const tone = profile.preferredStyles.textual.toneStyle;
  const topicLine = `本文围绕"${request.topic}"展开。`;
  const purposeLine = request.purpose ? `写作目的在于${request.purpose}。` : '';
  const audienceLine = request.audience ? `面向${request.audience}，` : '';
  const toneLine =
    tone === 'academic'
      ? '将结合已有研究与实例进行分析。'
      : tone === 'casual'
      ? '咱们一起聊聊这个话题。'
      : '将结合实际情况进行分析。';
  return [topicLine, audienceLine + purposeLine, toneLine].filter(Boolean).join(' ');
}

/**
 * 构建结论段
 */
function buildConclusionParagraph(
  request: ArticleWritingRequest,
  _profile: UserStyleProfile
): string {
  return [
    `综上，关于"${request.topic}"的讨论告一段落。`,
    '回顾全文，主要观点已逐章呈现，可作进一步实践参考。',
    '后续可结合反馈持续迭代，使内容更贴合实际需求。',
  ].join(' ');
}

/**
 * 构建扩展句
 */
function buildElaboration(point: string, profile: UserStyleProfile): string {
  const formality = profile.preferredStyles.textual.formalityLevel;
  if (formality > 0.7) {
    return `就此而言，${point}的内涵值得深入剖析，对整体论证具有支撑意义。`;
  }
  if (formality < 0.3) {
    return `说白一点，${point}其实就是这么回事，没必要绕弯子。`;
  }
  return `换句话说，${point}在实际中也有不少可对照的例子。`;
}

/**
 * 按字数截断（尽量在句末截断）
 */
export function truncateToWordCount(text: string, maxWords: number): string {
  if (estimateWordCount(text) <= maxWords) return text;
  // 按句拆分，逐句累加
  const sentences = text.split(/(?<=[。！？!?])/);
  const kept: string[] = [];
  let count = 0;
  for (const s of sentences) {
    const w = estimateWordCount(s);
    if (count + w > maxWords) break;
    kept.push(s);
    count += w;
  }
  return kept.join('').trim();
}

/**
 * 按字数补足（添加过渡句）
 */
export function padToWordCount(
  text: string,
  targetWords: number,
  profile: UserStyleProfile
): string {
  let current = estimateWordCount(text);
  if (current >= targetWords) return text;
  const openers = toneOpeners(profile);
  const additions: string[] = [];
  let i = 0;
  while (current < targetWords && i < 20) {
    const opener = openers[i % openers.length];
    const sentence = `${opener}，对此还可从多个角度继续展开，结合具体场景进一步验证。`;
    additions.push(sentence);
    current += estimateWordCount(sentence);
    i++;
  }
  return [text, ...additions].join('\n\n');
}

// ============ 全文拼接 ============

/**
 * 把章节列表拼接为完整文章文本
 */
export function assembleFullText(outline: ArticleOutline): string {
  const parts: string[] = [];
  parts.push(`# ${outline.title}`);
  if (outline.subtitle) parts.push(`> ${outline.subtitle}`);
  parts.push('');
  for (const sec of outline.sections) {
    if (sec.content) {
      parts.push(sec.content);
      parts.push('');
    }
  }
  return parts.join('\n').trim();
}

// ============ 风格一致性检查 ============

/**
 * 风格一致性检查
 *
 * 简单启发式：检查全文语气词分布是否与画像一致
 * 返回需要调整的章节索引（目前仅做检测，不自动改写）
 */
export function checkStyleConsistency(
  outline: ArticleOutline,
  profile: UserStyleProfile
): { consistent: boolean; issues: Array<{ sectionIndex: number; reason: string }> } {
  const issues: Array<{ sectionIndex: number; reason: string }> = [];
  const expectedTone = profile.preferredStyles.textual.toneStyle;

  const toneMarkers: Record<string, string[]> = {
    formal: ['综上', '据此', '因此'],
    casual: ['咱们', '搞定', '其实'],
    academic: ['研究表明', '文献', '据此'],
    persuasive: ['值得注意', '关键在于', '由此可见'],
    neutral: ['总的来说', '从实际'],
  };

  const expected = toneMarkers[expectedTone] || [];
  if (expected.length === 0) {
    return { consistent: true, issues };
  }

  for (const sec of outline.sections) {
    if (!sec.content) continue;
    const hasExpected = expected.some((m) => sec.content!.includes(m));
    if (!hasExpected) {
      issues.push({
        sectionIndex: sec.index,
        reason: `章节未出现期望的语气词（${expected.join('/')}），可能与风格画像漂移`,
      });
    }
  }

  return { consistent: issues.length === 0, issues };
}

// ============ WPS 调用 ============

/**
 * 把章节内容转换为 WPS 段落变更
 */
export function buildDocumentChanges(
  outline: ArticleOutline
): WPSContentChange[] {
  const changes: WPSContentChange[] = [];
  // 标题
  changes.push({
    type: 'text',
    target: 'title',
    data: { text: outline.title },
  });
  if (outline.subtitle) {
    changes.push({
      type: 'text',
      target: 'subtitle',
      data: { text: outline.subtitle },
    });
  }
  // 各章节
  for (const sec of outline.sections) {
    changes.push({
      type: 'text',
      target: `section-${sec.index}`,
      data: {
        heading: sec.heading,
        level: sec.level,
        content: sec.content || '',
      },
    });
  }
  // 文档属性
  changes.push({
    type: 'property',
    target: 'metadata',
    data: {
      title: outline.title,
      subject: outline.subtitle || '',
    },
  });
  return changes;
}

/**
 * 通过 WPS 桥接层创建文章文档
 *
 * 流程：新建 Word → 写入内容 →（可选）另存为指定路径
 */
export async function createArticleInWPS(
  outline: ArticleOutline,
  outputPath?: string
): Promise<{ documentId: string; path?: string }> {
  const bridge = getWPSBridge();
  const doc: WPSDocument = await bridge.createDocument('word', `${outline.title}.docx`);
  const changes = buildDocumentChanges(outline);
  if (changes.length > 0) {
    await bridge.editContent(doc.id, changes);
  }
  if (outputPath) {
    await bridge.saveAs(doc.id, outputPath);
    return { documentId: doc.id, path: outputPath };
  }
  return { documentId: doc.id };
}

// ============ 主流程 ============

/**
 * 文章写作器
 *
 * 维护生成流程的上下文与可注入的适配器。
 * 单例 `articleWriter` 在文件末尾导出。
 */
export class ArticleWriter {
  private readonly config: ArticleWriterConfig;
  private styleAdapter: StyleLearnerAdapter | undefined;
  private knowledgeRetriever: KnowledgeRetriever;

  constructor(
    config: Partial<ArticleWriterConfig> = {},
    adapters: {
      styleLearner?: StyleLearnerAdapter;
      knowledgeRetriever?: KnowledgeRetriever;
    } = {}
  ) {
    this.config = { ...DEFAULT_ARTICLE_WRITER_CONFIG, ...config };
    this.styleAdapter = adapters.styleLearner;
    this.knowledgeRetriever = adapters.knowledgeRetriever || new NullKnowledgeRetriever();
  }

  /**
   * 注入风格学习器适配器
   */
  setStyleLearner(adapter: StyleLearnerAdapter | undefined): void {
    this.styleAdapter = adapter;
  }

  /**
   * 注入知识检索器
   */
  setKnowledgeRetriever(retriever: KnowledgeRetriever): void {
    this.knowledgeRetriever = retriever;
  }

  /**
   * 生成文章
   *
   * 完整流程：分析 → 选模板 → 应用风格 → 检索素材 → 生成大纲 →
   *           逐章节生成 → 一致性检查 → 调 WPS → 返回结果
   */
  async write(
    request: ArticleWritingRequest,
    onProgress?: ArticleProgressCallback
  ): Promise<ArticleWritingResult> {
    const startedAt = Date.now();
    const userId = this.config.defaultUserId || 'default_user';

    try {
      // 1. 分析需求
      this.emit(onProgress, ArticleGenerationStage.ANALYZING, 5, '正在分析写作需求');
      const context = buildTemplateMatchContext(request);

      // 2. 选择模板
      this.emit(onProgress, ArticleGenerationStage.SELECTING_TEMPLATE, 15, '正在选择模板');
      const template = selectTemplate(request, context);
      if (template) {
        // 记录模板被使用
        templateManager.incrementUsage(template.id);
      }

      // 3. 应用风格
      this.emit(onProgress, ArticleGenerationStage.APPLYING_STYLE, 25, '正在应用写作风格');
      const styleProfile = resolveStyleProfile(this.styleAdapter, context, userId);

      // 4. 检索知识
      this.emit(onProgress, ArticleGenerationStage.RETRIEVING_KNOWLEDGE, 35, '正在检索知识库素材');
      const snippets = retrieveKnowledge(
        this.knowledgeRetriever,
        request,
        this.config.maxKnowledgeSnippets
      );

      // 5. 生成大纲
      this.emit(onProgress, ArticleGenerationStage.GENERATING_OUTLINE, 45, '正在生成文章大纲');
      let outline = generateOutline(request, styleProfile, snippets, this.config);

      // 6. 逐章节生成内容
      this.emit(onProgress, ArticleGenerationStage.GENERATING_CONTENT, 50, '正在逐章节生成正文');
      outline = this.generateAllSections(outline, request, snippets);

      // 7. 一致性检查
      this.emit(onProgress, ArticleGenerationStage.CONSISTENCY_CHECK, 80, '正在进行风格一致性检查');
      checkStyleConsistency(outline, styleProfile);

      // 8. 拼接全文
      const fullText = assembleFullText(outline);
      const wordCount = estimateWordCount(fullText);

      // 9. 调用 WPS
      let wpsDocumentId: string | undefined;
      let generatedPath: string | undefined;
      const shouldOpenWPS = request.openInWPS ?? this.config.autoOpenInWPS;
      if (shouldOpenWPS) {
        this.emit(onProgress, ArticleGenerationStage.CREATING_DOCUMENT, 90, '正在调用 WPS 创建文档');
        try {
          const wpsResult = await createArticleInWPS(outline, request.outputPath);
          wpsDocumentId = wpsResult.documentId;
          generatedPath = wpsResult.path;
        } catch (err) {
          // WPS 调用失败不阻塞结果返回，文本仍然可用
          this.emit(
            onProgress,
            ArticleGenerationStage.CREATING_DOCUMENT,
            90,
            'WPS 调用失败，仅返回文本',
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // 10. 完成
      this.emit(onProgress, ArticleGenerationStage.COMPLETED, 100, '文章生成完成');

      return {
        outline,
        fullText,
        generatedPath,
        wpsDocumentId,
        appliedStyle: styleProfile,
        knowledgeUsed: snippets.map((s) => s.id),
        wordCount,
        appliedTemplate: template,
        durationMs: Date.now() - startedAt,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit(onProgress, ArticleGenerationStage.FAILED, 100, '生成失败', message);
      throw err instanceof WPSError ? err : new WPSError('UNKNOWN', message);
    }
  }

  /**
   * 为所有章节生成正文
   */
  private generateAllSections(
    outline: ArticleOutline,
    request: ArticleWritingRequest,
    snippets: KnowledgeSnippet[]
  ): ArticleOutline {
    const sections = outline.sections.map((sec) => {
      const { content, references } = generateSectionContent(
        sec,
        outline.styleProfile,
        snippets,
        request,
        this.config.maxWordsPerSection
      );
      return { ...sec, content, references };
    });
    return { ...outline, sections };
  }

  /**
   * 基于反馈重新生成
   *
   * 根据反馈类型调整请求并重新生成：
   * - satisfied → 不重新生成，仅记录评分
   * - change_template → 替换模板 ID 后重新生成
   * - adjust_style → 注入 styleHint 到 additionalRequirements
   * - adjust_structure → 用编辑后的 outline 重新生成
   * - adjust_content → 局部章节重新生成
   * - regenerate → 完全重新生成
   */
  async rewrite(
    previousRequest: ArticleWritingRequest,
    previousResult: ArticleWritingResult,
    feedback: ArticleFeedback,
    outlineEdit?: ArticleOutlineEdit,
    onProgress?: ArticleProgressCallback
  ): Promise<ArticleWritingResult> {
    // 满意 → 直接返回上次结果
    if (feedback.type === 'satisfied') {
      return previousResult;
    }

    // 更换模板
    if (feedback.type === 'change_template' && feedback.newTemplateId) {
      return this.write(
        { ...previousRequest, templateId: feedback.newTemplateId },
        onProgress
      );
    }

    // 调整风格
    if (feedback.type === 'adjust_style' && feedback.styleHint) {
      const additional = [
        previousRequest.additionalRequirements || '',
        `风格调整：${feedback.styleHint}`,
      ]
        .filter(Boolean)
        .join('；');
      return this.write(
        { ...previousRequest, additionalRequirements: additional },
        onProgress
      );
    }

    // 调整结构：用编辑后的大纲重新生成
    if (feedback.type === 'adjust_structure' && outlineEdit) {
      const newOutlineArr = outlineEdit.sections.map((s) => s.heading);
      const newRequest: ArticleWritingRequest = {
        ...previousRequest,
        outline: newOutlineArr,
      };
      return this.write(newRequest, onProgress);
    }

    // 调整内容：仅重新生成指定章节
    if (feedback.type === 'adjust_content' && feedback.sectionIndices && feedback.sectionIndices.length > 0) {
      return this.regenerateSections(
        previousRequest,
        previousResult,
        feedback.sectionIndices,
        feedback.comment,
        onProgress
      );
    }

    // 完全重新生成
    return this.write(previousRequest, onProgress);
  }

  /**
   * 仅重新生成指定章节
   */
  private async regenerateSections(
    request: ArticleWritingRequest,
    previousResult: ArticleWritingResult,
    sectionIndices: number[],
    comment?: string,
    onProgress?: ArticleProgressCallback
  ): Promise<ArticleWritingResult> {
    this.emit(onProgress, ArticleGenerationStage.GENERATING_CONTENT, 50, '正在重新生成指定章节');

    const snippets = retrieveKnowledge(
      this.knowledgeRetriever,
      request,
      this.config.maxKnowledgeSnippets
    );

    const outline = { ...previousResult.outline };
    const sections = outline.sections.map((sec) => {
      if (!sectionIndices.includes(sec.index)) return sec;
      // 把反馈意见注入要点
      const adjustedKeyPoints = comment
        ? [...sec.keyPoints, `调整意见：${comment}`]
        : sec.keyPoints;
      const adjustedSec = { ...sec, keyPoints: adjustedKeyPoints };
      const { content, references } = generateSectionContent(
        adjustedSec,
        outline.styleProfile,
        snippets,
        request,
        this.config.maxWordsPerSection
      );
      return { ...adjustedSec, content, references };
    });

    const newOutline = { ...outline, sections };
    const fullText = assembleFullText(newOutline);
    const wordCount = estimateWordCount(fullText);

    // 若有 WPS 文档，更新内容
    let wpsDocumentId = previousResult.wpsDocumentId;
    let generatedPath = previousResult.generatedPath;
    if (wpsDocumentId) {
      try {
        const bridge = getWPSBridge();
        const changes = buildDocumentChanges(newOutline);
        await bridge.editContent(wpsDocumentId, changes);
      } catch {
        // WPS 更新失败不阻塞
      }
    }

    this.emit(onProgress, ArticleGenerationStage.COMPLETED, 100, '章节重新生成完成');

    return {
      outline: newOutline,
      fullText,
      generatedPath,
      wpsDocumentId,
      appliedStyle: previousResult.appliedStyle,
      knowledgeUsed: previousResult.knowledgeUsed,
      wordCount,
      appliedTemplate: previousResult.appliedTemplate,
      durationMs: 0,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 仅生成大纲（不写正文、不调 WPS）
   * 用于 UI 让用户先看大纲、再决定是否生成
   */
  previewOutline(request: ArticleWritingRequest): ArticleOutline {
    const userId = this.config.defaultUserId || 'default_user';
    const context = buildTemplateMatchContext(request);
    const styleProfile = resolveStyleProfile(this.styleAdapter, context, userId);
    const snippets = retrieveKnowledge(
      this.knowledgeRetriever,
      request,
      this.config.maxKnowledgeSnippets
    );
    return generateOutline(request, styleProfile, snippets, this.config);
  }

  /**
   * 用编辑后的大纲直接生成正文并调 WPS
   * 用于用户在大纲编辑后一键确认生成
   */
  async writeWithOutline(
    request: ArticleWritingRequest,
    outlineEdit: ArticleOutlineEdit,
    onProgress?: ArticleProgressCallback
  ): Promise<ArticleWritingResult> {
    const startedAt = Date.now();
    const userId = this.config.defaultUserId || 'default_user';
    const context = buildTemplateMatchContext(request);
    const template = selectTemplate(request, context);
    const styleProfile = resolveStyleProfile(this.styleAdapter, context, userId);
    const snippets = retrieveKnowledge(
      this.knowledgeRetriever,
      request,
      this.config.maxKnowledgeSnippets
    );

    this.emit(onProgress, ArticleGenerationStage.GENERATING_CONTENT, 50, '正在按编辑后大纲生成正文');

    const sections = outlineEdit.sections.map((sec) => {
      const { content, references } = generateSectionContent(
        sec,
        styleProfile,
        snippets,
        request,
        this.config.maxWordsPerSection
      );
      return { ...sec, content, references };
    });

    const outline: ArticleOutline = {
      title: outlineEdit.title || request.topic,
      subtitle: outlineEdit.subtitle,
      sections,
      estimatedWordCount: sections.reduce((sum, s) => sum + s.estimatedWords, 0),
      styleProfile,
      createdAt: new Date().toISOString(),
    };

    const fullText = assembleFullText(outline);
    const wordCount = estimateWordCount(fullText);

    let wpsDocumentId: string | undefined;
    let generatedPath: string | undefined;
    const shouldOpenWPS = request.openInWPS ?? this.config.autoOpenInWPS;
    if (shouldOpenWPS) {
      this.emit(onProgress, ArticleGenerationStage.CREATING_DOCUMENT, 90, '正在调用 WPS 创建文档');
      try {
        const wpsResult = await createArticleInWPS(outline, request.outputPath);
        wpsDocumentId = wpsResult.documentId;
        generatedPath = wpsResult.path;
      } catch {
        // 忽略 WPS 错误
      }
    }

    this.emit(onProgress, ArticleGenerationStage.COMPLETED, 100, '文章生成完成');

    return {
      outline,
      fullText,
      generatedPath,
      wpsDocumentId,
      appliedStyle: styleProfile,
      knowledgeUsed: snippets.map((s) => s.id),
      wordCount,
      appliedTemplate: template,
      durationMs: Date.now() - startedAt,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 发送进度事件
   */
  private emit(
    onProgress: ArticleProgressCallback | undefined,
    stage: ArticleGenerationStageValue,
    percent: number,
    message: string,
    error?: string
  ): void {
    if (!onProgress) return;
    const progress: ArticleGenerationProgress = {
      stage,
      percent,
      message,
    };
    if (error) progress.error = error;
    onProgress(progress);
  }

  /**
   * 获取配置（只读视图）
   */
  getConfig(): Readonly<ArticleWriterConfig> {
    return { ...this.config };
  }
}

// ============ 单例 ============

/**
 * 文章写作器单例
 *
 * 推荐用法：
 * ```ts
 * import { articleWriter } from '@/lib/wps/article-writer';
 * const result = await articleWriter.write(request, onProgress);
 * ```
 */
export const articleWriter = new ArticleWriter();

/**
 * 重置单例（主要用于测试）
 */
export function resetArticleWriter(
  config?: Partial<ArticleWriterConfig>,
  adapters?: {
    styleLearner?: StyleLearnerAdapter;
    knowledgeRetriever?: KnowledgeRetriever;
  }
): ArticleWriter {
  return new ArticleWriter(config, adapters);
}

/**
 * 从 wiki-store 构造知识检索器的工厂函数
 *
 * 为避免循环依赖，本文件不直接 import wiki-store；
 * 调用方在初始化时注入即可：
 * ```ts
 * import { useWikiStore } from '@/stores/wiki-store';
 * articleWriter.setKnowledgeRetriever({
 *   retrieve: (q, limit) => useWikiStore.getState().searchEntries(q).slice(0, limit).map(...)
 * });
 * ```
 */
export function createKnowledgeRetrieverFromEntries(
  searchFn: (query: string) => Array<{
    id: string;
    name: string;
    text?: string;
    title?: string;
  }>
): KnowledgeRetriever {
  return {
    retrieve(query: string, limit?: number): KnowledgeSnippet[] {
      const entries = searchFn(query);
      const max = limit || entries.length;
      return entries.slice(0, max).map((e, idx) => ({
        id: e.id,
        source: e.name,
        title: e.title,
        text: e.text || '',
        score: 1 - idx * 0.05,
        matchedKeywords: query.split(/\s+/).filter(Boolean),
      }));
    },
  };
}

// 防止未使用警告（TemplateCategory 在 selectTemplate 间接使用）
void TemplateCategory;