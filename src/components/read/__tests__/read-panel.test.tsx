/**
 * ReadPanel 组件测试
 * @module src/components/read/__tests__/read-panel.test
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { ReadPanel } from '../read-panel';
import { FileEntry, KnowledgeType, SourceType, KnowledgeFormat } from '../../../types/knowledge';

// Mock stores
vi.mock('../../../stores/idea-store', () => ({
  useIdeaStore: () => ({
    createIdea: vi.fn(() => 'idea_1'),
    getIdeasByKnowledge: vi.fn(() => []),
  }),
}));

// Mock child components
vi.mock('../annotation-layer', () => ({
  AnnotationLayer: vi.fn(({ content, annotations }) => (
    <div data-testid="annotation-layer">
      <div>{content}</div>
      <div data-testid="annotation-count">{annotations.length} annotations</div>
    </div>
  )),
}));

vi.mock('../annotation-panel', () => ({
  AnnotationPanel: vi.fn(({ open, onClose }) =>
    open ? (
      <div data-testid="annotation-panel">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

vi.mock('../idea-capture', () => ({
  IdeaCapture: vi.fn(({ open, onClose, onSubmit }) =>
    open ? (
      <div data-testid="idea-capture">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onSubmit({ content: 'Test idea', source: 'manual' })}>Submit</button>
      </div>
    ) : null
  ),
}));

// Mock window.getSelection
const mockSelection = {
  toString: vi.fn(() => ''),
  isCollapsed: true,
  getRangeAt: vi.fn(() => ({
    startOffset: 0,
    endOffset: 0,
  })),
  removeAllRanges: vi.fn(),
  addRange: vi.fn(),
};

Object.defineProperty(window, 'getSelection', {
  value: vi.fn(() => mockSelection),
});

// Mock Range
const mockRange = {
  startOffset: 0,
  endOffset: 10,
  startContainer: {},
  endContainer: {},
  cloneRange: vi.fn(() => mockRange),
  getBoundingClientRect: vi.fn(() => ({
    top: 0,
    left: 0,
    width: 100,
    height: 20,
  })),
};

vi.mock('../../../lib/read/idea-priority', () => ({
  priorityEngine: {
    calculatePriority: vi.fn(() => ({
      importance: 'medium',
      urgency: 'normal',
      score: 50,
    })),
  },
}));

// Mock test data
const createMockFileEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
  id: 'test-1',
  name: 'test.pdf',
  type: KnowledgeType.DOCUMENT,
  sourceType: SourceType.FILE,
  format: KnowledgeFormat.PDF,
  size: 1024,
  mimeType: 'application/pdf',
  filePath: '/test/test.pdf',
  metadata: {
    title: '测试文档',
    author: '测试作者',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  isParsed: true,
  content: {
    text: '这是测试文档的内容',
  },
  tags: ['测试', '文档'],
  ...overrides,
});

describe('ReadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    it('应该渲染空状态', () => {
      render(
        <ReadPanel
          knowledgeList={[]}
        />
      );

      expect(screen.getByText('选择或添加知识开始阅读')).toBeInTheDocument();
      expect(screen.getByText('📖')).toBeInTheDocument();
    });

    it('应该渲染知识列表', () => {
      const knowledgeList = [
        createMockFileEntry({ id: '1', name: 'doc1.pdf' }),
        createMockFileEntry({ id: '2', name: 'doc2.pdf' }),
      ];

      render(
        <ReadPanel
          selectedKnowledge={knowledgeList[0]}
          knowledgeList={knowledgeList}
        />
      );

      expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
      expect(screen.getByText('doc2.pdf')).toBeInTheDocument();
    });

    it('应该渲染选中知识的标题', () => {
      const knowledge = createMockFileEntry({
        metadata: { title: '我的测试文档' },
      });

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      expect(screen.getByText('我的测试文档')).toBeInTheDocument();
    });

    it('应该渲染知识元数据', () => {
      const knowledge = createMockFileEntry({
        metadata: { title: '测试文档', author: '张三' },
        createdAt: '2024-01-15T10:00:00.000Z',
      });

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      expect(screen.getByText(/作者: 张三/)).toBeInTheDocument();
    });

    it('应该渲染知识标签', () => {
      const knowledge = createMockFileEntry({
        tags: ['重要', '待读', '测试'],
      });

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      expect(screen.getByText('重要')).toBeInTheDocument();
      expect(screen.getByText('待读')).toBeInTheDocument();
      expect(screen.getByText('测试')).toBeInTheDocument();
    });
  });

  describe('知识选择', () => {
    it('应该点击知识项触发选择', () => {
      const knowledgeList = [
        createMockFileEntry({ id: '1', name: 'doc1.pdf' }),
        createMockFileEntry({ id: '2', name: 'doc2.pdf' }),
      ];
      const onKnowledgeSelect = vi.fn();

      render(
        <ReadPanel
          selectedKnowledge={knowledgeList[0]}
          knowledgeList={knowledgeList}
          onKnowledgeSelect={onKnowledgeSelect}
        />
      );

      const doc2 = screen.getByText('doc2.pdf');
      fireEvent.click(doc2);

      expect(onKnowledgeSelect).toHaveBeenCalledWith(knowledgeList[1]);
    });

    it('应该显示选中状态', () => {
      const knowledgeList = [
        createMockFileEntry({ id: '1', name: 'doc1.pdf' }),
        createMockFileEntry({ id: '2', name: 'doc2.pdf' }),
      ];

      const { container } = render(
        <ReadPanel
          selectedKnowledge={knowledgeList[0]}
          knowledgeList={knowledgeList}
        />
      );

      // 第一个项应该有选中样式
      const firstItem = screen.getByText('doc1.pdf').closest('button');
      expect(firstItem?.className).toContain('bg-blue-50');
    });
  });

  describe('搜索功能', () => {
    it('应该根据关键词搜索知识', () => {
      const knowledgeList = [
        createMockFileEntry({ id: '1', name: 'react文档.pdf', metadata: { title: 'React学习' } }),
        createMockFileEntry({ id: '2', name: 'vue文档.pdf', metadata: { title: 'Vue指南' } }),
      ];

      render(
        <ReadPanel
          selectedKnowledge={knowledgeList[0]}
          knowledgeList={knowledgeList}
        />
      );

      const searchInput = screen.getByPlaceholderText('搜索知识...');
      fireEvent.change(searchInput, { target: { value: 'react' } });

      expect(screen.getByText('react文档.pdf')).toBeInTheDocument();
      expect(screen.queryByText('vue文档.pdf')).not.toBeInTheDocument();
    });

    it('应该根据标题搜索', () => {
      const knowledgeList = [
        createMockFileEntry({ id: '1', name: 'doc1.pdf', metadata: { title: '机器学习入门' } }),
        createMockFileEntry({ id: '2', name: 'doc2.pdf', metadata: { title: '深度学习指南' } }),
      ];

      render(
        <ReadPanel
          selectedKnowledge={knowledgeList[0]}
          knowledgeList={knowledgeList}
        />
      );

      const searchInput = screen.getByPlaceholderText('搜索知识...');
      fireEvent.change(searchInput, { target: { value: '深度' } });

      expect(screen.getByText('深度学习指南')).toBeInTheDocument();
    });

    it('空搜索应该显示所有知识', () => {
      const knowledgeList = [
        createMockFileEntry({ id: '1', name: 'doc1.pdf' }),
        createMockFileEntry({ id: '2', name: 'doc2.pdf' }),
      ];

      render(
        <ReadPanel
          selectedKnowledge={knowledgeList[0]}
          knowledgeList={knowledgeList}
        />
      );

      const searchInput = screen.getByPlaceholderText('搜索知识...');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
      expect(screen.getByText('doc2.pdf')).toBeInTheDocument();
    });
  });

  describe('高亮功能', () => {
    it('应该显示高亮按钮当有选中文本', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 模拟选中文本
      mockSelection.toString.mockReturnValue('选中文本');
      mockSelection.isCollapsed = false;

      // 触发文本选择事件
      const contentArea = screen.getByTestId('annotation-layer');
      fireEvent.mouseUp(contentArea);

      // 应该显示高亮按钮
      expect(screen.getByText('高亮')).toBeInTheDocument();
    });

    it('应该点击高亮按钮创建标注', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 模拟选中文本
      mockSelection.toString.mockReturnValue('测试高亮文本');
      mockSelection.isCollapsed = false;

      const contentArea = screen.getByTestId('annotation-layer');
      fireEvent.mouseUp(contentArea);

      // 点击高亮按钮
      const highlightButton = screen.getByText('高亮');
      fireEvent.click(highlightButton);

      // 标注计数应该增加
      expect(screen.getByTestId('annotation-count')).toBeInTheDocument();
    });

    it('应该允许选择高亮颜色', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 颜色选择按钮
      const colorButtons = screen.getAllByRole('button', { name: /选择/ });
      expect(colorButtons.length).toBeGreaterThan(0);
    });
  });

  describe('批注功能', () => {
    it('应该点击批注按钮打开标注面板', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 模拟选中文本
      mockSelection.toString.mockReturnValue('测试批注');
      mockSelection.isCollapsed = false;

      const contentArea = screen.getByTestId('annotation-layer');
      fireEvent.mouseUp(contentArea);

      // 点击批注按钮
      const noteButton = screen.getByText('批注');
      fireEvent.click(noteButton);

      // 应该显示标注面板
      expect(screen.getByTestId('annotation-panel')).toBeInTheDocument();
    });

    it('应该能关闭标注面板', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 打开面板
      mockSelection.toString.mockReturnValue('测试');
      mockSelection.isCollapsed = false;
      fireEvent.mouseUp(screen.getByTestId('annotation-layer'));
      fireEvent.click(screen.getByText('批注'));

      // 关闭面板
      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      expect(screen.queryByTestId('annotation-panel')).not.toBeInTheDocument();
    });
  });

  describe('想法记录功能', () => {
    it('应该点击想法按钮打开想法面板', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 模拟选中文本
      mockSelection.toString.mockReturnValue('测试想法');
      mockSelection.isCollapsed = false;

      const contentArea = screen.getByTestId('annotation-layer');
      fireEvent.mouseUp(contentArea);

      // 点击想法按钮
      const ideaButton = screen.getByText('想法');
      fireEvent.click(ideaButton);

      // 应该显示想法面板
      expect(screen.getByTestId('idea-capture')).toBeInTheDocument();
    });

    it('应该能关闭想法面板', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 打开面板
      mockSelection.toString.mockReturnValue('测试');
      mockSelection.isCollapsed = false;
      fireEvent.mouseUp(screen.getByTestId('annotation-layer'));
      fireEvent.click(screen.getByText('想法'));

      // 关闭面板
      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      expect(screen.queryByTestId('idea-capture')).not.toBeInTheDocument();
    });
  });

  describe('网页链接功能', () => {
    it('应该渲染网页链接输入框', () => {
      const onWebLinkSubmit = vi.fn();

      render(
        <ReadPanel
          knowledgeList={[]}
          onWebLinkSubmit={onWebLinkSubmit}
        />
      );

      expect(screen.getByPlaceholderText('输入网页链接...')).toBeInTheDocument();
    });

    it('应该提交网页链接', async () => {
      const onWebLinkSubmit = vi.fn().mockResolvedValue(createMockFileEntry());

      render(
        <ReadPanel
          knowledgeList={[]}
          onWebLinkSubmit={onWebLinkSubmit}
        />
      );

      const input = screen.getByPlaceholderText('输入网页链接...');
      const button = screen.getByText('添加');

      fireEvent.change(input, { target: { value: 'https://example.com' } });
      fireEvent.click(button);

      expect(onWebLinkSubmit).toHaveBeenCalledWith('https://example.com');
    });

    it('应该显示加载状态', async () => {
      const onWebLinkSubmit = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createMockFileEntry()), 100))
      );

      render(
        <ReadPanel
          knowledgeList={[]}
          onWebLinkSubmit={onWebLinkSubmit}
        />
      );

      const input = screen.getByPlaceholderText('输入网页链接...');
      const button = screen.getByText('添加');

      fireEvent.change(input, { target: { value: 'https://example.com' } });
      fireEvent.click(button);

      expect(screen.getByText('抓取中...')).toBeInTheDocument();
    });
  });

  describe('阅读进度', () => {
    it('应该显示阅读进度', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      expect(screen.getByText(/进度:/)).toBeInTheDocument();
    });

    it('默认进度应该是0%', () => {
      const knowledge = createMockFileEntry();

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      expect(screen.getByText(/进度: 0%/)).toBeInTheDocument();
    });
  });

  describe('边界条件', () => {
    it('应该处理没有选中知识的情况', () => {
      render(<ReadPanel knowledgeList={[]} />);

      expect(screen.getByText('选择或添加知识开始阅读')).toBeInTheDocument();
    });

    it('应该处理空知识列表', () => {
      render(<ReadPanel knowledgeList={[]} />);

      expect(screen.getByText('选择或添加知识开始阅读')).toBeInTheDocument();
    });

    it('应该处理没有内容的知识', () => {
      const knowledge = createMockFileEntry({
        content: undefined,
      });

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      expect(screen.getByTestId('annotation-layer')).toBeInTheDocument();
    });

    it('应该处理没有标签的知识', () => {
      const knowledge = createMockFileEntry({
        tags: [],
      });

      render(
        <ReadPanel
          selectedKnowledge={knowledge}
          knowledgeList={[knowledge]}
        />
      );

      // 不应该渲染任何标签
      expect(screen.queryByText('测试')).not.toBeInTheDocument();
    });
  });

  describe('无障碍性', () => {
    it('知识列表项应该是按钮', () => {
      const knowledgeList = [
        createMockFileEntry({ id: '1', name: 'doc1.pdf' }),
      ];

      render(
        <ReadPanel
          selectedKnowledge={knowledgeList[0]}
          knowledgeList={knowledgeList}
        />
      );

      const item = screen.getByText('doc1.pdf').closest('button');
      expect(item).toBeInTheDocument();
    });

    it('搜索框应该有标签', () => {
      render(<ReadPanel knowledgeList={[]} />);

      const searchInput = screen.getByPlaceholderText('搜索知识...');
      expect(searchInput).toBeInTheDocument();
    });
  });
});