/**
 * 图谱类型定义
 * 用于星空知识图谱可视化
 */

// ============================================
// 基础图谱类型
// ============================================

/**
 * 基础图谱节点接口
 * 提供节点的基础属性，供 ExtendedGraphNode 继承使用
 */
export interface GraphNode {
  /** 节点唯一标识符 */
  id: string;
  /** 节点显示标签 */
  label?: string;
  /** 节点 x 坐标 (布局位置) */
  x?: number;
  /** 节点 y 坐标 (布局位置) */
  y?: number;
}

/**
 * 基础图谱边接口
 * 提供边的基础属性，供 ExtendedGraphEdge 继承使用
 */
export interface GraphEdge {
  /** 边唯一标识符 */
  id: string;
  /** 源节点 ID */
  source: string;
  /** 目标节点 ID */
  target: string;
}

// ============================================
// 节点类型枚举
// ============================================

/** 节点类型 */
export enum NodeType {
  /** 文档节点 */
  Document = 'document',
  /** 网页节点 */
  WebPage = 'webpage',
  /** 图片节点 */
  Image = 'image',
  /** 音频节点 */
  Audio = 'audio',
  /** 视频节点 */
  Video = 'video',
  /** 想法节点 */
  Idea = 'idea',
  /** 问题节点 */
  Problem = 'problem',
  /** 标注节点 */
  Annotation = 'annotation',
  /** 研究节点 */
  Research = 'research',
}

// ============================================
// 边类型枚举
// ============================================

/** 边类型 */
export enum EdgeType {
  /** 引用关系 */
  Reference = 'reference',
  /** 证伪关系 */
  Falsification = 'falsification',
  /** 推导关系 */
  Derivation = 'derivation',
  /** 标注关系 */
  Annotation = 'annotation',
  /** 关联关系 */
  Association = 'association',
  /** 层级关系 */
  Hierarchy = 'hierarchy',
}

// ============================================
// 节点样式配置
// ============================================

/** 节点视觉样式 */
export interface NodeStyleConfig {
  /** 节点颜色 */
  color: string;
  /** 节点大小 */
  size: number;
  /** 节点形状 */
  shape: 'circle' | 'star' | 'diamond' | 'triangle' | 'square';
  /** 是否发光 */
  glow: boolean;
  /** 发光颜色 */
  glowColor: string;
  /** 发光强度 */
  glowIntensity: number;
}

/** 默认节点样式配置 */
export const DEFAULT_NODE_STYLES: Record<NodeType, NodeStyleConfig> = {
  [NodeType.Document]: {
    color: '#4A90D9',
    size: 12,
    shape: 'circle',
    glow: true,
    glowColor: '#4A90D9',
    glowIntensity: 0.3,
  },
  [NodeType.WebPage]: {
    color: '#50C878',
    size: 10,
    shape: 'square',
    glow: true,
    glowColor: '#50C878',
    glowIntensity: 0.2,
  },
  [NodeType.Image]: {
    color: '#FFB347',
    size: 8,
    shape: 'diamond',
    glow: false,
    glowColor: '#FFB347',
    glowIntensity: 0.1,
  },
  [NodeType.Audio]: {
    color: '#9B59B6',
    size: 8,
    shape: 'triangle',
    glow: false,
    glowColor: '#9B59B6',
    glowIntensity: 0.1,
  },
  [NodeType.Video]: {
    color: '#E74C3C',
    size: 10,
    shape: 'square',
    glow: true,
    glowColor: '#E74C3C',
    glowIntensity: 0.2,
  },
  [NodeType.Idea]: {
    color: '#FFD700',
    size: 14,
    shape: 'star',
    glow: true,
    glowColor: '#FFD700',
    glowIntensity: 0.5,
  },
  [NodeType.Problem]: {
    color: '#FF6B6B',
    size: 16,
    shape: 'star',
    glow: true,
    glowColor: '#FF6B6B',
    glowIntensity: 0.6,
  },
  [NodeType.Annotation]: {
    color: '#BB8FCE',
    size: 6,
    shape: 'circle',
    glow: false,
    glowColor: '#BB8FCE',
    glowIntensity: 0.1,
  },
  [NodeType.Research]: {
    color: '#48C9B0',
    size: 13,
    shape: 'diamond',
    glow: true,
    glowColor: '#48C9B0',
    glowIntensity: 0.4,
  },
};

// ============================================
// 星座信息类型
// ============================================

