/**
 * Agent 夜间定时更新模块
 * 每晚凌晨 2 点自动更新知识连接方式
 *
 * 设计要点：
 * - 用 setInterval 每分钟检查当前时间，到 02:00 触发更新
 * - 用 lastTriggerDate 防止同一分钟内重复触发
 * - 所有外部调用（AMiner / LLM / 文件 IO）已在 knowledge-updater 内部 try-catch，
 *   本模块再包一层 try-catch，保证定时器永不中断
 */

import {
  updateKnowledgeBase,
  saveUpdateLog,
  type KnowledgeUpdateResult,
} from './knowledge-updater';

/** 定时器 ID */
let nightlyTimerId: ReturnType<typeof setInterval> | null = null;

/** 上次更新时间（ISO） */
let lastUpdateTime: string | null = null;

/** 上次更新结果 */
let lastUpdateResult: KnowledgeUpdateResult | null = null;

/** 定时器检查间隔（毫秒）：每分钟检查一次 */
const CHECK_INTERVAL_MS = 60_000;

/** 触发小时（凌晨 2 点） */
const TRIGGER_HOUR = 2;

/** 触发分钟 */
const TRIGGER_MINUTE = 0;

/**
 * 执行夜间更新
 * 调用 AMiner 获取最新论文 → 分析知识库 → 生成更新建议 → 保存日志
 *
 * @returns 更新结果（始终 resolve，不抛异常）
 */
export async function runNightlyUpdate(): Promise<KnowledgeUpdateResult> {
  console.log('开始执行夜间知识库更新...');

  const result = await updateKnowledgeBase();
  await saveUpdateLog(result);

  lastUpdateTime = new Date().toISOString();
  lastUpdateResult = result;

  console.log('夜间更新完成:', result.summary);
  return result;
}

/**
 * 启动夜间定时器
 * 每分钟检查当前时间，到凌晨 2 点触发更新
 *
 * @param onUpdate 可选回调，更新完成后调用（用于 UI 刷新）
 */
export function startNightlyTimer(
  onUpdate?: (result: KnowledgeUpdateResult) => void,
): void {
  if (nightlyTimerId) {
    console.warn('夜间定时器已在运行');
    return;
  }

  let lastTriggerDate = new Date().toDateString();

  nightlyTimerId = setInterval(async () => {
    const now = new Date();

    // 凌晨 2 点触发（且今天还没触发过）
    if (
      now.getHours() === TRIGGER_HOUR &&
      now.getMinutes() === TRIGGER_MINUTE
    ) {
      const today = now.toDateString();
      if (today !== lastTriggerDate) {
        lastTriggerDate = today;
        try {
          const result = await runNightlyUpdate();
          onUpdate?.(result);
        } catch (e) {
          console.error('夜间更新失败:', e);
        }
      }
    }
  }, CHECK_INTERVAL_MS);

  console.log('夜间定时器已启动，将在凌晨 2 点自动更新知识库');
}

/**
 * 停止夜间定时器
 */
export function stopNightlyTimer(): void {
  if (nightlyTimerId) {
    clearInterval(nightlyTimerId);
    nightlyTimerId = null;
    console.log('夜间定时器已停止');
  }
}

/**
 * 获取上次更新时间
 */
export function getLastUpdateTime(): string | null {
  return lastUpdateTime;
}

/**
 * 获取上次更新结果
 */
export function getLastUpdateResult(): KnowledgeUpdateResult | null {
  return lastUpdateResult;
}

/**
 * 手动触发更新（用于测试或用户手动触发）
 */
export async function triggerManualUpdate(): Promise<KnowledgeUpdateResult> {
  return await runNightlyUpdate();
}