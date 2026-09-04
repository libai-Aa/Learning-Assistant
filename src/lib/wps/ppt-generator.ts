/**
 * PPT 生成器 (PPTGenerator)
 *
 * @description "更懂你的WPS"之 PPT 制作辅助核心引擎。
 *   把"用户需求 → 满意 PPT"的全流程封装为一条可观测、可迭代的流水线：
 *
 *   1. 需求分析     —— 把自然语言需求结构化为生成上下文
 *   2. 模板选择     —— 委托 TemplateManager 按场景推荐最匹配模板
 *   3. 风格应用     —— 委托 StyleLearnerAdapter 取回用户风格画像
 *   4. 知识检索     —— 委托 KnowledgeRetriever 拉取相关素材
 *   5. 大纲生成     —— 按用途骨架 + 素材填充总分总结构
 *   6. 内容生成     —— 为每页生成要点、正文、演讲备注
 *   7. WPS 调用     —— 通过 WPSBridge 创建 PPT 并写入幻灯片
 *   8. 迭代优化     —— 基于用户反馈重新生成或局部调整
 *
 *   设计思路（说人话）：
 *   这个生成器像一个"懂你的助理"。你告诉它"我要做一份季度汇报 PPT"，
 *   它会先翻你以前满意的模板（templateManager），看你的品位（styleLearner），
 *   去知识库找相关数据（knowledgeRetriever），然后按"封面-章节-内容-图表-结论"
 *   的骨架搭出大纲，最后交给本机 WPS 真正做出来。如果你不满意，告诉它哪里要改，
 *   它会按反馈再来一遍，并把你的评分喂回学习器，逐步"更懂你"。
 *
 *   依赖解耦：
 *   - WPSBridge、TemplateManager 为必选依赖
 *   - StyleLearnerAdapter、KnowledgeRetriever 为可选依赖（缺失时降级）
 *   所有依赖通过构造函数注入，便于单测与跨环境复用。
 *
 * @module src/lib/wps/ppt-generator
 */

import type { WPSBridge, WPSDocument } from '../../types/wps';
import { WPSError } from '../../types/wps';
import { invoke } from '@tauri-apps/api/core';
// pptxgenjs 改为动态导入，避免其内部 require('fs') 在浏览器端加载时报错
import { chat } from '../api/llm-client';
import type { DocumentTemplate, TemplateRecommendation } from '../../types/template';
import type {
  ColorScheme,
  FontPreference,
  UserStyleProfile,
} from '../../types/style';
import type {
  KnowledgeRetriever,
  KnowledgeSnippet,
  PPTFeedback,
  PPTGeneratorConfig,
  PPTGenerationProgress,
  PPTGenerationRequest,
  PPTGenerationResult,
  PPTOutline,
  PPTOutlineEdit,
  PPTProgressCallback,
  PPTSlideOutline,
  PPTSlideType,
  PPTTheme,
  PPTPurposeValue,
  PPTEvaluation,
  StyleLearnerAdapter,
  TemplateMatchContext,
} from '../../types/ppt-generation';
import {
  DEFAULT_PPT_GENERATOR_CONFIG,
  PPTGenerationStage,
  PPT_PURPOSE_SKELETON,
  PPT_PURPOSE_TO_CATEGORY,
  PPT_PURPOSE_TO_USE_CASES,
  PPTPurpose,
  PPTPurposeNames,
} from '../../types/ppt-generation';
import { templateManager, type TemplateManager } from './template-manager';
import { getWPSBridge } from './wps-bridge';
import { pptDesignLearner } from './ppt-design-learner';

// ============ 默认风格常量 ============

/**
 * 默认配色方案（用于无模板/无风格画像时）
 * 蓝灰商务风，覆盖大多数场景的安全选择
 */
/**
 * 年轻人审美配色方案（基于小红书/设计社区趋势）
 * 莫兰迪低饱和 + 渐变 + 卡片风
 */
const DEFAULT_COLOR_SCHEME: ColorScheme = {
  primary: ['#6c5ce7', '#a29bfe'],
  secondary: ['#636e72', '#b2bec3'],
  accent: ['#fd79a8', '#e17055'],
  background: ['#f8f9fa', '#ffffff'],
  isDark: false,
  paletteType: 'custom',
};

/**
 * 年轻人审美配色方案B（暖色系，适合人文社科类PPT）
 */
const WARM_COLOR_SCHEME: ColorScheme = {
  primary: ['#e17055', '#fab1a0'],
  secondary: ['#636e72', '#b2bec3'],
  accent: ['#6c5ce7', '#a29bfe'],
  background: ['#faf8f5', '#ffffff'],
  isDark: false,
  paletteType: 'custom',
};

/**
 * 年轻人审美配色方案C（冷色系，适合理工科类PPT）
 */
const COOL_COLOR_SCHEME: ColorScheme = {
  primary: ['#00b894', '#55efc4'],
  secondary: ['#636e72', '#b2bec3'],
  accent: ['#0984e3', '#74b9ff'],
  background: ['#f5f6fa', '#ffffff'],
  isDark: false,
  paletteType: 'custom',
};

/**
 * 默认字体偏好（年轻人审美：现代无衬线字体）
 */
const DEFAULT_FONT_PREFERENCE: FontPreference = {
  primaryFont: '思源黑体',
  secondaryFont: 'Helvetica Neue',
  category: 'sans-serif',
  weightPreference: 'light',
};

// ============ 工具函数 ============

/**

 * 把用途映射到模板匹配上下文
 */
function buildTemplateMatchContext(
  request: PPTGenerationRequest
): TemplateMatchContext {
  const purpose = request.purpose;
  return {
    topic: request.topic,
    purpose,
    audience: request.audience,
    category: PPT_PURPOSE_TO_CATEGORY[purpose],
    useCases: PPT_PURPOSE_TO_USE_CASES[purpose],
    suitableFor: inferSuitableForFromTopic(request.topic),
  };
}

/**
 * 从主题文本启发式推断适合主题
 */
function inferSuitableForFromTopic(topic: string): string[] {
  const result: string[] = [];
  const lower = topic.toLowerCase();
  const rules: Array<{ keywords: string[]; topic: string }> = [
    { keywords: ['金融', '财务', '营收', '利润', '预算'], topic: '财务金融' },
    { keywords: ['技术', '架构', '系统', '工程', '研发'], topic: '技术工程' },
    { keywords: ['市场', '营销', '品牌', '增长', '转化'], topic: '市场营销' },
    { keywords: ['科研', '实验', '假设', '论证', '论文'], topic: '科研学术' },
    { keywords: ['运营', '流程', '效率', '优化', '指标'], topic: '运营管理' },
    { keywords: ['设计', '视觉', '体验', '原型', 'ui'], topic: '设计创意' },
    { keywords: ['产品', '功能', '迭代', 'roadmap'], topic: '产品规划' },
    { keywords: ['团队', '组织', '人才', '文化'], topic: '团队管理' },
  ];
  for (const { keywords, topic: t } of rules) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      result.push(t);
    }
  }
  return result;
}

/**
 * 按用途骨架生成幻灯片类型序列
 * 若用户指定了 slideCount，则按比例扩展/裁剪骨架
 */