/** 星座信息 */
export interface ConstellationInfo {
  /** 星座ID */
  id: string;
  /** 星座名称 */
  name: string;
  /** 星座中心节点 */
  centerNode: string;
  /** 星座成员节点列表 */
  members: string[];
  /** 星座主题/标签 */
  theme: string;
  /** 星座颜色 */
  color: string;
  /** 星座节点数量 */
  nodeCount: number;
  /** 星座边界半径 */
  radius: number;
}

// ============================================
// 星系信息类型
// ============================================

/** 星系信息 */
export interface GalaxyInfo {
  /** 星系ID */
  id: string;
  /** 星系名称 */
  name: string;
  /** 包含的星座列表 */
  constellations: ConstellationInfo[];
  /** 星系中心点 */
  center: { x: number; y: number };
  /** 星系半径 */
  radius: number;
  /** 星系颜色 */
  color: string;
}

// ============================================
// 扩展图谱节点
// ============================================

/** 扩展图谱节点 */
export interface ExtendedGraphNode extends GraphNode {
  /** 节点类型 */
  nodeType: NodeType;
  /** 重要性等级 */
  importance: 'high' | 'medium' | 'low';
  /** 紧急度 */
  urgency: 'urgent' | 'normal' | 'not-urgent';
  /** 所属星座ID */
  constellationId?: string;
  /** 所属星系ID */
  galaxyId?: string;
  /** 标签列表 */
  labels?: string[];
  /** 创建时间 */
  createdAt?: number;
  /** 更新时间 */
  updatedAt?: number;
}

// ============================================
// 扩展图谱边
// ============================================

/** 扩展图谱边 */
export interface ExtendedGraphEdge extends GraphEdge {
  /** 边类型 */
  edgeType: EdgeType;
  /** 权重 */
  weight?: number;
  /** 是否为跨星座边 */
  isCrossConstellation?: boolean;
}

// ============================================
// 图谱数据
// ============================================

/** 图谱数据 */
export interface GraphData {
  nodes: ExtendedGraphNode[];
  edges: ExtendedGraphEdge[];
}

// ============================================
// 星空布局配置
// ============================================

/** 星空布局配置 */
export interface StarfieldLayoutConfig {
  /** 画布宽度 */
  width: number;
  /** 画布高度 */
  height: number;
  /** 节点间距 */
  nodeSpacing: number;
  /** 星座间距 */
  constellationSpacing: number;
  /** 引力强度 */
  gravity: number;
  /** 斥力强度 */
  repulsion: number;
  /** 摩擦系数 */
  friction: number;
  /** 是否启用动画 */
  animate: boolean;
  /** 动画时长 */
  animationDuration: number;
  /** 是否使用WebGL渲染 */
  useWebGL: boolean;
}

/** 默认星空布局配置 */
export const DEFAULT_STARFIELD_CONFIG: StarfieldLayoutConfig = {
  width: 1200,
  height: 800,
  nodeSpacing: 30,
  constellationSpacing: 150,
  gravity: 0.1,
  repulsion: 100,
  friction: 0.85,
  animate: true,
  animationDuration: 1000,
  useWebGL: true,
};

// ============================================
// 布局结果
// ============================================

/** 节点位置 */
export interface NodePosition {
  x: number;
  y: number;
  z?: number;
}

/** 布局结果 */
export interface LayoutResult {
  /** 节点位置映射 */
  nodePositions: Map<string, NodePosition>;
  /** 星座列表 */
  constellations: ConstellationInfo[];
  /** 星系列表 */
  galaxies: GalaxyInfo[];
}

// ============================================
// 交互状态
// ============================================

/** 交互状态 */
export interface InteractionState {
  /** 选中的节点ID */
  selectedNode?: string;
  /** 悬停的节点ID */
  hoveredNode?: string;
  /** 拖拽的节点ID */
  draggedNode?: string;
  /** 当前缩放比例 */
  zoom: number;
  /** 当前平移偏移 */
  pan: { x: number; y: number };
  /** 是否正在拖拽 */
  isDragging: boolean;
}

// ============================================
// 星空背景配置
// ============================================

/** 星空背景配置 */
export interface StarrySkyConfig {
  /** 星星数量 */
  starCount: number;
  /** 星星最小大小 */
  minStarSize: number;
  /** 星星最大大小 */
  maxStarSize: number;
  /** 星星最小透明度 */
  minOpacity: number;
  /** 星星最大透明度 */
  maxOpacity: number;
  /** 是否启用闪烁 */
  twinkle: boolean;
  /** 闪烁速度 */
  twinkleSpeed: number;
  /** 是否启用流星 */
  shootingStar: boolean;
  /** 流星频率 */
  shootingStarFrequency: number;
}

