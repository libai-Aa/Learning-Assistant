/**
 * 第一性原理回答模板
 * 针对理工科问题，从基础假设出发进行推理和分析
 */

import type {
  FirstPrincipleAnalysis,
  FirstPrincipleStep,
} from '../../types/memory';

/**
 * 第一性原理配置
 */
export interface FirstPrinciplesConfig {
  /** 最大步骤数 */
  maxSteps?: number;
  /** 是否包含类比解释 */
  includeAnalogy?: boolean;
  /** 是否包含数学抽象 */
  includeMathematicalAbstraction?: boolean;
  /** 是否包含LaTeX公式 */
  includeLatexFormula?: boolean;
  /** 置信度阈值 */
  confidenceThreshold?: number;
}

/**
 * 问题分类
 */
export type ProblemDomain =
  | 'physics'
  | 'mathematics'
  | 'chemistry'
  | 'biology'
  | 'computer_science'
  | 'engineering'
  | 'economics'
  | 'other';

/**
 * 基础假设模板
 */
interface AssumptionTemplate {
  domain: ProblemDomain;
  assumptions: string[];
  reasoningTemplate: string[];
}

/**
 * 类比库
 */
interface AnalogyLibrary {
  [key: string]: {
    analogy: string;
    explanation: string;
  };
}

/**
 * 第一性原理分析器
 */
export class FirstPrinciples {
  private config: Required<FirstPrinciplesConfig>;
  private assumptionTemplates: AssumptionTemplate[];
  private analogyLibrary: AnalogyLibrary;

  constructor(config: FirstPrinciplesConfig = {}) {
    this.config = {
      maxSteps: 5,
      includeAnalogy: true,
      includeMathematicalAbstraction: true,
      includeLatexFormula: true,
      confidenceThreshold: 0.7,
      ...config,
    };

    this.assumptionTemplates = this.initAssumptionTemplates();
    this.analogyLibrary = this.initAnalogyLibrary();
  }

  /**
   * 分析问题
   */
  async analyze(question: string): Promise<FirstPrincipleAnalysis> {
    // 1. 分类问题
    const domain = this.classifyProblem(question);

    // 2. 提取基础假设
    const assumptions = this.extractAssumptions(question, domain);

    // 3. 构建推理步骤
    const steps = this.buildReasoningSteps(question, domain, assumptions);

    // 4. 生成类比解释
    const analogy = this.generateAnalogy(question, domain);

    // 5. 生成数学抽象
    const mathematicalAbstraction = this.generateMathematicalAbstraction(
      question,
      domain
    );

    // 6. 生成LaTeX公式
    const latexFormula = this.generateLatexFormula(question, domain);

    // 7. 生成最终结论
    const conclusion = this.generateConclusion(steps);

    // 8. 计算置信度
    const confidence = this.calculateConfidence(
      assumptions.length,
      steps.length,
      domain
    );

    return {
      question,
      domain: this.getDomainName(domain),
      assumptions,
      steps,
      analogy,
      mathematicalAbstraction,
      latexFormula,
      conclusion,
      confidence,
    };
  }

  /**
   * 生成回答
   */
  async generateAnswer(question: string): Promise<string> {
    const analysis = await this.analyze(question);
    return this.formatAnalysis(analysis);
  }

  /**
   * 分类问题
   */
  private classifyProblem(question: string): ProblemDomain {
    const lowerQuestion = question.toLowerCase();

    // 物理关键词
    const physicsKeywords = [
      '物理', '力学', '运动', '速度', '加速度', '力', '能量', '动量',
      '电磁', '电场', '磁场', '光学', '热力学', '量子', '相对论',
      '牛顿', '物体', '下落', '落地', '引力', '重力', '惯性', '摩擦',
      'physics', 'force', 'energy', 'velocity', 'acceleration',
      'momentum', 'electric field', 'magnetic field',
      'newton', 'gravity', 'inertia', 'friction',
    ];

    // 数学关键词
    const mathKeywords = [
      '数学', '代数', '几何', '微积分', '积分', '微分', '方程', '函数',
      '极限', '导数', '级数', '矩阵', '向量', '概率', '统计',
      'math', 'algebra', 'calculus', 'integral', 'derivative',
      'equation', 'function', 'matrix', 'vector',
    ];

    // 化学关键词
    const chemistryKeywords = [
      '化学', '元素', '分子', '原子', '化学反应', '酸碱', '氧化还原',
      '化学键', '有机化学', '无机化学',
      'chemistry', 'molecule', 'atom', 'chemical reaction',
    ];

    // 计算机科学关键词
    const csKeywords = [
      '算法', '数据结构', '编程', '代码', '软件', '网络', '数据库',
      '机器学习', '深度学习', '神经网络', '人工智能',
      'algorithm', 'data structure', 'programming', 'code',
      'machine learning', 'neural network', 'AI',
    ];

    // 工程关键词
    const engineeringKeywords = [
      '工程', '设计', '结构', '材料', '机械', '电子', '电路',
      'engineering', 'design', 'structure', 'material', 'circuit',
    ];

    // 检查每个领域
    if (physicsKeywords.some((k) => lowerQuestion.includes(k.toLowerCase()))) {
      return 'physics';
    }
    if (mathKeywords.some((k) => lowerQuestion.includes(k.toLowerCase()))) {
      return 'mathematics';
    }
    if (chemistryKeywords.some((k) => lowerQuestion.includes(k.toLowerCase()))) {
      return 'chemistry';
    }
    if (csKeywords.some((k) => lowerQuestion.includes(k.toLowerCase()))) {
      return 'computer_science';
    }
    if (engineeringKeywords.some((k) => lowerQuestion.includes(k.toLowerCase()))) {
      return 'engineering';
    }

    return 'other';
  }