function planSlideTypes(purpose: PPTPurposeValue, slideCount?: number): PPTSlideType[] {
  const skeleton = PPT_PURPOSE_SKELETON[purpose] || PPT_PURPOSE_SKELETON.custom;
  if (!slideCount || slideCount <= 0) return skeleton;
  if (slideCount === skeleton.length) return skeleton;

  if (slideCount < skeleton.length) {
    // 裁剪：保留首尾，中间按需删减
    const head = skeleton[0];
    const tail = skeleton[skeleton.length - 1];
    const middle = skeleton.slice(1, -1);
    const kept = middle.slice(0, Math.max(0, slideCount - 2));
    return [head, ...kept, tail];
  }

  // 扩展：在中间插入 content 页
  const expanded = [...skeleton];
  const extra = slideCount - skeleton.length;
  const insertPos = Math.floor(expanded.length / 2);
  for (let i = 0; i < extra; i++) {
    expanded.splice(insertPos + i, 0, 'content');
  }
  return expanded;
}

/**
 * 从知识素材中提取关键要点
 * 简单按句子切分，取前 N 句作为要点
 */
function extractKeyPointsFromSnippets(
  snippets: KnowledgeSnippet[],
  maxPoints: number
): string[] {
  const points: string[] = [];
  for (const s of snippets) {
    if (points.length >= maxPoints) break;
    const sentences = s.text
      .split(/[。！？!?\n]+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 4 && x.length < 80);
    for (const sent of sentences) {
      if (points.length >= maxPoints) break;
      if (!points.includes(sent)) points.push(sent);
    }
  }
  return points;
}

/**
 * 从知识素材中拼接待用正文
 */
function composeContentFromSnippets(
  snippets: KnowledgeSnippet[],
  maxChars: number
): string {
  const parts: string[] = [];
  let total = 0;
  for (const s of snippets) {
    if (total >= maxChars) break;
    const chunk = s.text.slice(0, Math.min(s.text.length, maxChars - total));
    parts.push(chunk);
    total += chunk.length;
  }
  return parts.join('\n\n');
}

/**
 * 按幻灯片类型生成默认标题
 */
function defaultSlideTitle(type: PPTSlideType, index: number, topic: string): string {
  switch (type) {
    case 'cover':
      return topic;
    case 'section':
      return `第 ${Math.ceil(index / 2)} 部分`;
    case 'conclusion':
      return '总结与展望';
    case 'chart':
      return '数据与指标';
    case 'image':
      return '图示说明';
    case 'content':
    default:
      return `内容页 ${index}`;
  }
}

/**
 * 生成演讲备注
 * 根据幻灯片类型与要点给出"说人话"的口语化提示
 */
function generateSpeakerNotes(slide: PPTSlideOutline, purpose: PPTPurposeValue): string {
  if (slide.type === 'cover') {
    return `开场：欢迎大家。今天分享的主题是《${slide.title}》。`;
  }
  if (slide.type === 'section') {
    return `过渡：接下来进入${slide.title}部分。`;
  }
  if (slide.type === 'conclusion') {
    return '收尾：以上是本次分享的全部内容，欢迎大家提问与交流。';
  }
  const points = slide.keyPoints.slice(0, 3).join('、');
  const tone = purpose === PPTPurpose.ACADEMIC ? '请重点关注' : '简单跟大家聊聊';
  return `${tone}：${points}。详细数据见页面内容。`;
}

// ============ PPT 生成器 ============

/**
 * PPT 生成器
 *
 * 通过 `getPPTGenerator()` 获取默认单例，或 new PPTGenerator(...) 自定义依赖。
 */
export class PPTGenerator {
  private readonly config: PPTGeneratorConfig;
  private readonly bridge: WPSBridge;
  private readonly templates: TemplateManager;
  private readonly styleLearner?: StyleLearnerAdapter;
  private readonly knowledgeRetriever?: KnowledgeRetriever;
  /** 反思评估迭代标志，防止低分自动改进时无限递归 */
  private _isIterating = false;

  constructor(options: {
    bridge?: WPSBridge;
    templateManager?: TemplateManager;
    styleLearner?: StyleLearnerAdapter;
    knowledgeRetriever?: KnowledgeRetriever;
    config?: Partial<PPTGeneratorConfig>;
  } = {}) {
    this.config = { ...DEFAULT_PPT_GENERATOR_CONFIG, ...options.config };
    this.bridge = options.bridge || getWPSBridge();
    this.templates = options.templateManager || templateManager;
    this.styleLearner = options.styleLearner;
    this.knowledgeRetriever = options.knowledgeRetriever;
  }

  // ============ 主流程 ============

