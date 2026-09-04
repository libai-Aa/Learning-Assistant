/**
 * 研究状态管理
 * @description 研究区域状态管理，使用Zustand
 * @module src/stores/research-store
 */

import { create } from 'zustand'
import type {
  ResearchQuestion,
  Methodology,
  MethodologyResult,
  FalsificationRecord,
  ResearchStatus,
  QuestionType,
  DiscoveredQuestion
} from '../types/research'

// ============ 状态类型 ============

/** 研究状态 */
interface ResearchState {
  // 研究问题列表
  questions: ResearchQuestion[]
  
  // 当前选中的问题
  selectedQuestionId: string | null
  
  // 方法论结果
  methodologyResults: Map<string, MethodologyResult>
  
  // 证伪记录
  falsificationRecords: Map<string, FalsificationRecord[]>
  
  // 发现的问题队列
  discoveredQueue: DiscoveredQuestion[]
  
  // 加载状态
  isLoading: boolean
  
  // 错误信息
  error: string | null
}

/** 研究操作 */
interface ResearchActions {
  // ========== 问题管理 ==========
  
  /** 添加研究问题 */
  addQuestion: (question: Omit<ResearchQuestion, 'id' | 'createdAt' | 'updatedAt'>) => string
  
  /** 更新研究问题 */
  updateQuestion: (id: string, updates: Partial<ResearchQuestion>) => void
  
  /** 删除研究问题 */
  deleteQuestion: (id: string) => void
  
  /** 设置问题状态 */
  setQuestionStatus: (id: string, status: ResearchStatus) => void
  
  /** 设置问题方法论 */
  setQuestionMethodology: (id: string, methodology: Methodology) => void
  
  /** 获取问题 */
  getQuestion: (id: string) => ResearchQuestion | undefined
  
  /** 按状态获取问题 */
  getQuestionsByStatus: (status: ResearchStatus) => ResearchQuestion[]
  
  /** 按类型获取问题 */
  getQuestionsByType: (type: QuestionType) => ResearchQuestion[]
  
  // ========== 选择管理 ==========
  
  /** 选中问题 */
  selectQuestion: (id: string | null) => void
  
  /** 获取选中的问题 */
  getSelectedQuestion: () => ResearchQuestion | undefined
  
  // ========== 方法论结果 ==========
  
  /** 添加方法论结果 */
  addMethodologyResult: (questionId: string, result: MethodologyResult) => void
  
  /** 获取方法论结果 */
  getMethodologyResult: (questionId: string) => MethodologyResult | undefined
  
  /** 清除方法论结果 */
  clearMethodologyResult: (questionId: string) => void
  
  // ========== 证伪记录 ==========
  
  /** 添加证伪记录 */
  addFalsificationRecord: (knowledgeId: string, record: FalsificationRecord) => void
  
  /** 获取证伪记录 */
  getFalsificationRecords: (knowledgeId: string) => FalsificationRecord[]
  
  // ========== 发现队列 ==========
  
  /** 添加发现的问题 */
  addToDiscoveredQueue: (questions: DiscoveredQuestion[]) => void
  
  /** 从队列中移除问题 */
  removeFromDiscoveredQueue: (index: number) => void
  
  /** 清空发现队列 */
  clearDiscoveredQueue: () => void
  
  /** 将发现的问题转为研究问题 */
  promoteDiscoveredToQuestion: (index: number) => string | null
  
  // ========== 状态管理 ==========
  
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void
  
  /** 设置错误 */
  setError: (error: string | null) => void
  
  /** 清空所有状态 */
  clearAll: () => void
}

// ============ 初始状态 ============

const initialState: ResearchState = {
  questions: [],
  selectedQuestionId: null,
  methodologyResults: new Map(),
  falsificationRecords: new Map(),
  discoveredQueue: [],
  isLoading: false,
  error: null
}

// ============ Store ============

/**
 * 研究Store
 */
