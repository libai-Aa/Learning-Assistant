/**
 * 星座状态管理 (ConstellationStore)
 *
 * @description 以问题/想法为单位，用星座/星系表示知识结构。
 *   每个问题是一颗"恒星"（中心星），其子问题、假设、证伪结果是"行星"，
 *   关系用"星座连线"表示。供 Research 区和星空图谱共享。
 *
 * 持久化键：`constellation-storage`
 *
 * @module src/stores/constellation-store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

// ============ 类型定义 ============

/** 星座节点类型 */
export type StarType = 'question' | 'sub-question' | 'hypothesis' | 'evidence' | 'conclusion' | 'idea';

/** 星座节点（一颗星） */
export interface StarNode {
  /** 唯一ID */
  id: string;
  /** 显示标签 */
  label: string;
  /** 节点类型 */
  type: StarType;
  /** 所属星系ID（同一个问题/想法的节点属于同一星系） */
  constellationId: string;
  /** x 坐标 (0-100 百分比) */
  x: number;
  /** y 坐标 (0-100 百分比) */
  y: number;
  /** 星体大小 (3-12) */
  size: number;
  /** 分类（用于颜色） */
  category: string;
  /** 详细内容（可选） */
  detail?: string;
  /** 方法论（可选，如 socratic/five-whys/first-principles） */
  methodology?: string;
  /** 状态（可选，如 discovered/researching/verified/falsified） */
  status?: string;
  /** 创建时间 */
  createdAt: string;
}

/** 星座连线（星系内部的边） */
export interface StarEdge {
  /** 唯一ID */
  id: string;
  /** 起点节点ID */
  from: string;
  /** 终点节点ID */
  to: string;
  /** 关系类型（如 "追问"、"假设"、"证伪"、"支持"） */
  relation?: string;
}

/** 星系（一个问题/想法的完整探索结构） */
export interface Constellation {
  /** 唯一ID */
  id: string;
  /** 星系名称（问题/想法的内容） */
  name: string;
  /** 问题类型 */
  questionType?: string;
  /** 使用的方法论 */
  methodology?: string;
  /** 状态 */
  status?: string;
  /** 创建时间 */
  createdAt: string;
}

// ============ Store 状态 ============

interface ConstellationState {
  /** 所有星系 */
  constellations: Constellation[];
  /** 所有星节点 */
  stars: StarNode[];
  /** 所有连线 */
  edges: StarEdge[];

  // ===== 操作 =====

  /** 创建新星系（输入一个问题/想法），返回星系ID */
  addConstellation: (name: string, questionType?: string, methodology?: string) => string;

  /** 删除星系（同时删除其所有星和边） */
  removeConstellation: (id: string) => void;

  /** 向星系添加一颗星，自动计算位置（围绕中心星分布） */
  addStar: (constellationId: string, label: string, type: StarType, category: string, opts?: {
    detail?: string;
    methodology?: string;
    status?: string;
    size?: number;
  }) => string;

  /** 向星系添加多颗星（批量） */
  addStars: (constellationId: string, stars: Array<{ label: string; type: StarType; category: string; detail?: string }>) => string[];

  /** 添加连线 */
  addEdge: (from: string, to: string, relation?: string) => void;

  /** 更新星的状态 */
  updateStarStatus: (starId: string, status: string) => void;

  /** 删除单颗星（同时删除其所有关联边） */
  removeStar: (starId: string) => void;

  /** 更新星系状态 */
  updateConstellationStatus: (constellationId: string, status: string) => void;

  /** 获取星系的所有星 */
  getStarsByConstellation: (constellationId: string) => StarNode[];

  /** 获取星系的所有边 */
  getEdgesByConstellation: (constellationId: string) => StarEdge[];

  /** 清空所有 */
  clearAll: () => void;
}

// ============ 辅助函数 ============

/** 生成唯一ID */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/** 计算新星在星系中的位置（围绕中心星螺旋分布） */
function calcStarPosition(existingCount: number, isCenter: boolean): { x: number; y: number } {
  if (isCenter || existingCount === 0) {
    // 中心星：随机位置在 30-70 范围
    return {
      x: 30 + Math.random() * 40,
      y: 30 + Math.random() * 40,
    };
  }
  // 周围星：螺旋分布
  const angle = (existingCount - 1) * (Math.PI * 2 / 5); // 每颗星间隔72度
  const radius = 8 + Math.floor((existingCount - 1) / 5) * 6; // 每5颗星增加一圈
  const centerX = 50;
  const centerY = 50;
  return {
    x: Math.max(5, Math.min(95, centerX + Math.cos(angle) * radius)),
    y: Math.max(5, Math.min(95, centerY + Math.sin(angle) * radius)),
  };
}