  /**
   * 生成 PPT 主入口
   *
   * @param request 用户需求
   * @param onProgress 进度回调（可选）
   * @returns 生成结果
   */
  async generate(
    request: PPTGenerationRequest,
    onProgress?: PPTProgressCallback
  ): Promise<PPTGenerationResult> {
    const startedAt = Date.now();
    const knowledgeUsed: string[] = [];
    let appliedTemplate: DocumentTemplate | null = null;
    let appliedStyle: UserStyleProfile | null = null;

    try {
      // 1. 需求分析
      this.emit(onProgress, PPTGenerationStage.ANALYZING, 5, '正在理解您的需求…');
      const context = buildTemplateMatchContext(request);

      // 2. 模板选择
      this.emit(onProgress, PPTGenerationStage.SELECTING_TEMPLATE, 15, '正在挑选最合适的模板…');
      const template = this.selectTemplate(request, context);
      appliedTemplate = template;
      if (template) {
        this.templates.incrementUsage(template.id);
      }

      // 3. 风格应用
      this.emit(onProgress, PPTGenerationStage.APPLYING_STYLE, 30, '正在应用您的风格偏好…');
      appliedStyle = this.resolveStyle(request, context);

      // 4. 知识检索
      this.emit(onProgress, PPTGenerationStage.RETRIEVING_KNOWLEDGE, 45, '正在从知识库检索素材…');
      const snippets = this.retrieveKnowledge(request);
      snippets.forEach((s) => {
        if (!knowledgeUsed.includes(s.id)) knowledgeUsed.push(s.id);
      });

      // 5. 大纲生成（优先用 LLM 生成高质量内容，失败则降级到骨架方式）
      this.emit(onProgress, PPTGenerationStage.GENERATING_OUTLINE, 60, 'AI 正在生成 PPT 内容…');
      const theme = this.buildTheme(template, appliedStyle);
      let outline: PPTOutline;
      try {
        outline = await this.generateOutlineWithLLM(request, theme, snippets);
      } catch (llmErr) {
        // LLM 失败，降级到骨架 + 素材填充
        console.warn('[PPTGenerator] LLM 生成失败，降级到骨架方式:', llmErr);
        this.emit(onProgress, PPTGenerationStage.GENERATING_OUTLINE, 60, '正在搭建大纲骨架…');
        outline = this.generateOutline(request, theme);
        // 6. 内容生成（降级方式）
        this.emit(onProgress, PPTGenerationStage.GENERATING_CONTENT, 80, '正在充实每页内容…');
        this.enrichOutline(outline, request, snippets);
      }

      // 7. WPS 调用
      let wpsDocumentId: string | undefined;
      let generatedPath: string | undefined;
      const shouldOpen = request.openInWPS ?? this.config.autoOpenInWPS;
      if (shouldOpen) {
        this.emit(onProgress, PPTGenerationStage.CREATING_PPT, 90, '正在调用 WPS 制作 PPT…');
        const doc = await this.createPPTInWPS(outline, request.outputPath);
        wpsDocumentId = doc.id;
        generatedPath = doc.path || request.outputPath;
      }

      const result: PPTGenerationResult = {
        outline,
        generatedPath,
        wpsDocumentId,
        appliedStyle,
        knowledgeUsed,
        appliedTemplate,
        durationMs: Date.now() - startedAt,
        createdAt: new Date().toISOString(),
      };

      this.emit(onProgress, PPTGenerationStage.COMPLETED, 100, 'PPT 已生成完成');

      // ============ PPTAgent 反思评估 ============
      // 生成后自评估：从 Content/Design/Coherence 三维度打分，
      // 低分（<80）自动迭代改进一次，评估结果追加保存到学习笔记。
      try {
        const evaluation = await this.evaluatePPT(outline, request);
        result.evaluation = evaluation;

        // 评估结果追加保存到学习笔记（异步，不阻塞主流程）
        if (evaluation.total > 0) {
          this.saveEvaluationToNotes(request, evaluation).catch(() => {});
        }

        // 低分自动迭代改进一次（防止无限递归）
        if (evaluation.total > 0 && evaluation.total < 80 && !this._isIterating) {
          this._isIterating = true;
          try {
            this.emit(
              onProgress,
              PPTGenerationStage.GENERATING_OUTLINE,
              95,
              '评估分数 ' + evaluation.total + ' < 80，正在自动迭代改进…'
            );
            // 把改进建议作为额外要求注入新请求
            const improvedRequest: PPTGenerationRequest = {
              ...request,
              additionalRequirements:
                (request.additionalRequirements || '') +
                '\n[PPTAgent改进建议] ' +
                evaluation.suggestions.join('；'),
            };
            const improvedResult = await this.generate(improvedRequest, onProgress);
            // 保留首次评估记录到改进结果（若改进结果无评估则用首次的）
            if (!improvedResult.evaluation) {
              improvedResult.evaluation = evaluation;
            }
            return improvedResult;
          } finally {
            this._isIterating = false;
          }
        }
      } catch (e) {
        console.warn('[PPTGenerator] 反思评估步骤失败:', e);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit(onProgress, PPTGenerationStage.FAILED, 100, `生成失败：${message}`, message);
      throw err;
    }
  }

  // ============ 子步骤 ============

  /**
   * 模板选择
   * 优先级：用户指定 > 场景推荐 > null
   */
  private selectTemplate(
    request: PPTGenerationRequest,
    context: TemplateMatchContext
  ): DocumentTemplate | null {
    // 用户指定
    if (request.templateId) {
      const t = this.templates.getTemplate(request.templateId);
      if (t) return t;
    }
    // 场景推荐
    const recs: TemplateRecommendation[] = this.templates.recommendByScenario(
      {
        category: context.category,
        useCases: context.useCases,
        suitableFor: context.suitableFor,
        type: 'ppt',
      },
      5
    );
    if (recs.length === 0) return null;
    // 取分数最高且评分/使用次数加权后最优的
    return recs[0].template;
  }

  /**
   * 风格画像解析
   */
  private resolveStyle(
    request: PPTGenerationRequest,
    context: TemplateMatchContext
  ): UserStyleProfile | null {
    if (!this.styleLearner) return null;
    try {
      const recommended = this.styleLearner.recommendStyle({
        category: context.category,
        scenario: context.useCases[0],
        topic: request.topic,
      });
      if (recommended) return recommended;
      return this.styleLearner.getProfile();
    } catch {
      return null;
    }
  }

  /**
   * 知识库检索
   */
  private retrieveKnowledge(request: PPTGenerationRequest): KnowledgeSnippet[] {
    if (!this.knowledgeRetriever) return [];
    const query = request.knowledgeBaseQuery || request.topic;
    if (!query.trim()) return [];
    try {
      return this.knowledgeRetriever.retrieve(query, this.config.maxKnowledgeSnippets);
    } catch {
      return [];
    }
  }

  /**
   * 构建主题
   */
  private buildTheme(
    template: DocumentTemplate | null,
    style: UserStyleProfile | null
  ): PPTTheme {
    const templateId = template?.id || 'builtin-default';
    const name = template ? `基于模板：${template.name}` : '默认主题';

    // 配色：优先风格画像 → 模板 → 年轻人审美方案（随机三选一）
    const youthSchemes = [DEFAULT_COLOR_SCHEME, WARM_COLOR_SCHEME, COOL_COLOR_SCHEME];
    const randomYouthScheme = youthSchemes[Math.floor(Math.random() * youthSchemes.length)];
    const colorScheme: ColorScheme =
      style?.preferredStyles.visual.colorScheme ||
      this.colorSchemeFromTemplate(template) ||
      randomYouthScheme;

    // 字体：优先风格画像 → 模板 → 默认
    const fontFamily: FontPreference =
      style?.preferredStyles.visual.fontFamily ||
      this.fontPreferenceFromTemplate(template) ||
      DEFAULT_FONT_PREFERENCE;

    // 布局：优先模板 → 风格画像 → 默认
    const layoutStyle =
      template?.styleFeatures.layoutStyle ||
      style?.preferredStyles.visual.layoutStyle.type ||
      'grid';

    const visualDensity =
      template?.styleFeatures.visualDensity ||
      style?.preferredStyles.visual.visualDensity ||
      'medium';

    return { name, templateId, colorScheme, fontFamily, layoutStyle, visualDensity };
  }

  /**
   * 从模板风格特征构造配色方案
   */
  private colorSchemeFromTemplate(t: DocumentTemplate | null): ColorScheme | null {
    if (!t || !t.styleFeatures.colorScheme || t.styleFeatures.colorScheme.length === 0) {
      return null;
    }
    const colors = t.styleFeatures.colorScheme;
    return {
      primary: colors.slice(0, 2),
      secondary: colors.slice(2, 4),
      accent: colors.slice(4, 6),
      background: ['#ffffff'],
      isDark: false,
      paletteType: 'custom',
    };
  }

  /**
   * 从模板风格特征构造字体偏好
   */
  private fontPreferenceFromTemplate(t: DocumentTemplate | null): FontPreference | null {
    if (!t || !t.styleFeatures.fontFamily || t.styleFeatures.fontFamily.length === 0) {
      return null;
    }
    const fonts = t.styleFeatures.fontFamily;
    return {
      primaryFont: fonts[0],
      secondaryFont: fonts[1],
      category: 'mixed',
      weightPreference: 'regular',
    };
  }

  /**
   * 用 LLM 生成高质量 PPT 大纲（含每页标题、要点、内容、演讲备注）
   * 失败时抛异常，由调用方降级处理
   */
  private async generateOutlineWithLLM(
    request: PPTGenerationRequest,
    theme: PPTTheme,
    snippets: KnowledgeSnippet[]
  ): Promise<PPTOutline> {
    const purposeName = PPTPurposeNames[request.purpose] || request.purpose;
    const slideCount = request.slideCount || 7;

    // 获取PPT设计指导（小红书趋势+评估弱项）
    let designGuidance = '';
    try {
      const guidance = await pptDesignLearner.getDesignGuidance();
      designGuidance = guidance.fullGuidance;
    } catch {
      // 获取失败时用空字符串，不影响生成
    }

    // 拼接知识库素材
    const knowledgeText = snippets.length > 0
      ? snippets.map((s, i) => `【素材${i + 1}】${s.title || ''}\n${s.text}`).join('\n\n')
      : '（知识库中暂无相关素材，请基于主题自由发挥）';

    const systemPrompt = `你是一位顶级PPT制作专家，深谙小红书/设计社区的现代PPT审美趋势，借鉴PPTAgent的两阶段编辑式方法论。

【用户画像】大学生受众，偏好简洁凝练风格。

【风格要求】
- 文字简洁凝练，详略得当，突出重点，讲清楚核心要点
- 每页只讲一个核心观点，用关键词+短句，不用大段文字
- 善用数字、对比、类比让内容生动有力
- 排版专业：大字标题+小字正文，留白充足，卡片式布局
- 颜值符合年轻人审美：莫兰迪低饱和配色、渐变、简约现代

【PPTAgent两阶段方法】
- Stage 1: 先分析用途和受众，提取内容schema（每页的功能类型）
- Stage 2: 基于schema+设计指导，迭代生成编辑动作

${designGuidance ? '【设计趋势指导】\n' + designGuidance : ''}

请根据用户需求生成一份高质量PPT大纲，严格返回JSON格式，不要包含任何其他文字或markdown标记。`;

    const userPrompt = `请生成一份PPT大纲，要求如下：

【主题】${request.topic}
【用途】${purposeName}
【期望页数】${slideCount} 页
【受众】${request.audience || '大学生'}
【额外要求】${request.additionalRequirements || '无'}

【知识库素材】
${knowledgeText}

请返回如下JSON格式（严格JSON，不要包含markdown代码块标记）：
{
  "title": "PPT主标题",
  "subtitle": "副标题",
  "slides": [
    {
      "title": "该页标题",
      "type": "cover|section|content|chart|image|conclusion",
      "keyPoints": ["要点1（关键词式，不超过15字）", "要点2", "要点3"],
      "content": "该页详细内容说明（30-150字，精炼表达核心逻辑）",
      "notes": "演讲备注（口语化提示，帮助演讲者自然表达）"
    }
  ]
}

【制作要求】
1. 第一页必须是 cover（封面），分析主题核心价值，用一句话点题
2. 最后一页必须是 conclusion（总结/致谢），归纳核心要点
3. 中间页面根据内容需要安排 section（章节分隔）、content（文字内容）、chart（数据图表）、image（图片示意）
4. 每页 keyPoints 3-4个要点，每个要点用关键词或短句，不超过15字，突出重点
5. content 字段精炼表达该页核心逻辑（30-150字），详略得当，不堆砌文字
6. notes 字段提供演讲时的口语化提示，帮助自然表达
7. 内容要专业、有深度、针对受众定制，用数据和案例说话
8. 如果知识库有素材，要合理融入相关内容
9. 风格要简洁凝练、现代高级，符合年轻人审美
10. 严格返回JSON，不要包含任何其他文字
11. 借鉴PPTAgent方法：先确定每页功能类型（cover/section/content/chart/image/conclusion），再为每页填充匹配类型的内容
12. 文字要简洁凝练：keyPoints每个不超过15字，content字段30-120字精炼表达，不堆砌不啰嗦
13. 详略得当：核心观点详写，辅助信息略写，数据用数字突出`;

    const result = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.7, maxTokens: 4000 }
    );