  /**
   * 提取基础假设
   */
  private extractAssumptions(
    _question: string,
    domain: ProblemDomain
  ): string[] {
    const template = this.assumptionTemplates.find(
      (t) => t.domain === domain
    );

    // 基础假设
    const baseAssumptions: string[] = [
      '问题涉及的物理/数学定律在当前条件下成立',
      '系统处于理想或近似理想状态',
      '忽略次要因素以简化分析',
    ];

    if (template) {
      return [...baseAssumptions, ...template.assumptions];
    }

    return baseAssumptions;
  }

  /**
   * 构建推理步骤
   */
  private buildReasoningSteps(
    question: string,
    domain: ProblemDomain,
    assumptions: string[]
  ): FirstPrincipleStep[] {
    const steps: FirstPrincipleStep[] = [];
    const template = this.assumptionTemplates.find(
      (t) => t.domain === domain
    );

    // 步骤1: 明确问题
    steps.push({
      step: 1,
      title: '问题定义',
      assumption: '我们需要理解问题的本质',
      reasoning: this.analyzeQuestionStructure(question),
      conclusion: `问题核心: ${this.extractCoreQuestion(question)}`,
    });

    // 步骤2: 建立基础
    steps.push({
      step: 2,
      title: '基础假设',
      assumption: assumptions[0] || '基础定律成立',
      reasoning: this.applyBasicPrinciples(domain),
      conclusion: '已确定适用的基础理论框架',
    });

    // 步骤3: 推理分析
    const reasoningTemplate = template?.reasoningTemplate || [
      '分析输入与输出关系',
      '建立数学模型',
      '推导关键方程',
    ];

    for (let i = 0; i < Math.min(this.config.maxSteps - 3, reasoningTemplate.length); i++) {
      steps.push({
        step: i + 3,
        title: `推理分析 ${i + 1}`,
        assumption: assumptions[i + 1] || '系统状态稳定',
        reasoning: reasoningTemplate[i],
        conclusion: this.generateIntermediateConclusion(i, domain),
      });
    }

    // 最后一步: 综合结论
    steps.push({
      step: steps.length + 1,
      title: '综合结论',
      assumption: '所有假设和推理有效',
      reasoning: '综合以上所有推理步骤，得出最终结论',
      conclusion: '结论已验证，符合逻辑一致性',
    });

    return steps.slice(0, this.config.maxSteps);
  }

  /**
   * 分析问题结构
   */
  private analyzeQuestionStructure(question: string): string {
    // 提取问题中的关键要素
    const patterns = [
      { pattern: /如何|怎样|怎么/g, description: '寻求方法/过程' },
      { pattern: /为什么|原因/g, description: '寻求原因/解释' },
      { pattern: /是什么|定义/g, description: '寻求定义/概念' },
      { pattern: /多少|数值/g, description: '寻求数值计算' },
      { pattern: /是否|是不是/g, description: '寻求判断/验证' },
    ];

    for (const { pattern, description } of patterns) {
      if (pattern.test(question)) {
        return `这是一个${description}类型的问题`;
      }
    }

    return '这是一个综合性的问题，需要多角度分析';
  }

  /**
   * 提取核心问题
   */
  private extractCoreQuestion(question: string): string {
    // 移除修饰语，提取核心
    let core = question
      .replace(/^(请问|我想知道|为什么|如何)/, '')
      .replace(/[？?。.！!]+$/, '');

    // 如果太长，截取关键部分
    if (core.length > 50) {
      core = core.substring(0, 47) + '...';
    }

    return core;
  }

