/**
 * Read区域模块导出
 */

// 组件
export { ReadPanel } from './components/read/read-panel';
export type { ReadPanelProps } from './components/read/read-panel';

export { AnnotationLayer, HighlightMark, HighlightColorPicker } from './components/read/annotation-layer';
export type { AnnotationLayerProps, HighlightMarkProps, HighlightColorPickerProps } from './components/read/annotation-layer';

export { AnnotationPanel } from './components/read/annotation-panel';
export type { AnnotationPanelProps } from './components/read/annotation-panel';

export { IdeaCapture } from './components/read/idea-capture';
export type { IdeaCaptureProps } from './components/read/idea-capture';

// 来源视图
export { SourcesView } from './components/sources/sources-view';
export type { SourcesViewProps } from './components/sources/sources-view';

// 文件预览
export { FilePreview } from './components/editor/file-preview';
export type { FilePreviewProps } from './components/editor/file-preview';

// 类型
export type {
  FileEntry,
  FileMetadata,
  ExtractedContent,
  KnowledgeTypeValue,
  SourceTypeValue,
  ImportanceLevelValue,
  UrgencyLevelValue,
  AutoCategoryResult,
  ReadProgress,
} from './types/knowledge';

export type { WebFetchResult } from './lib/read/web-fetcher';

export { KnowledgeType, SourceType, ImportanceLevel, UrgencyLevel } from './types/knowledge';

export type {
  Annotation,
  AnnotationTypeValue,
  HighlightColorValue,
  TextPosition,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  AnnotationFilter,
  AnnotationStats,
  HighlightRenderData,
} from './types/annotation';

export { AnnotationType, HighlightColor } from './types/annotation';

export type {
  Idea,
  IdeaAnalysis,
  PriorityResult,
  PracticeStatusValue,
  IdeaSourceValue,
  CreateIdeaRequest,
  UpdateIdeaRequest,
  IdeaFilter,
  IdeaSortOptions,
  IdeaStats,
  StatusTransition,
} from './types/idea';

export { PracticeStatus, IdeaSource } from './types/idea';

// Store
export { useIdeaStore, useAllIdeas, useIdeasByStatus, useIdeaStats, usePendingIdeas } from './stores/idea-store';

// 引擎
export { priorityEngine } from './lib/read/idea-priority';
export type { PriorityConfig, BehaviorData, ContentAnalysis } from './lib/read/idea-priority';

// ============ Research 区实验报告系统 ============

// 类型
export type {
  ExplorationStatus,
  ExplorationEntryType,
  ExplorationEntry,
  EvidenceItem,
  EvidenceType,
  ExplorationBasicInfo,
  ExplorationMotivation,
  ExplorationTheory,
  ExplorationTools,
  ExplorationFindings,
  ExplorationConclusion,
  ExplorationReflection,
  ExperimentReport,
  CreateExperimentReportInput,
  UpdateExperimentReportInput,
  CreateExplorationEntryInput,
  UpdateExplorationEntryInput,
  ExperimentReportFilter,
  ExplorationEntryFilter,
  ExperimentReportStats,
  ExplorationEntryStats,
} from './types/experiment-report';

export {
  ExplorationStatusNames,
  ExplorationStatusColors,
  ExplorationEntryTypeNames,
  ExplorationEntryTypeStyles,
} from './types/experiment-report';

// 实验报告核心逻辑
export {
  createExperimentReport,
  updateExperimentReport,
  createExplorationEntry,
  updateExplorationEntry,
  transitionStatus,
  canTransitionStatus,
  filterReports,
  filterEntries,
  sortEntries,
  computeReportStats,
  computeEntryStats,
  inferConclusionResult,
  generateSummaryDraft,
  createEvidence,
  findEntry,
  findEvidence,
  getEntryChain,
  computeReportDurationMinutes,
  computeReportSpanMinutes,
  recommendMethodology,
  inferTags,
  ALL_ENTRY_TYPES,
} from './lib/research/experiment-report';

// 实验报告 Store
export {
  useExperimentReportStore,
  useAllReports,
  useSelectedReport,
  useReportStats,
  useInProgressReports,
  useFinishedReports,
} from './stores/experiment-report-store';

// 实验报告组件
export {
  ExplorationTimeline,
  AddExplorationEntryForm,
} from './components/research/exploration-timeline';
export type {
  ExplorationTimelineProps,

  AddExplorationEntryFormProps,
} from './components/research/exploration-timeline';

export {
  ExperimentReportPanel,
  ExperimentReportList,
} from './components/research/experiment-report-panel';
export type {
  ExperimentReportPanelProps,
  ExperimentReportListProps,
} from './components/research/experiment-report-panel';

// Research 区集成辅助
export {
  ensureReportForQuestion,
  ensureReportForIdea,
  appendExplorationEntry,
  finalizeExploration,
  cleanupReportForQuestion,
  cleanupReportForIdea,
  preCreateReportForQuestion,
  getReportForTarget,
} from './lib/research/experiment-report-integration';

// ============ WPS 模板管理系统（"更懂你的WPS"） ============

// 类型
export type {
  DocumentTemplate,
  TemplateCategoryValue,
  DocumentTypeValue,
  TemplateSourceValue,
  VisualDensityValue,
  TemplateStyleFeatures,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateFilter,
  TemplateSortOptions,
  TemplateStats,
  TemplateRecommendation,
  StyleExtractionInput,
  StyleExtractionResult,
} from './types/template';

export {
  TemplateCategory,
  TemplateCategoryNames,
  DocumentType,
  TemplateSource,
  VisualDensity,
} from './types/template';

// 模板管理器核心逻辑
export {
  TemplateManager,
  templateManager,
  generateTemplateId,
  clampRating,
  jaccardSimilarity,
  inferVisualDensity,
  extractStyleFeatures,
  computeSimilarity,
  filterTemplates,
  sortTemplates,
  computeTemplateStats,
  searchTemplateText,
} from './lib/wps/template-manager';

// 模板状态管理
export {
  useTemplateStore,
  useAllTemplates,
  useSelectedTemplate,
  useVisibleTemplates,
  useTemplateStats,
  useAllTemplateTags,
  useAllTemplateUseCases,
  useTemplateCountByCategory,
} from './stores/template-store';

// 模板库 UI 组件
export { TemplateLibrary } from './components/wps/template-library';
export type { TemplateLibraryProps } from './components/wps/template-library';