// ============ 文件持久化 ============

/** 星座数据文件名 */
const CONSTELLATION_DATA_FILENAME = 'constellations.json';

/** 防抖保存定时器 */
let saveToFileTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 从磁盘文件加载星座数据
 * 用于在 localStorage 被清空时从文件恢复数据
 */
async function loadFromFile(): Promise<{
  stars: StarNode[];
  edges: StarEdge[];
  constellations: Constellation[];
} | null> {
  try {
    const text = await invoke<string>('read_json_file', { filename: CONSTELLATION_DATA_FILENAME });
    const parsed = JSON.parse(text) as {
      stars?: StarNode[];
      edges?: StarEdge[];
      constellations?: Constellation[];
    };
    if (
      parsed &&
      Array.isArray(parsed.stars) &&
      Array.isArray(parsed.edges) &&
      Array.isArray(parsed.constellations)
    ) {
      return {
        stars: parsed.stars,
        edges: parsed.edges,
        constellations: parsed.constellations,
      };
    }
    return null;
  } catch (error) {
    console.error('从文件加载星座数据失败:', error);
    return null;
  }
}

/**
 * 防抖保存星座数据到磁盘文件
 * 在每次修改后延迟1秒写入，避免频繁IO
 */
function debouncedSaveToFile(
  stars: StarNode[],
  edges: StarEdge[],
  constellations: Constellation[],
): void {
  if (saveToFileTimer) {
    clearTimeout(saveToFileTimer);
  }
  saveToFileTimer = setTimeout(async () => {
    try {
      await invoke('write_json_file', {
        filename: CONSTELLATION_DATA_FILENAME,
        content: JSON.stringify({ stars, edges, constellations }, null, 2),
      });
    } catch (error) {
      console.error('保存星座数据到文件失败:', error);
    }
  }, 1000);
}

// ============ 星类型颜色映射 ============

export const STAR_TYPE_COLORS: Record<StarType, string> = {
  question: '#60a5fa',       // 蓝色 - 问题
  'sub-question': '#93c5fd', // 浅蓝 - 子问题
  hypothesis: '#fbbf24',     // 金色 - 假设
  evidence: '#34d399',       // 绿色 - 证据
  conclusion: '#a78bfa',     // 紫色 - 结论
  idea: '#f472b6',           // 粉色 - 想法
};

export const STAR_TYPE_ICONS: Record<StarType, string> = {
  question: '❓',
  'sub-question': '🔹',
  hypothesis: '💡',
  evidence: '📊',
  conclusion: '✅',
  idea: '✨',
};

// ============ Store ============