/** 默认星空背景配置 */
export const DEFAULT_STARRY_SKY_CONFIG: StarrySkyConfig = {
  starCount: 200,
  minStarSize: 0.5,
  maxStarSize: 2.5,
  minOpacity: 0.3,
  maxOpacity: 1.0,
  twinkle: true,
  twinkleSpeed: 0.5,
  shootingStar: true,
  shootingStarFrequency: 0.02,
};

// ============================================
// 星座命名池
// ============================================

/** 星座名称池 */
export const CONSTELLATION_NAMES: string[] = [
  // 西方星座
  'Andromeda', 'Antlia', 'Apus', 'Aquarius', 'Aquila', 'Ara', 'Aries', 'Auriga',
  'Bootes', 'Caelum', 'Camelopardalis', 'Cancer', 'Canes Venatici', 'Canis Major',
  'Canis Minor', 'Capricornus', 'Carina', 'Cassiopeia', 'Centaurus', 'Cepheus',
  'Cetus', 'Chamaeleon', 'Circinus', 'Columba', 'Coma Berenices', 'Corona Australis',
  'Corona Borealis', 'Corvus', 'Crater', 'Crux', 'Cygnus', 'Delphinus', 'Dorado',
  'Draco', 'Equuleus', 'Eridanus', 'Fornax', 'Gemini', 'Grus', 'Hercules', 'Horologium',
  'Hydra', 'Hydrus', 'Indus', 'Lacerta', 'Leo', 'Leo Minor', 'Lepus', 'Libra', 'Lupus',
  'Lynx', 'Lyra', 'Mensa', 'Microscopium', 'Monoceros', 'Musca', 'Norma', 'Octans',
  'Ophiuchus', 'Orion', 'Pavo', 'Pegasus', 'Perseus', 'Phoenix', 'Pictor', 'Pisces',
  'Piscis Austrinus', 'Puppis', 'Pyxis', 'Reticulum', 'Sagitta', 'Sagittarius',
  'Scorpius', 'Sculptor', 'Scutum', 'Serpens', 'Sextans', 'Taurus', 'Telescopium',
  'Triangulum', 'Tucana', 'Ursa Major', 'Ursa Minor', 'Vela', 'Virgo', 'Volans',
  'Vulpecula',
  // 中国星官（补充）
  '紫微', '太微', '天市', '角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿',
  '斗宿', '牛宿', '女宿', '虚宿', '危宿', '室宿', '壁宿', '奎宿', '娄宿', '胃宿',
  '昴宿', '毕宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '张宿', '翼宿',
  '轸宿',
];

// ============================================
// 边样式配置
// ============================================

/** 边样式配置 */
export interface EdgeStyleConfig {
  /** 边颜色 */
  color: string;
  /** 边宽度 */
  width: number;
  /** 边类型 */
  type: 'line' | 'curve' | 'dashed' | 'dotted';
  /** 是否显示箭头 */
  arrow: boolean;
  /** 是否发光 */
  glow: boolean;
  /** 发光颜色 */
  glowColor: string;
  /** 发光强度 */
  glowIntensity: number;
}

/** 默认边样式配置 */
export const DEFAULT_EDGE_STYLES: Record<EdgeType, EdgeStyleConfig> = {
  [EdgeType.Reference]: {
    color: '#87CEEB',
    width: 1.5,
    type: 'line',
    arrow: true,
    glow: false,
    glowColor: '#87CEEB',
    glowIntensity: 0.1,
  },
  [EdgeType.Falsification]: {
    color: '#FF6B6B',
    width: 2,
    type: 'dashed',
    arrow: true,
    glow: true,
    glowColor: '#FF6B6B',
    glowIntensity: 0.3,
  },
  [EdgeType.Derivation]: {
    color: '#4ECDC4',
    width: 1.5,
    type: 'curve',
    arrow: true,
    glow: true,
    glowColor: '#4ECDC4',
    glowIntensity: 0.2,
  },
  [EdgeType.Annotation]: {
    color: '#BB8FCE',
    width: 1,
    type: 'dotted',
    arrow: false,
    glow: false,
    glowColor: '#BB8FCE',
    glowIntensity: 0.1,
  },
  [EdgeType.Association]: {
    color: '#95A5A6',
    width: 1,
    type: 'line',
    arrow: false,
    glow: false,
    glowColor: '#95A5A6',
    glowIntensity: 0.1,
  },
  [EdgeType.Hierarchy]: {
    color: '#F39C12',
    width: 2,
    type: 'curve',
    arrow: true,
    glow: true,
    glowColor: '#F39C12',
    glowIntensity: 0.2,
  },
};