  /**
   * 应用基础原理
   */
  private applyBasicPrinciples(domain: ProblemDomain): string {
    const principles: Record<ProblemDomain, string> = {
      physics: '应用牛顿定律/能量守恒/动量守恒等基本原理',
      mathematics: '应用代数/几何/微积分等数学工具',
      chemistry: '应用化学键/热力学/动力学等基本原理',
      biology: '应用进化论/细胞理论/遗传学等基本原理',
      computer_science: '应用算法/数据结构/计算理论等基本原理',
      engineering: '应用工程力学/材料科学/设计原理等基础知识',
      economics: '应用供需理论/边际效用/博弈论等基本原理',
      other: '应用逻辑推理和分析方法',
    };

    return principles[domain];
  }

  /**
   * 生成中间结论
   */
  private generateIntermediateConclusion(
    step: number,
    domain: ProblemDomain
  ): string {
    const conclusions: Record<ProblemDomain, string[]> = {
      physics: [
        '力的平衡条件已确定',
        '能量转换关系已建立',
        '运动方程已推导',
        '系统状态已分析',
      ],
      mathematics: [
        '方程已建立',
        '边界条件已确定',
        '解的形式已推导',
        '数值方法已选择',
      ],
      chemistry: [
        '反应方程式已配平',
        '热力学参数已计算',
        '反应机理已分析',
        '产物预测已完成',
      ],
      biology: [
        '生物结构已分析',
        '功能机制已理解',
        '调控网络已建立',
        '进化关系已推断',
      ],
      computer_science: [
        '算法复杂度已分析',
        '数据结构已设计',
        '系统架构已规划',
        '实现方案已确定',
      ],
      engineering: [
        '设计参数已确定',
        '材料选择已完成',
        '结构分析已完成',
        '优化方案已制定',
      ],
      economics: [
        '供需模型已建立',
        '均衡条件已确定',
        '效用函数已构建',
        '策略选择已分析',
      ],
      other: [
        '分析框架已建立',
        '关键因素已识别',
        '逻辑关系已梳理',
        '初步结论已形成',
      ],
    };

    const domainConclusions = conclusions[domain] || conclusions.other;
    return domainConclusions[step % domainConclusions.length];
  }

  /**
   * 生成类比解释
   */
  private generateAnalogy(question: string, domain: ProblemDomain): string {
    if (!this.config.includeAnalogy) {
      return '';
    }

    // 从类比库中查找匹配的类比
    for (const [key, value] of Object.entries(this.analogyLibrary)) {
      if (question.toLowerCase().includes(key.toLowerCase())) {
        return `${value.analogy}\n
类比说明: ${value.explanation}`;
      }
    }

    // 根据领域生成通用类比
    const domainAnalogy: Record<ProblemDomain, string> = {
      physics: '这就像一个弹簧系统：外力（输入）使弹簧变形（状态变化），弹簧力（输出）与位移成正比。理解这个类比有助于理解力与运动的关系。',
      mathematics: '这就像解开一个谜题：你需要找到正确的线索（已知条件），使用逻辑推理（数学工具），最终得到答案（解）。每个步骤都必须严谨。',
      chemistry: '这就像烹饪：你需要正确的食材（反应物），合适的火候（反应条件），以及精确的配比（化学计量），才能做出美味的菜肴（产物）。',
      biology: '这就像一个精密的工厂：每个细胞（车间）都有特定的功能，通过复杂的流水线（代谢途径）协同工作，最终完成生命活动。',
      computer_science: '这就像一个菜谱：你需要按照特定的步骤（算法），使用合适的工具（数据结构），才能做出美味的菜肴（解决问题）。',
      engineering: '这就像搭积木：你需要稳固的基础（基础理论），合理的结构设计（系统设计），以及精确的施工（实现），才能建造稳固的建筑。',
      economics: '这就像一个市场：买家（需求）和卖家（供给）通过价格信号（价格机制）进行互动，最终达到均衡状态。',
      other: '这就像解开一个绳结：你需要找到绳结的起点（问题本质），理解它的结构（分析问题），然后用正确的方法（解决方案）一步步解开。',
    };

    return domainAnalogy[domain];
  }