export const useResearchStore = create<ResearchState & ResearchActions>((set, get) => ({
  ...initialState,

  // ========== 问题管理 ==========

  addQuestion: (questionData) => {
    const id = `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()
    
    const question: ResearchQuestion = {
      ...questionData,
      id,
      createdAt: now,
      updatedAt: now
    }
    
    set(state => ({
      questions: [...state.questions, question]
    }))
    
    return id
  },

  updateQuestion: (id, updates) => {
    set(state => ({
      questions: state.questions.map(q =>
        q.id === id
          ? { ...q, ...updates, updatedAt: new Date().toISOString() }
          : q
      )
    }))
  },

  deleteQuestion: (id) => {
    set(state => ({
      questions: state.questions.filter(q => q.id !== id),
      selectedQuestionId: state.selectedQuestionId === id ? null : state.selectedQuestionId
    }))
  },

  setQuestionStatus: (id, status) => {
    get().updateQuestion(id, { status })
  },

  setQuestionMethodology: (id, methodology) => {
    get().updateQuestion(id, { methodology })
  },

  getQuestion: (id) => {
    return get().questions.find(q => q.id === id)
  },

  getQuestionsByStatus: (status) => {
    return get().questions.filter(q => q.status === status)
  },

  getQuestionsByType: (type) => {
    return get().questions.filter(q => q.type === type)
  },

  // ========== 选择管理 ==========

  selectQuestion: (id) => {
    set({ selectedQuestionId: id })
  },

  getSelectedQuestion: () => {
    const { questions, selectedQuestionId } = get()
    return questions.find(q => q.id === selectedQuestionId)
  },

  // ========== 方法论结果 ==========

  addMethodologyResult: (questionId, result) => {
    set(state => {
      const newResults = new Map(state.methodologyResults)
      newResults.set(questionId, result)
      return { methodologyResults: newResults }
    })
  },

  getMethodologyResult: (questionId) => {
    return get().methodologyResults.get(questionId)
  },

  clearMethodologyResult: (questionId) => {
    set(state => {
      const newResults = new Map(state.methodologyResults)
      newResults.delete(questionId)
      return { methodologyResults: newResults }
    })
  },

  // ========== 证伪记录 ==========

  addFalsificationRecord: (knowledgeId, record) => {
    set(state => {
      const newRecords = new Map(state.falsificationRecords)
      const existing = newRecords.get(knowledgeId) || []
      newRecords.set(knowledgeId, [...existing, record])
      return { falsificationRecords: newRecords }
    })
  },

  getFalsificationRecords: (knowledgeId) => {
    return get().falsificationRecords.get(knowledgeId) || []
  },

  // ========== 发现队列 ==========

  addToDiscoveredQueue: (questions) => {
    set(state => ({
      discoveredQueue: [...state.discoveredQueue, ...questions]
    }))
  },

  removeFromDiscoveredQueue: (index) => {
    set(state => ({
      discoveredQueue: state.discoveredQueue.filter((_, i) => i !== index)
    }))
  },

  clearDiscoveredQueue: () => {
    set({ discoveredQueue: [] })
  },

  promoteDiscoveredToQuestion: (index) => {
    const state = get()
    const discovered = state.discoveredQueue[index]
    
    if (!discovered) return null
    
    const id = state.addQuestion({
      question: discovered.question,
      type: discovered.type,
      source: 'manual',
      status: 'discovered',
      valueScore: discovered.valueScore,
      feasibilityScore: 7
    })
    
    // 从队列中移除
    state.removeFromDiscoveredQueue(index)
    
    return id
  },

  // ========== 状态管理 ==========

  setLoading: (loading) => {
    set({ isLoading: loading })
  },

  setError: (error) => {
    set({ error })
  },

  clearAll: () => {
    set(initialState)
  }
}))

// ============ 选择器 ============

/**
 * 获取统计信息
 */
export function useResearchStats() {
  return useResearchStore((state) => {
    const total = state.questions.length
    
    const byStatus = {
      discovered: state.questions.filter(q => q.status === 'discovered').length,
      analyzing: state.questions.filter(q => q.status === 'analyzing').length,
      researching: state.questions.filter(q => q.status === 'researching').length,
      synthesized: state.questions.filter(q => q.status === 'synthesized').length,
      verified: state.questions.filter(q => q.status === 'verified').length,
      falsified: state.questions.filter(q => q.status === 'falsified').length
    }
    
    const byType = {
      conceptual: state.questions.filter(q => q.type === 'conceptual').length,
      methodological: state.questions.filter(q => q.type === 'methodological').length,
      applied: state.questions.filter(q => q.type === 'applied').length
    }
    
    return { total, byStatus, byType }
  })
}

/**
 * 获取排序后的问题列表
 */
export function useSortedQuestions(sortBy: 'createdAt' | 'updatedAt' | 'valueScore' = 'updatedAt') {
  return useResearchStore((state) => {
    return [...state.questions].sort((a, b) => {
      if (sortBy === 'valueScore') {
        return (b.valueScore || 0) - (a.valueScore || 0)
      }
      return new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime()
    })
  })
}

// ============ 导出 ============

export default useResearchStore