    if (!result.success || !result.content) {
      throw new Error(result.error || 'LLM 返回空内容');
    }

    // 解析 JSON（去除可能的 markdown 标记和首尾空白）
    let jsonStr = result.content.trim();
    // 去除可能的 ```json ... ``` 标记
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }
    const parsed = JSON.parse(jsonStr);

    // 构建 PPTOutline
    const slides: PPTSlideOutline[] = (parsed.slides || []).map((s: any, i: number) => ({
      index: i + 1,
      title: s.title || `第${i + 1}页`,
      type: (s.type as PPTSlideType) || 'content',
      keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints : [],
      content: s.content || '',
      notes: s.notes || '',
      knowledgeRefs: [],
    }));

    return {
      title: parsed.title || request.topic,
      subtitle: parsed.subtitle || this.composeSubtitle(request),
      slides,
      theme,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 生成大纲骨架
   */
  private generateOutline(
    request: PPTGenerationRequest,
    theme: PPTTheme
  ): PPTOutline {
    const types = planSlideTypes(request.purpose, request.slideCount);
    const slides: PPTSlideOutline[] = types.map((type, i) => {
      const index = i + 1;
      const title = defaultSlideTitle(type, index, request.topic);
      return {
        index,
        title,
        type,
        keyPoints: [],
        knowledgeRefs: [],
      };
    });

    // 封面副标题
    const subtitle = this.composeSubtitle(request);

    return {
      title: request.topic,
      subtitle,
      slides,
      theme,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 拼接封面副标题
   */
  private composeSubtitle(request: PPTGenerationRequest): string {
    const parts: string[] = [];
    parts.push(request.purpose);
    if (request.audience) parts.push(`面向：${request.audience}`);
    if (request.additionalRequirements) {
      parts.push(`要求：${request.additionalRequirements.slice(0, 40)}`);
    }
    return parts.join(' · ');
  }

  /**
   * 充实大纲内容
   * 把知识素材分配到各幻灯片
   */
  private enrichOutline(
    outline: PPTOutline,
    request: PPTGenerationRequest,
    snippets: KnowledgeSnippet[]
  ): void {
    if (outline.slides.length === 0) return;

    // 封面：填主题与副标题
    const cover = outline.slides.find((s) => s.type === 'cover');
    if (cover) {
      cover.title = outline.title;
      cover.keyPoints = [];
      if (request.audience) cover.keyPoints.push(`面向受众：${request.audience}`);
    }

    // 内容/图表/图片页：分配素材
    const contentSlides = outline.slides.filter(
      (s) => s.type === 'content' || s.type === 'chart' || s.type === 'image'
    );
    if (contentSlides.length === 0) return;

    const perSlide = Math.max(1, Math.ceil(snippets.length / contentSlides.length));
    let snippetCursor = 0;

    contentSlides.forEach((slide) => {
      const allocated = snippets.slice(snippetCursor, snippetCursor + perSlide);
      snippetCursor += perSlide;

      slide.keyPoints = extractKeyPointsFromSnippets(
        allocated,
        this.config.maxKeyPointsPerSlide
      );
      slide.content = composeContentFromSnippets(
        allocated,
        this.config.maxContentCharsPerSlide
      );
      slide.knowledgeRefs = allocated.map((s) => s.id);

      // 视觉建议
      if (slide.type === 'chart') {
        slide.suggestedVisual = '建议插入数据图表（柱状图/折线图）';
      } else if (slide.type === 'image') {
        slide.suggestedVisual = '建议插入示意图/流程图';
      }

      // 演讲备注
      slide.notes = generateSpeakerNotes(slide, request.purpose);
    });

    // 章节页：根据内容页主题归纳
    const sectionSlides = outline.slides.filter((s) => s.type === 'section');
    sectionSlides.forEach((slide, i) => {
      slide.title = this.inferSectionTitle(i, snippets);
      slide.notes = generateSpeakerNotes(slide, request.purpose);
    });

    // 结论页
    const conclusion = outline.slides.find((s) => s.type === 'conclusion');
    if (conclusion) {
      conclusion.keyPoints = this.composeConclusionPoints(request, snippets);
      conclusion.notes = generateSpeakerNotes(conclusion, request.purpose);
    }
  }

  /**
   * 推断章节标题
   */
  private inferSectionTitle(
    sectionIndex: number,

    snippets: KnowledgeSnippet[]
  ): string {
    const candidates = ['背景与目标', '核心内容', '数据分析', '方案与实施', '成果与展望'];
    if (snippets.length > 0 && snippets[sectionIndex % snippets.length]?.title) {
      return snippets[sectionIndex % snippets.length]!.title!;
    }
    return candidates[sectionIndex % candidates.length];
  }

  /**
   * 拼接结论要点
   */
  private composeConclusionPoints(
    request: PPTGenerationRequest,
    snippets: KnowledgeSnippet[]
  ): string[] {
    const points: string[] = [];
    points.push(`已围绕"${request.topic}"完成本次${request.purpose}内容`);
    if (snippets.length > 0) {
      points.push(`共引用知识素材 ${snippets.length} 处`);
    }
    points.push('欢迎反馈与交流，将持续优化');
    return points;
  }

  // ============ WPS 调用 ============

  /**
   * 根据幻灯片类型返回要点图标
   */
  private getKeyPointIcon(type: PPTSlideType): string {
    switch (type) {
      case 'cover': return '✦';
      case 'section': return '◆';
      case 'chart': return '📊';
      case 'image': return '🎯';
      case 'conclusion': return '✓';
      default: return '▶';
    }
  }

  /**
   * 在 WPS 中创建 PPT 并写入大纲内容
   *
   * 实现思路：
   * 1. 通过 bridge.createDocument('ppt') 新建空白 PPT
   * 2. 把每张幻灯片转为 WPSContentChange（slide 类型），批量 editContent
   * 3. 若指定 outputPath，则 saveAs 到目标路径
   */
  private async createPPTInWPS(
    outline: PPTOutline,
    _outputPath?: string
  ): Promise<WPSDocument> {
    // 直接生成文件，不依赖WPS编辑功能（WPS COM接口未实现）
    const timestamp = Date.now();
    const baseName = `${outline.title || '未命名PPT'}_${timestamp}`;

    // 1. 生成HTML预览文件（专业PPT样式，按幻灯片类型差异化渲染）
    const slidesHtml = outline.slides.map((slide, i) => {
      const keyPointsHtml = (slide.keyPoints || [])
        .map((p: string) => `<li><span class="kp-icon">${this.getKeyPointIcon(slide.type)}</span>${p}</li>`).join('');
      const contentHtml = slide.content
        ? `<div class="content">${slide.content.replace(/\n/g, '<br>')}</div>`
        : '';
      const notesHtml = slide.notes
        ? `<div class="notes">📝 演讲提示：${slide.notes}</div>`
        : '';
      const slideNum = `${i + 1} / ${outline.slides.length}`;

      // 根据幻灯片类型选择不同样式
      switch (slide.type) {
        case 'cover':
          return `
        <section class="slide slide-cover">
          <div class="slide-number">${slideNum}</div>
          <div class="cover-content">
            <h1 class="cover-title">${slide.title}</h1>
            ${slide.subtitle || outline.subtitle ? `<p class="cover-subtitle">${slide.subtitle || outline.subtitle}</p>` : ''}
            ${keyPointsHtml ? `<div class="cover-points">${keyPointsHtml}</div>` : ''}
          </div>
        </section>`;

        case 'section':
          return `
        <section class="slide slide-section">
          <div class="slide-number">${slideNum}</div>
          <div class="section-content">
            <div class="section-label">CHAPTER ${i}</div>
            <h2 class="section-title">${slide.title}</h2>
            ${keyPointsHtml ? `<ul class="key-points">${keyPointsHtml}</ul>` : ''}
          </div>
        </section>`;

        case 'chart':
          return `
        <section class="slide slide-chart">
          <div class="slide-number">${slideNum}</div>
          <h2 class="slide-title">${slide.title}</h2>
          ${slide.subtitle ? `<p class="slide-subtitle">${slide.subtitle}</p>` : ''}
          <div class="chart-placeholder">📊 <span>数据图表区域</span></div>
          ${keyPointsHtml ? `<ul class="key-points">${keyPointsHtml}</ul>` : ''}
          ${contentHtml}
          ${notesHtml}
        </section>`;

        case 'image':
          return `
        <section class="slide slide-image">
          <div class="slide-number">${slideNum}</div>
          <h2 class="slide-title">${slide.title}</h2>
          ${slide.subtitle ? `<p class="slide-subtitle">${slide.subtitle}</p>` : ''}
          <div class="image-placeholder">🖼️ <span>示意图/流程图区域</span></div>
          ${keyPointsHtml ? `<ul class="key-points">${keyPointsHtml}</ul>` : ''}
          ${contentHtml}
          ${notesHtml}
        </section>`;

        case 'conclusion':
          return `
        <section class="slide slide-conclusion">
          <div class="slide-number">${slideNum}</div>
          <h2 class="slide-title">${slide.title}</h2>
          ${keyPointsHtml ? `<ul class="key-points conclusion-points">${keyPointsHtml}</ul>` : ''}
          ${contentHtml}
          <div class="thank-you">谢谢聆听！</div>
        </section>`;

        default: // content
          return `
        <section class="slide slide-content">
          <div class="slide-number">${slideNum}</div>
          <h2 class="slide-title">${slide.title}</h2>
          ${slide.subtitle ? `<p class="slide-subtitle">${slide.subtitle}</p>` : ''}
          ${keyPointsHtml ? `<ul class="key-points">${keyPointsHtml}</ul>` : ''}
          ${contentHtml}
          ${notesHtml}
        </section>`;
      }
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${outline.title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; background: #0f0f1e; padding: 20px 0; }

  /* 通用幻灯片 */
  .slide {
    width: 100%; max-width: 960px; margin: 16px auto;
    min-height: 540px; padding: 56px 64px; border-radius: 16px;
    color: white; position: relative; overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  }
  .slide-number { position: absolute; top: 20px; right: 32px; opacity: 0.35; font-size: 13px; font-weight: 300; }
  .slide-title { font-size: 32px; margin-bottom: 12px; font-weight: 700; }
  .slide-subtitle { font-size: 16px; opacity: 0.65; margin-bottom: 20px; font-weight: 300; }

  /* 要点列表 */
  .key-points { list-style: none; margin: 16px 0; }
  .key-points li { font-size: 18px; margin: 10px 0; padding-left: 28px; position: relative; line-height: 1.6; }
  .kp-icon { position: absolute; left: 0; color: #60a5fa; font-weight: bold; }
  .content { font-size: 15px; line-height: 1.8; opacity: 0.8; margin: 14px 0; padding: 12px 16px; background: rgba(255,255,255,0.05); border-radius: 8px; border-left: 3px solid #60a5fa; }
  .notes { font-size: 13px; opacity: 0.45; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-style: italic; }

  /* 封面 */
  .slide-cover {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
    display: flex; align-items: center; justify-content: center; text-align: center;
  }
  .cover-content { z-index: 1; }
  .cover-title { font-size: 52px; font-weight: 800; margin-bottom: 16px; text-shadow: 0 2px 10px rgba(0,0,0,0.3); }
  .cover-subtitle { font-size: 22px; opacity: 0.85; margin-bottom: 24px; font-weight: 300; }
  .cover-points { list-style: none; display: inline-block; text-align: left; }
  .cover-points li { font-size: 16px; opacity: 0.8; margin: 6px 0; padding-left: 24px; position: relative; }
  .cover-points .kp-icon { color: #ffd700; }

  /* 章节分隔 */
  .slide-section {
    background: linear-gradient(135deg, #0f4c75 0%, #1b6ca8 100%);
    display: flex; align-items: center; justify-content: center; text-align: center;
  }
  .section-content { z-index: 1; }
  .section-label { font-size: 14px; opacity: 0.5; letter-spacing: 4px; margin-bottom: 12px; }
  .section-title { font-size: 44px; font-weight: 700; margin-bottom: 20px; }

  /* 内容页 */
  .slide-content { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); }
  .slide-content .kp-icon { content: '▶'; }

  /* 图表页 */
  .slide-chart { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); }
  .chart-placeholder { text-align: center; padding: 30px; margin: 16px 0; background: rgba(255,255,255,0.08); border-radius: 12px; font-size: 24px; opacity: 0.6; }
  .chart-placeholder span { display: block; font-size: 14px; margin-top: 8px; }

  /* 图片页 */
  .slide-image { background: linear-gradient(135deg, #2d3436 0%, #42467a 100%); }
  .image-placeholder { text-align: center; padding: 30px; margin: 16px 0; background: rgba(255,255,255,0.08); border-radius: 12px; font-size: 24px; opacity: 0.6; }
  .image-placeholder span { display: block; font-size: 14px; margin-top: 8px; }

  /* 结论页 */
  .slide-conclusion { background: linear-gradient(135deg, #134e5e 0%, #71b280 100%); }
  .conclusion-points li { font-size: 20px; margin: 14px 0; }
  .thank-you { text-align: center; font-size: 36px; font-weight: 700; margin-top: 30px; opacity: 0.9; }
</style>
</head>
<body>
  ${slidesHtml}
</body>
</html>`;

    // 2. 保存HTML和JSON到数据目录
    const htmlPath = `ppt/${baseName}.html`;
    const jsonPath = `ppt/${baseName}.json`;
    await invoke('write_json_file', { filename: htmlPath, content: html });
    await invoke('write_json_file', { filename: jsonPath, content: JSON.stringify(outline, null, 2) });

    // 3. 尝试用WPS打开（如果安装了WPS）
    let wpsDocId = `local_${timestamp}`;
    try {
      const doc = await this.bridge.createDocument('ppt', `${outline.title}.pptx`);
      wpsDocId = doc.id;
    } catch {
      // WPS未安装或启动失败，不影响文件生成
    }

    return {
      id: wpsDocId,
      path: `D:\\code\\llm-wiki-data\\${htmlPath}`,
      name: `${baseName}.html`,
      type: 'ppt',
      isOpen: true,
    } as WPSDocument;
  }

  // ============ PPTAgent 反思评估 ============

  /**
   * PPTAgent 反思评估：从三维度评估 PPT 质量（借鉴 PPTEval 框架）
   *
   * 三个维度（每项 0-100）：
   * - Content：内容完整性、准确性、针对性、数据支撑
   * - Design：视觉吸引力、排版专业、配色协调、留白合理
   * - Coherence：逻辑流畅、结构清晰、过渡自然、详略得当
   *
   * 评估失败时返回全 0 分，不影响主流程。
   *
   * @param outline 已生成的 PPT 大纲
   * @param request 原始生成请求（提供主题/受众上下文）
   * @returns 三维分数 + 总分 + 改进建议
   */
  private async evaluatePPT(
    outline: PPTOutline,
    request: PPTGenerationRequest
  ): Promise<PPTEvaluation> {
    try {
      // 拼接幻灯片摘要供 LLM 评估
      const slidesText = outline.slides
        .map(
          (s, i) =>
            '第' +
            (i + 1) +
            '页[' +
            s.type +
            '] ' +
            s.title +
            '\n要点: ' +
            (s.keyPoints || []).join('、') +
            '\n内容: ' +
            (s.content || '')
        )
        .join('\n\n');

      const result = await chat(
        [
          {
            role: 'system',
            content:
              '你是PPT质量评估专家，借鉴PPTAgent的PPTEval框架。针对大学生受众，从三维度评估PPT质量，返回严格JSON，不要包含markdown代码块标记。',
          },
          {
            role: 'user',
            content:
              '请评估以下PPT大纲的质量，从三个维度打分（0-100）并给出改进建议：\n\n' +
              '【主题】' +
              request.topic +
              '\n【受众】' +
              (request.audience || '大学生') +
              '\n\n【PPT内容】\n' +
              slidesText +
              '\n\n请返回JSON格式：\n{"content":85,"design":80,"coherence":90,"suggestions":["建议1","建议2"]}\n\n' +
              '评分标准（针对大学生受众）：\n' +
              '- content(内容40%权重): 核心观点是否清晰、信息准确性、针对性（是否适合大学生）、数据/案例支撑、详略得当\n' +
              '- design(设计30%权重): 视觉吸引力、排版专业度（大字标题小字正文）、配色协调（莫兰迪/年轻人审美）、留白合理、卡片式布局\n' +
              '- coherence(连贯30%权重): 逻辑流畅、结构清晰（总分总）、过渡自然、每页一个观点、页面间逻辑递进\n' +
              '总分 = content*0.4 + design*0.3 + coherence*0.3（加权平均）',
          },
        ],
        { temperature: 0.3 }
      );

      if (result.success && result.content) {
        // 去除可能的 markdown 代码块标记
        let jsonStr = result.content.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        }
        const parsed = JSON.parse(jsonStr);
        const content = Number(parsed.content) || 0;
        const design = Number(parsed.design) || 0;
        const coherence = Number(parsed.coherence) || 0;
        const total = Math.round(content * 0.4 + design * 0.3 + coherence * 0.3);
        const suggestions: string[] = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.map((x: unknown) => String(x))
          : [];
        return { content, design, coherence, total, suggestions };
      }
    } catch (e) {
      console.warn('[PPTGenerator] PPT评估失败:', e);
    }
    return { content: 0, design: 0, coherence: 0, total: 0, suggestions: [] };
  }

  /**
   * 把评估结果追加保存到学习笔记 markdown 文件
   *
   * 路径：D:\code\llm-wiki-data\research\pptagent-study-notes.md
   * 采用"先读后追加再写回"策略实现追加写入。
   * 失败时静默处理，不影响主流程。
   */
  private async saveEvaluationToNotes(
    request: PPTGenerationRequest,
    evaluation: PPTEvaluation
  ): Promise<void> {
    try {
      const notesPath = 'research/pptagent-study-notes.md';
      // 读取现有内容（文件不存在时 read_json_file 返回 "[]"）
      let existing = '';
      try {
        existing = await invoke<string>('read_json_file', { filename: notesPath });
        // read_json_file 对不存在的文件返回 "[]"，此时当作空内容
        if (existing === '[]') existing = '';
      } catch {
        existing = '';
      }

      const timestamp = new Date().toISOString();
      const noteEntry =
        '\n## PPTAgent 反思评估记录\n\n' +
        '- 时间: ' +
        timestamp +
        '\n' +
        '- 主题: ' +
        request.topic +
        '\n' +
        '- 用途: ' +
        request.purpose +
        '\n' +
        '- 受众: ' +
        (request.audience || '未指定') +
        '\n' +
        '- 评分: Content=' +
        evaluation.content +
        ' Design=' +
        evaluation.design +
        ' Coherence=' +
        evaluation.coherence +
        ' 总分=' +
        evaluation.total +
        '\n' +
        '- 改进建议: ' +
        (evaluation.suggestions.length > 0
          ? evaluation.suggestions.join('；')
          : '无') +
        '\n';

      await invoke('write_json_file', {
        filename: notesPath,
        content: existing + noteEntry,
      });
    } catch (e) {
      console.warn('[PPTGenerator] 保存评估笔记失败:', e);
    }
  }

  // ============ 迭代优化 ============

  /**
   * 基于反馈重新生成
   *
   * @param previous 上一次的生成结果
   * @param feedback 用户反馈
   * @param onProgress 进度回调
   */
  async regenerate(
    previous: PPTGenerationResult,
    feedback: PPTFeedback,
    onProgress?: PPTProgressCallback
  ): Promise<PPTGenerationResult> {
    // 满意 → 直接返回，并把评分喂回学习器
    if (feedback.type === 'satisfied') {
      this.recordSatisfaction(previous, feedback);
      return previous;
    }

    // 构造新请求
    const newRequest = this.applyFeedbackToRequest(previous, feedback);

    // 更换模板：直接指定新模板 ID
    if (feedback.type === 'change_template' && feedback.newTemplateId) {
      newRequest.templateId = feedback.newTemplateId;
    }

    // 局部结构调整：复用前次大纲做最小改动
    if (feedback.type === 'adjust_structure' && feedback.slideIndices) {
      const adjusted = this.adjustOutlineStructure(previous.outline, feedback);
      const result: PPTGenerationResult = {
        ...previous,
        outline: adjusted,
        durationMs: 0,
        createdAt: new Date().toISOString(),
      };
      // 若需要同步到 WPS，重新创建
      if (newRequest.openInWPS ?? this.config.autoOpenInWPS) {
        this.emit(onProgress, PPTGenerationStage.CREATING_PPT, 90, '正在同步调整到 WPS…');
        const doc = await this.createPPTInWPS(adjusted, newRequest.outputPath);
        result.wpsDocumentId = doc.id;
        result.generatedPath = doc.path || newRequest.outputPath;
      }
      this.recordSatisfaction(previous, feedback);
      return result;
    }

    // 其余情况：完全重新生成
    return this.generate(newRequest, onProgress);
  }

  /**
   * 把反馈映射到新请求
   */
  private applyFeedbackToRequest(
    previous: PPTGenerationResult,
    feedback: PPTFeedback
  ): PPTGenerationRequest {
    const outline = previous.outline;
    return {
      topic: outline.title,
      purpose: PPTPurpose.CUSTOM,
      audience: outline.subtitle,
      slideCount: outline.slides.length,
      templateId: previous.appliedTemplate?.id,
      additionalRequirements: feedback.comment || feedback.styleHint,
      openInWPS: true,
    };
  }

  /**
   * 局部调整大纲结构
   */
  private adjustOutlineStructure(
    outline: PPTOutline,
    feedback: PPTFeedback
  ): PPTOutline {
    const slides = [...outline.slides];
    // 简单实现：根据反馈注释在指定幻灯片备注中追加调整说明
    if (feedback.slideIndices && feedback.comment) {
      feedback.slideIndices.forEach((idx) => {
        const slide = slides.find((s) => s.index === idx);
        if (slide) {
          slide.notes = `${slide.notes || ''}\n[用户调整]${feedback.comment}`;
        }
      });
    }
    return { ...outline, slides, createdAt: new Date().toISOString() };
  }

  /**
   * 记录用户满意度，喂回学习器
   */
  private recordSatisfaction(
    result: PPTGenerationResult,
    feedback: PPTFeedback
  ): void {
    if (feedback.rating && result.appliedTemplate) {
      try {
        this.templates.setRating(result.appliedTemplate.id, feedback.rating);
      } catch {
        // 评分失败不影响主流程
      }
    }
  }

  // ============ 大纲编辑 ============

  /**
   * 应用用户在 UI 上对大纲的编辑
   * @returns 更新后的结果（不重新调用 WPS）
   */
  applyOutlineEdit(
    previous: PPTGenerationResult,
    edit: PPTOutlineEdit
  ): PPTGenerationResult {
    const outline: PPTOutline = {
      ...previous.outline,
      title: edit.title || previous.outline.title,
      subtitle: edit.subtitle || previous.outline.subtitle,
      slides: edit.slides,
      createdAt: new Date().toISOString(),
    };
    return { ...previous, outline };
  }

  /**
   * 基于编辑后的大纲，调用 WPS 重新创建 PPT
   */
  async applyEditAndCreateInWPS(
    previous: PPTGenerationResult,
    edit: PPTOutlineEdit,
    outputPath?: string
  ): Promise<PPTGenerationResult> {
    const updated = this.applyOutlineEdit(previous, edit);
    const doc = await this.createPPTInWPS(updated.outline, outputPath);
    return {
      ...updated,
      wpsDocumentId: doc.id,
      generatedPath: doc.path || outputPath,
    };
  }

  // ============ 导出 .pptx ============

  /**
   * 导出 PPT 大纲为真正的 .pptx 文件（可在 PowerPoint/WPS 中打开）
   *
   * 使用 pptxgenjs 库在浏览器端生成 .pptx 二进制（base64），
   * 再通过 Rust 后端 write_binary_file 命令落盘到 D:\code\llm-wiki-data\ppt\ 目录。
   *
   * 配色采用年轻人审美三方案随机：
   *   - 莫兰迪紫 (#7B68AE / #E8E4F3)：低饱和优雅
   *   - 暖色     (#F4A261 / #E76F51)：人文温暖
   *   - 冷色     (#2A9D8F / #264653)：理工沉稳
   *
   * @param outline PPT 大纲
   * @returns 生成的 .pptx 文件完整路径
   */
  async exportToPPTX(outline: PPTOutline): Promise<string> {
    // 1. 年轻人审美配色方案三选一
    const palettes = [
      { name: '莫兰迪紫', primary: '7B68AE', primaryLight: 'E8E4F3', accent: '9B7FCE', text: '2D2D44', bg: 'FFFFFF' },
      { name: '暖色', primary: 'F4A261', primaryLight: 'FCE4D6', accent: 'E76F51', text: '3D2B1F', bg: 'FFFFFF' },
      { name: '冷色', primary: '2A9D8F', primaryLight: 'D4F1ED', accent: '264653', text: '1F3D3A', bg: 'FFFFFF' },
    ];
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
    const FONT = '思源黑体';

    // 2. 创建演示文稿（16:9 宽屏）— 动态导入 pptxgenjs 避免浏览器端 fs 模块错误
    const pptxgenjs = (await import('pptxgenjs')).default;
    const pres = new pptxgenjs();
    pres.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"
    pres.author = 'LLM-Wiki PPT Generator';
    pres.title = outline.title;
    pres.subject = outline.subtitle || '';

    // 3. 逐页渲染
    for (const slide of outline.slides) {
      const s = pres.addSlide();
      s.background = { color: palette.bg };

      switch (slide.type) {
        case 'cover': {
          // 标题页：浅色底 + 大标题 + 副标题
          s.background = { color: palette.primaryLight };
          s.addText(slide.title, {
            x: 0.5, y: 2.2, w: 12.33, h: 1.6,
            fontSize: 44, bold: true, color: palette.primary,
            align: 'center', fontFace: FONT,
          });
          const subtitle = slide.subtitle || outline.subtitle;
          if (subtitle) {
            s.addText(subtitle, {
              x: 1.0, y: 3.9, w: 11.33, h: 0.8,
              fontSize: 20, color: palette.text,
              align: 'center', fontFace: FONT,
            });
          }
          // 底部装饰线
          s.addShape(pres.ShapeType.line, {
            x: 5.66, y: 4.8, w: 2, h: 0,
            line: { color: palette.accent, width: 2 },
          });
          break;
        }

        case 'section': {
          // 章节分隔页：主色满底 + 白字
          s.background = { color: palette.primary };
          s.addText(slide.title, {
            x: 0.5, y: 2.8, w: 12.33, h: 1.5,
            fontSize: 40, bold: true, color: 'FFFFFF',
            align: 'center', fontFace: FONT,
          });
          if (slide.subtitle) {
            s.addText(slide.subtitle, {
              x: 1.0, y: 4.3, w: 11.33, h: 0.8,
              fontSize: 18, color: palette.primaryLight,
              align: 'center', fontFace: FONT,
            });
          }
          break;
        }

        case 'conclusion': {
          // 结论页：标题 + 要点 + 致谢
          s.addText(slide.title, {
            x: 0.5, y: 0.4, w: 12.33, h: 1.0,
            fontSize: 32, bold: true, color: palette.primary,
            align: 'center', fontFace: FONT,
          });
          s.addShape(pres.ShapeType.line, {
            x: 5.66, y: 1.4, w: 2, h: 0,
            line: { color: palette.accent, width: 2 },
          });
          // 要点
          if (slide.keyPoints && slide.keyPoints.length > 0) {
            const points = slide.keyPoints.map((p) => ({
              text: p,
              options: {
                bullet: { code: '2022' },
                fontSize: 18, color: palette.text, fontFace: FONT,
                breakLine: true, paraSpaceAfter: 10,
              },
            }));
            s.addText(points, { x: 1.5, y: 1.8, w: 10.33, h: 3.2 });
          }
          // 正文
          if (slide.content) {
            s.addText(slide.content, {
              x: 1.5, y: 5.2, w: 10.33, h: 1.0,
              fontSize: 14, color: palette.text, fontFace: FONT, align: 'left',
            });
          }
          // 致谢
          s.addText('谢谢聆听！', {
            x: 0.5, y: 6.4, w: 12.33, h: 0.7,
            fontSize: 22, bold: true, color: palette.accent,
            align: 'center', fontFace: FONT,
          });
          break;
        }

        default: {
          // 内容页 (content / chart / image)：标题 + 要点 + 正文
          // 标题
          s.addText(slide.title, {
            x: 0.5, y: 0.3, w: 12.33, h: 0.9,
            fontSize: 28, bold: true, color: palette.primary,
            align: 'left', fontFace: FONT,
          });
          // 标题下装饰短线
          s.addShape(pres.ShapeType.line, {
            x: 0.5, y: 1.2, w: 2, h: 0,
            line: { color: palette.accent, width: 2.5 },
          });
          let yPos = 1.4;
          // 副标题
          if (slide.subtitle) {
            s.addText(slide.subtitle, {
              x: 0.5, y: yPos, w: 12.33, h: 0.5,
              fontSize: 16, color: palette.text, italic: true,
              align: 'left', fontFace: FONT,
            });
            yPos += 0.6;
          }
          // 要点列表
          if (slide.keyPoints && slide.keyPoints.length > 0) {
            const points = slide.keyPoints.map((p) => ({
              text: p,
              options: {
                bullet: { code: '2022' },
                fontSize: 18, color: palette.text, fontFace: FONT,
                breakLine: true, paraSpaceAfter: 8,
              },
            }));
            const pointsH = Math.min(3.2, 0.4 * slide.keyPoints.length + 0.3);
            s.addText(points, { x: 0.8, y: yPos, w: 11.73, h: pointsH });
            yPos += pointsH + 0.1;
          }
          // 正文内容
          if (slide.content) {
            s.addText(slide.content, {
              x: 0.8, y: yPos, w: 11.73, h: Math.max(1.0, 6.8 - yPos),
              fontSize: 14, color: palette.text, fontFace: FONT,
              align: 'left', valign: 'top',
            });
          }
          // 图表/图片占位提示
          if (slide.type === 'chart') {
            s.addText('📊 数据图表区域', {
              x: 4.66, y: 5.6, w: 4, h: 0.5,
              fontSize: 16, color: palette.accent, italic: true,
              align: 'center', fontFace: FONT,
            });
          } else if (slide.type === 'image') {
            s.addText('🖼️ 示意图/流程图区域', {
              x: 4.16, y: 5.6, w: 5, h: 0.5,
              fontSize: 16, color: palette.accent, italic: true,
              align: 'center', fontFace: FONT,
            });
          }
          break;
        }
      }

      // 演讲备注
      if (slide.notes) {
        s.addNotes(slide.notes);
      }
    }

    // 4. 生成 base64（浏览器环境返回 string）
    const base64 = (await pres.write({ outputType: 'base64' })) as string;

    // 5. 通过 Rust 后端 write_binary_file 命令落盘
    const timestamp = Date.now();
    // 文件名安全处理：去除 Windows 非法字符
    const safeTitle = (outline.title || '未命名PPT')
      .replace(/[<>:"/\\|?*\s]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);
    const baseName = `${safeTitle}_${timestamp}`;
    const filename = `ppt/${baseName}.pptx`;

    const fullPath = await invoke<string>('write_binary_file', {
      filename,
      base64Data: base64,
    });

    return fullPath;
  }

  // ============ 工具 ============

  /**
   * 发送进度事件
   */
  private emit(
    onProgress: PPTProgressCallback | undefined,
    stage: PPTGenerationProgress['stage'],
    percent: number,
    message: string,
    error?: string
  ): void {
    if (!onProgress) return;
    onProgress({ stage, percent, message, error });
  }

  /**
   * 获取当前配置（只读）
   */
  getConfig(): Readonly<PPTGeneratorConfig> {
    return { ...this.config };
  }
}

// ============ 单例管理 ============

let generatorSingleton: PPTGenerator | null = null;

/**
 * 获取 PPT 生成器单例
 *
 * 推荐用法：
 * ```ts
 * import { getPPTGenerator } from '@/lib/wps/ppt-generator';
 * const gen = getPPTGenerator();
 * const result = await gen.generate({ topic: '季度汇报', purpose: 'report' });
 * ```
 */
export function getPPTGenerator(
  options?: ConstructorParameters<typeof PPTGenerator>[0]
): PPTGenerator {
  if (!generatorSingleton) {
    generatorSingleton = new PPTGenerator(options);
  }
  return generatorSingleton;
}

/**
 * 重置单例（主要用于测试或切换依赖）
 */
export function resetPPTGenerator(
  options?: ConstructorParameters<typeof PPTGenerator>[0]
): PPTGenerator {
  generatorSingleton = new PPTGenerator(options);
  return generatorSingleton;
}

/**
 * 从 wiki-store 构造默认知识检索器
 *
 * 把 wiki-store 的 searchEntries 结果转换为 KnowledgeSnippet
 */
export function createWikiKnowledgeRetriever(
  searchFn: (query: string) => Array<{
    id: string;
    name: string;
    content?: { text?: string };
    metadata?: { title?: string };
  }>
): KnowledgeRetriever {
  return {
    retrieve(query: string, limit = 8): KnowledgeSnippet[] {
      if (!query.trim()) return [];
      const entries = searchFn(query);
      return entries.slice(0, limit).map((e, i) => ({
        id: e.id,
        source: e.name,
        title: e.metadata?.title || e.name,
        text: e.content?.text || '',
        score: 1 - i * 0.1,
        matchedKeywords: query.split(/\s+/).filter(Boolean),
      }));
    },
  };
}

/**
 * 抛弃 WPS 错误为可读字符串
 */
export function describeWPSError(err: unknown): string {
  if (err instanceof WPSError) {
    return `[${err.code}] ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * 重新导出常用类型与常量，便于上层一次性 import
 */
export {
  PPTGenerationStage,
  PPTPurpose,
  DEFAULT_PPT_GENERATOR_CONFIG,
} from '../../types/ppt-generation';
export { TemplateCategory } from '../../types/template';
export type {
  PPTGenerationRequest,
  PPTGenerationResult,
  PPTGenerationProgress,
  PPTOutline,
  PPTSlideOutline,
  PPTTheme,
  PPTFeedback,
  PPTOutlineEdit,
  PPTProgressCallback,
  PPTEvaluation,
  KnowledgeSnippet,
  KnowledgeRetriever,
  StyleLearnerAdapter,
} from '../../types/ppt-generation';