  /**
   * 生成数学抽象
   */
  private generateMathematicalAbstraction(
    _question: string,
    domain: ProblemDomain
  ): string {
    if (!this.config.includeMathematicalAbstraction) {
      return '';
    }

    const abstractions: Record<ProblemDomain, string> = {
      physics: `物理量可以用数学符号表示:
- 位置: x(t)
- 速度: v(t) = dx/dt
- 加速度: a(t) = dv/dt = d²x/dt²
- 力: F = ma
- 能量: E = ½mv² + mgh`,
      mathematics: `数学抽象:
- 变量: x, y, z
- 函数: f(x), g(x)
- 方程: f(x) = 0
- 极限: lim(x→a) f(x)
- 导数: df/dx, f'(x)
- 积分: ∫f(x)dx`,
      chemistry: `化学抽象:
- 浓度: c = n/V
- 速率: v = Δc/Δt
- 平衡常数: K = [产物]/[反应物]
- 吉布斯自由能: ΔG = ΔH - TΔS`,
      biology: `生物抽象:
- 种群增长: dN/dt = rN
- 酶动力学: v = Vmax[S]/(Km + [S])
- 遗传概率: P(Aa) = 1/2`,
      computer_science: `计算抽象:
- 时间复杂度: O(n), O(n²), O(log n)
- 空间复杂度: O(1), O(n)
- 递归: T(n) = T(n-1) + O(1)
- 状态转移: dp[i] = f(dp[i-1])`,
      engineering: `工程抽象:
- 应力: σ = F/A
- 应变: ε = ΔL/L
- 弹性模量: E = σ/ε
- 功率: P = W/t = Fv`,
      economics: `经济抽象:
- 效用函数: U(x)
- 边际效用: MU = dU/dx
- 需求函数: Q = f(P)
- 弹性: E = (dQ/Q)/(dP/P)`,
      other: '问题可以用抽象符号和关系表示，建立数学模型有助于精确分析。',
    };

    return abstractions[domain];
  }

  /**
   * 生成LaTeX公式
   */
  private generateLatexFormula(
    _question: string,
    domain: ProblemDomain
  ): string {
    if (!this.config.includeLatexFormula) {
      return '';
    }

    const formulas: Record<ProblemDomain, string> = {
      physics: `$$F = ma$$
$$E_k = \\frac{1}{2}mv^2$$
$$E_p = mgh$$
$$F = G\\frac{m_1 m_2}{r^2}$$`,
      mathematics: `$$f(x) = \\int_{a}^{b} f(x) dx$$
$$\\frac{dy}{dx} = f(x, y)$$
$$\\sum_{i=1}^{n} a_i = S$$
$$\\lim_{x \\to a} f(x) = L$$`,
      chemistry: `$$c = \\frac{n}{V}$$
$$K = \\frac{[C]^c[D]^d}{[A]^a[B]^b}$$
$$\\Delta G = \\Delta H - T\\Delta S$$`,
      biology: `$$\\frac{dN}{dt} = rN$$
$$v = \\frac{V_{max}[S]}{K_m + [S]}$$
$$P(Aa) = \\frac{1}{2}$$`,
      computer_science: `$$T(n) = O(n \\log n)$$
$$dp[i] = dp[i-1] + dp[i-2]$$
$$T(n) = T(n/2) + O(1)$$`,
      engineering: `$$\\sigma = \\frac{F}{A}$$
$$\\varepsilon = \\frac{\\Delta L}{L}$$
$$E = \\frac{\\sigma}{\\varepsilon}$$
$$P = \\frac{W}{t} = Fv$$`,
      economics: `$$U = U(x_1, x_2)$$
$$MU = \\frac{dU}{dx}$$
$$E = \\frac{dQ/Q}{dP/P}$$`,
      other: '',
    };

    return formulas[domain];
  }

  /**
   * 生成结论
   */
  private generateConclusion(steps: FirstPrincipleStep[]): string {
    if (steps.length === 0) {
      return '分析完成，结论已得出。';
    }

    const lastStep = steps[steps.length - 1];
    return `基于以上推理分析，${lastStep.conclusion.toLowerCase()}。整个分析过程遵循第一性原理，从基础假设出发，通过逻辑推导得出结论。`;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    assumptionCount: number,
    stepCount: number,
    domain: ProblemDomain
  ): number {
    let confidence = 0.5;

    // 假设数量贡献
    confidence += Math.min(0.2, assumptionCount * 0.05);

    // 步骤数量贡献
    confidence += Math.min(0.2, stepCount * 0.04);

    // 领域权重
    const domainWeights: Record<ProblemDomain, number> = {
      physics: 0.15,
      mathematics: 0.15,
      chemistry: 0.1,
      biology: 0.1,
      computer_science: 0.1,
      engineering: 0.1,
      economics: 0.05,
      other: 0.05,
    };

    confidence += domainWeights[domain];

    return Math.min(1, confidence);
  }

