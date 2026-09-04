/**
 * React 测试 mock
 * 仅用于 store 单元测试环境，提供 zustand 所需的 React hook 空实现。
 * 真实组件测试应使用 @testing-library/react 与真实 react。
 */

export const useSyncExternalStore = (
  _subscribe: unknown,
  getSnapshot: () => unknown
): unknown => getSnapshot();

export const useCallback = (fn: unknown): unknown => fn;

export const useDebugValue = (): void => undefined;

export default {
  useSyncExternalStore,
  useCallback,
  useDebugValue,
};