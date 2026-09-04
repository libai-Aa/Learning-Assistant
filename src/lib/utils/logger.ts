/**
 * 分级日志工具
 * - debug: 开发调试信息，生产环境自动过滤
 * - info: 关键操作日志（用户操作、数据保存）
 * - warn: 可恢复的异常（fetch 失败但有兜底数据）
 * - error: 不可恢复的异常（必须修复）
 * 
 * 使用方式：
 *   import { logger } from '@/lib/utils/logger';
 *   logger.debug('enterReading start', { url });
 *   logger.info('Article saved', { id });
 *   logger.warn('Image fetch failed, using fallback', { src });
 *   logger.error('Critical: data corruption', { error });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Logger 核心方法接口（子 logger 仅包含这四个方法） */
interface LoggerCore {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** Logger 实例接口（在核心方法基础上增加 module 方法，用于解决自引用类型推断问题） */
interface Logger extends LoggerCore {
  /** 创建带模块前缀的子 logger */
  module(name: string): LoggerCore;
}

// 生产环境过滤 debug 日志
// 使用类型断言访问 import.meta.env，兼容无 vite/client 类型声明的环境
const viteEnv = (import.meta as unknown as { env?: { PROD?: boolean } }).env;
const isProduction = viteEnv?.PROD ?? false;
const currentLevel: LogLevel = isProduction ? 'info' : 'debug';

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (context) {
    try {
      return `${prefix} ${message} ${JSON.stringify(context)}`;
    } catch {
      return `${prefix} ${message} [context serialization failed]`;
    }
  }
  return `${prefix} ${message}`;
}

export const logger: Logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.debug) {
      console.debug(formatMessage('debug', message, context));
    }
  },
  
  info(message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.info) {
      console.info(formatMessage('info', message, context));
    }
  },
  
  warn(message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, context));
    }
  },
  
  error(message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, context));
    }
  },
  
  module(name: string): LoggerCore {
    return {
      debug: (msg: string, ctx?: Record<string, unknown>) => logger.debug(`[${name}] ${msg}`, ctx),
      info: (msg: string, ctx?: Record<string, unknown>) => logger.info(`[${name}] ${msg}`, ctx),
      warn: (msg: string, ctx?: Record<string, unknown>) => logger.warn(`[${name}] ${msg}`, ctx),
      error: (msg: string, ctx?: Record<string, unknown>) => logger.error(`[${name}] ${msg}`, ctx),
    };
  },
};