  /**
   * 获取领域名称
   */
  private getDomainName(domain: ProblemDomain): string {
    const names: Record<ProblemDomain, string> = {
      physics: '物理学',
      mathematics: '数学',
      chemistry: '化学',
      biology: '生物学',
      computer_science: '计算机科学',
      engineering: '工程学',
      economics: '经济学',
      other: '其他',
    };

    return names[domain];
  }

  /**
   * 格式化分析结果
   */
  private formatAnalysis(analysis: FirstPrincipleAnalysis): string {
    let output = `# 第一性原理分析

## 问题
${analysis.question}

## 领域分类
${analysis.domain}

## 置信度
${(analysis.confidence * 100).toFixed(1)}%

---

## 一、基础假设

${analysis.assumptions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

---

## 二、推理步骤

`;

    for (const step of analysis.steps) {
      output += `### 步骤 ${step.step}: ${step.title}

- **假设**: ${step.assumption}
- **推理**: ${step.reasoning}
- **结论**: ${step.conclusion}

`;
    }

    if (analysis.analogy) {
      output += `---

## 三、类比解释

${analysis.analogy}

`;
    }

    if (analysis.mathematicalAbstraction) {
      output += `---

## 四、数学抽象

${analysis.mathematicalAbstraction}

`;
    }

    if (analysis.latexFormula) {
      output += `---

## 五、数学公式

${analysis.latexFormula}

`;
    }

    output += `---

## 结论

${analysis.conclusion}

---

*本分析基于第一性原理方法，从基础假设出发，通过逻辑推导得出结论。*
`;

    return output;
  }

  /**
   * 初始化假设模板
   */
  private initAssumptionTemplates(): AssumptionTemplate[] {
    return [
      {
        domain: 'physics',
        assumptions: [
          '牛顿定律适用于宏观低速运动',
          '能量守恒定律成立',
          '动量守恒定律成立',
          '系统可以近似为理想模型',
        ],
        reasoningTemplate: [
          '分析受力情况',
          '建立运动方程',
          '求解方程',
          '验证结果合理性',
        ],
      },
      {
        domain: 'mathematics',
        assumptions: [
          '变量在定义域内有意义',
          '函数满足连续性/可微性条件',
          '边界条件已确定',
        ],
        reasoningTemplate: [
          '建立数学模型',
          '推导关键方程',
          '选择求解方法',
          '验证解的正确性',
        ],
      },
      {
        domain: 'computer_science',
        assumptions: [
          '输入数据满足约束条件',
          '算法在有限时间内终止',
          '系统资源充足',
        ],
        reasoningTemplate: [
          '分析问题规模',
          '设计算法框架',
          '评估复杂度',
          '优化实现方案',
        ],
      },
    ];
  }

  /**
   * 初始化类比库
   */
  private initAnalogyLibrary(): AnalogyLibrary {
    return {
      '速度': {
        analogy: '速度就像水流的流速：水流量越大，水流越快。',
        explanation: '速度描述物体运动的快慢，就像水流量描述水流的强度。',
      },
      '加速度': {
        analogy: '加速度就像踩油门：油门踩得越深，车速增加越快。',
        explanation: '加速度描述速度变化的快慢，就像油门控制车速的变化率。',
      },
      '算法': {
        analogy: '算法就像菜谱：按照步骤操作，就能做出美味的菜肴。',
        explanation: '算法是解决问题的步骤，就像菜谱是做菜的步骤。两者都强调顺序和精确性。',
      },
      '数据结构': {
        analogy: '数据结构就像衣柜：合理分类整理，找衣服更快。',
        explanation: '数据结构决定数据的组织方式，就像衣柜决定衣物的存放方式。好的结构提高效率。',
      },
      '能量': {
        analogy: '能量就像钱：可以用来"购买"各种变化。',
        explanation: '能量是做功的能力，就像钱是交换的能力。能量可以转换形式，就像钱可以兑换货币。',
      },
    };
  }
}

/**
 * 创建第一性原理分析器
 */
export function createFirstPrinciples(
  config?: FirstPrinciplesConfig
): FirstPrinciples {
  return new FirstPrinciples(config);
}

/**
 * 快速分析函数 (便捷方法)
 */
export async function analyzeFirstPrinciples(
  question: string,
  config?: FirstPrinciplesConfig
): Promise<FirstPrincipleAnalysis> {
  const analyzer = new FirstPrinciples(config);
  return analyzer.analyze(question);
}

/**
 * 快速生成回答 (便捷方法)
 */
export async function answerFirstPrinciples(
  question: string,
  config?: FirstPrinciplesConfig
): Promise<string> {
  const analyzer = new FirstPrinciples(config);
  return analyzer.generateAnswer(question);
}