export const useConstellationStore = create<ConstellationState>()(
  persist(
    (set, get) => ({
      constellations: [],
      stars: [],
      edges: [],

      addConstellation: (name, questionType, methodology) => {
        const id = genId('const');
        const constellation: Constellation = {
          id,
          name,
          questionType,
          methodology,
          status: 'discovered',
          createdAt: new Date().toISOString(),
        };
        // 同时创建中心星（问题本身）
        const pos = calcStarPosition(0, true);
        const centerStar: StarNode = {
          id: genId('star'),
          label: name,
          type: 'question',
          constellationId: id,
          x: pos.x,
          y: pos.y,
          size: 10,
          category: questionType || '问题',
          methodology,
          status: 'discovered',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          constellations: [...state.constellations, constellation],
          stars: [...state.stars, centerStar],
        }));
        return id;
      },

      removeConstellation: (id) => {
        set((state) => {
          const starIds = new Set(
            state.stars.filter((s) => s.constellationId === id).map((s) => s.id)
          );
          return {
            constellations: state.constellations.filter((c) => c.id !== id),
            stars: state.stars.filter((s) => s.constellationId !== id),
            edges: state.edges.filter((e) => !starIds.has(e.from) && !starIds.has(e.to)),
          };
        });
      },

      addStar: (constellationId, label, type, category, opts) => {
        const state = get();
        const existingCount = state.stars.filter((s) => s.constellationId === constellationId).length;
        const pos = calcStarPosition(existingCount, false);
        const starId = genId('star');
        // 存储保护：detail截断到500字，防止LLM大段文本撑爆localStorage
        const safeDetail = opts?.detail ? (opts.detail.length > 500 ? opts.detail.slice(0, 500) + '…(已截断)' : opts.detail) : undefined;
        const star: StarNode = {
          id: starId,
          label,
          type,
          constellationId,
          x: pos.x,
          y: pos.y,
          size: opts?.size ?? (type === 'conclusion' ? 8 : 6),
          category,
          detail: safeDetail,
          methodology: opts?.methodology,
          status: opts?.status,
          createdAt: new Date().toISOString(),
        };
        // 自动连线到中心星
        const centerStar = state.stars.find(
          (s) => s.constellationId === constellationId && s.type === 'question'
        );
        const newEdges: StarEdge[] = [];
        if (centerStar && centerStar.id !== starId) {
          newEdges.push({
            id: genId('edge'),
            from: centerStar.id,
            to: starId,
            relation: type === 'hypothesis' ? '假设' : type === 'evidence' ? '证据' : '追问',
          });
        }
        // 存储保护：stars上限1000个(约1MB)，edges上限2000条，超出归档最旧星座到磁盘
        let newStars = [...state.stars, star];
        const maxStars = 1000;
        if (newStars.length > maxStars) {
          // 找出最旧星座，整星座归档到磁盘
          const oldestStar = newStars.reduce((oldest, s) =>
            !oldest || s.createdAt < oldest.createdAt ? s : oldest
          );
          const archiveId = oldestStar?.constellationId;
          if (archiveId) {
            const toArchive = newStars.filter(s => s.constellationId === archiveId);
            const relatedEdges = state.edges.filter(e =>
              toArchive.some(as => as.id === e.from || as.id === e.to)
            );
            // 归档到磁盘：filename用下划线替代斜杠避免Rust端拒绝；
            // 只有写入成功后才从内存删除，失败则打印错误并保留在内存中
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('write_json_file', {
                filename: `archive_${archiveId}.json`,
                content: JSON.stringify({ stars: toArchive, edges: relatedEdges }, null, 2)
              }).then(() => {
                // 写入成功，从内存删除该星座
                set((state) => ({
                  stars: state.stars.filter(s => s.constellationId !== archiveId),
                }));
              }).catch((error) => {
                console.error('归档星座到磁盘失败，保留在内存中:', error);
              });
            });
            // 不在此处立即删除，等归档成功后再删
          }
        }
        let newAllEdges = [...state.edges, ...newEdges];
        if (newAllEdges.length > 2000) {
          newAllEdges = newAllEdges.slice(newAllEdges.length - 2000);
        }
        set({
          stars: newStars,
          edges: newAllEdges,
        });
        return starId;
      },

      addStars: (constellationId, starsData) => {
        const ids: string[] = [];
        for (const sd of starsData) {
          const id = get().addStar(constellationId, sd.label, sd.type, sd.category, { detail: sd.detail });
          ids.push(id);
        }
        return ids;
      },

      addEdge: (from, to, relation) => {
        set((state) => ({
          edges: [...state.edges, { id: genId('edge'), from, to, relation }],
        }));
      },

      updateStarStatus: (starId, status) => {
        set((state) => ({
          stars: state.stars.map((s) => (s.id === starId ? { ...s, status } : s)),
        }));
      },

      removeStar: (starId) => {
        set((state) => ({
          stars: state.stars.filter((s) => s.id !== starId),
          edges: state.edges.filter((e) => e.from !== starId && e.to !== starId),
        }));
      },

      updateConstellationStatus: (constellationId, status) => {
        set((state) => ({
          constellations: state.constellations.map((c) =>
            c.id === constellationId ? { ...c, status } : c
          ),
        }));
      },

      getStarsByConstellation: (constellationId) => {
        return get().stars.filter((s) => s.constellationId === constellationId);
      },

      getEdgesByConstellation: (constellationId) => {
        const state = get();
        const starIds = new Set(
          state.stars.filter((s) => s.constellationId === constellationId).map((s) => s.id)
        );
        return state.edges.filter((e) => starIds.has(e.from) && starIds.has(e.to));
      },

      clearAll: () => {
        set({ constellations: [], stars: [], edges: [] });
      },
    }),
    {
      name: 'constellation-storage',
      version: 1,
    }
  )
);

// ============ 文件持久化初始化 ============

/**
 * 初始化文件持久化：
 * 1. 从磁盘文件加载星座数据（若 localStorage 被清空，可从文件恢复）
 * 2. 订阅 store 变化，防抖保存到磁盘文件
 *
 * 说明：localStorage 作为快速缓存仍由 zustand persist 维护，
 * 文件持久化作为兜底，确保 WebView2 缓存清空后数据不丢失。
 */
loadFromFile().then((data) => {
  if (data) {
    useConstellationStore.setState({
      stars: data.stars,
      edges: data.edges,
      constellations: data.constellations,
    });
  }
});

useConstellationStore.subscribe((state) => {
  debouncedSaveToFile(state.stars, state.edges, state.constellations);
});