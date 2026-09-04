import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 自定义回退 UI */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** 组件名称（用于日志标识） */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary 组件
 * 捕获子组件渲染错误，显示回退 UI，记录错误日志
 * 
 * 使用方式：
 *   <ErrorBoundary name="LinkReceiver">
 *     <LinkReceiver />
 *   </ErrorBoundary>
 * 
 *   <ErrorBoundary name="GraphView" fallback={(err, retry) => <CustomErrorUI error={err} onRetry={retry} />}>
 *     <GraphView />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private moduleLogger = logger.module(this.props.name || 'ErrorBoundary');

  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.moduleLogger.error('Component crashed', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }
      // 默认回退 UI
      return (
        <div style={{
          padding: 24, textAlign: 'center', color: '#991b1b',
          background: '#fee2e2', borderRadius: 8, margin: 16,
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            😵 {this.props.name ? `${this.props.name} 出错了` : '组件出错了'}
          </div>
          <div style={{ fontSize: 13, marginBottom: 12, color: '#7f1d1d' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '6px 16px', background: '#dc2626', color: 'white',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            }}
          >
            🔄 重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}