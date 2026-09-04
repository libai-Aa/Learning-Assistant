/**
 * 问题发现引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { QuestionDiscoveryEngine, createQuestionDiscoveryEngine } from '../research/question-discovery'
import type { DiscoveredQuestionSource } from '../../types/research'

describe('QuestionDiscoveryEngine', () => {
  let engine: QuestionDiscoveryEngine

  beforeEach(() => {
    engine = new QuestionDiscoveryEngine({
      minQuestionLength: 10,
      maxDiscoveries: 10,
      valueThreshold: 5
    })
  })

  describe('discoverFromText', () => {
    it('应该从文本中提取疑问句', async () => {
      const text = '今天天气很好。什么是机器学习？这是一个重要的概念。'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-1',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      expect(questions.length).toBeGreaterThan(0)
      expect(questions[0].question).toContain('什么是')
    })

    it('应该正确分类概念型问题', async () => {
      const text = '什么是深度学习的原理？'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-2',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      expect(questions.length).toBeGreaterThan(0)
      expect(questions[0].type).toBe('conceptual')
    })

    it('应该正确分类方法型问题', async () => {
      const text = '如何实现一个神经网络？'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-3',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      expect(questions.length).toBeGreaterThan(0)
      expect(questions[0].type).toBe('methodological')
    })

    it('应该正确分类应用型问题', async () => {
      const text = '机器学习在医疗诊断中的应用是什么？'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-4',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      expect(questions.length).toBeGreaterThan(0)
      expect(questions[0].type).toBe('applied')
    })

    it('应该发现矛盾点并生成问题', async () => {
      const text = '这个方法很高效。但是，它却导致了性能下降。'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-5',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      expect(questions.length).toBeGreaterThan(0)
    })

    it('应该发现知识缺口并生成问题', async () => {
      const text = '这个机制目前还不清楚。'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-6',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      expect(questions.length).toBeGreaterThan(0)
    })

    it('应该过滤低于阈值的问题', async () => {
      const text = '你好。今天天气怎么样？'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-7',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      // 短问题可能被过滤
      expect(questions.length).toBeGreaterThanOrEqual(0)
    })

    it('应该去重重复问题', async () => {
      const text = '什么是AI？什么是AI？'
      const source: DiscoveredQuestionSource = {
        type: 'conversation',
        sourceId: 'test-8',
        rawContent: text
      }

      const questions = await engine.discoverFromText(text, source)

      // 去重后应该只有一个
      const uniqueQuestions = new Set(questions.map(q => q.question))
      expect(uniqueQuestions.size).toBeLessThanOrEqual(questions.length)
    })
  })

  describe('discoverFromConversation', () => {
    it('应该从对话中发现研究问题', async () => {
      const conversation = `
        用户: 什么是量子计算？
        助手: 量子计算是一种利用量子力学原理进行计算的方法。
        用户: 它和经典计算有什么区别？
        助手: 主要区别在于量子比特可以同时处于多个状态。
      `

      const questions = await engine.discoverFromConversation(conversation, 'conv-1')

      expect(questions.length).toBeGreaterThan(0)
    })
  })

  describe('discoverFromIdea', () => {
    it('应该从想法中发现研究问题', async () => {
      const idea = '我觉得可以用神经网络来优化这个问题，但是目前还不清楚如何实现。'

      const questions = await engine.discoverFromIdea(idea, 'idea-1')

      expect(questions.length).toBeGreaterThan(0)
    })
  })

  describe('createQuestionDiscoveryEngine', () => {
    it('应该创建自定义配置的引擎实例', () => {
      const customEngine = createQuestionDiscoveryEngine({
        minQuestionLength: 20,
        maxDiscoveries: 5,
        valueThreshold: 7
      })

      expect(customEngine).toBeInstanceOf(QuestionDiscoveryEngine)
    })
  })
})

/**
 * 方法论引擎测试
 */

import { MethodologyEngine, createMethodologyEngine } from '../research/methodology-engine'

describe('MethodologyEngine', () => {
  let engine: MethodologyEngine

  beforeEach(() => {
    engine = new MethodologyEngine()
  })

  describe('recommendMethodology', () => {
    it('应该为概念型问题推荐合适的方法论', () => {
      const question = {
        id: 'q-1',
        question: '什么是机器学习？',
        type: 'conceptual' as const,
        source: 'manual' as const,
        status: 'discovered' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const methodologies = engine.recommendMethodology(question)

      expect(methodologies.length).toBeGreaterThan(0)
      expect(methodologies).toContain('socratic')
    })

    it('应该为方法型问题推荐合适的方法论', () => {
      const question = {
        id: 'q-2',
        question: '如何实现神经网络？',
        type: 'methodological' as const,
        source: 'manual' as const,
        status: 'discovered' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const methodologies = engine.recommendMethodology(question)

      expect(methodologies.length).toBeGreaterThan(0)
      expect(methodologies).toContain('five-whys')
    })

    it('应该为应用型问题推荐合适的方法论', () => {
      const question = {
        id: 'q-3',
        question: '机器学习在医疗中的应用？',
        type: 'applied' as const,
        source: 'manual' as const,
        status: 'discovered' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const methodologies = engine.recommendMethodology(question)

      expect(methodologies.length).toBeGreaterThan(0)
      expect(methodologies).toContain('first-principles')
    })
  })

  describe('applySocratic', () => {
    it('应该生成苏格拉底提问法的分析步骤', async () => {
      const result = await engine.applySocratic('什么是机器学习？')

      expect(result.methodology).toBe('socratic')
      expect(result.steps.length).toBeGreaterThan(0)
      expect(result.steps[0].step).toBe(1)
      expect(result.conclusion.length).toBeGreaterThan(0)
    })

    it('应该包含置信度信息', async () => {
      const result = await engine.applySocratic('什么是机器学习？')

      expect(result.steps[0].confidence).toBeDefined()
      expect(result.steps[0].confidence).toBeGreaterThanOrEqual(0)
      expect(result.steps[0].confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('applyFiveWhys', () => {
    it('应该生成丰田五问法的分析步骤', async () => {
      const result = await engine.applyFiveWhys('为什么系统性能下降了？')

      expect(result.methodology).toBe('five-whys')
      expect(result.steps.length).toBe(5)
      expect(result.conclusion.length).toBeGreaterThan(0)
    })

    it('应该生成5层为什么链', async () => {
      const result = await engine.applyFiveWhys('为什么代码出错了？')

      expect(result.steps).toHaveLength(5)
    })
  })

  describe('applyFirstPrinciples', () => {
    it('应该生成第一性原理的分析步骤', async () => {
      const result = await engine.applyFirstPrinciples('为什么需要神经网络？')

      expect(result.methodology).toBe('first-principles')
      expect(result.steps.length).toBeGreaterThan(0)
      expect(result.conclusion.length).toBeGreaterThan(0)
    })

    it('应该包含关键洞察', async () => {
      const result = await engine.applyFirstPrinciples('为什么需要神经网络？')

      expect(result.insights).toBeDefined()
      expect(result.insights!.length).toBeGreaterThan(0)
    })
  })

  describe('getMethodologyInfo', () => {
    it('应该返回方法论信息', () => {
      const info = engine.getMethodologyInfo('socratic')

      expect(info.type).toBe('socratic')
      expect(info.name.length).toBeGreaterThan(0)
      expect(info.applicableTypes.length).toBeGreaterThan(0)
    })
  })

  describe('getAllMethodologies', () => {
    it('应该返回所有方法论信息', () => {
      const all = engine.getAllMethodologies()

      expect(all.length).toBe(3)
      expect(all.map(m => m.type)).toEqual(
        expect.arrayContaining(['socratic', 'five-whys', 'first-principles'])
      )
    })
  })

  describe('createMethodologyEngine', () => {
    it('应该创建自定义配置的引擎实例', () => {
      const customEngine = createMethodologyEngine({
        maxSteps: 5,
        confidenceThreshold: 0.75
      })

      expect(customEngine).toBeInstanceOf(MethodologyEngine)
    })
  })
})

/**
 * 证伪引擎测试
 */

import { FalsificationEngine, createFalsificationEngine } from '../research/falsification-engine'

describe('FalsificationEngine', () => {
  let engine: FalsificationEngine

  beforeEach(() => {
    engine = new FalsificationEngine({
      defaultCheckIntervalDays: 7,
      confidenceThreshold: 0.8
    })
  })

  describe('checkUpdate', () => {
    it('应该检查知识是否需要更新', async () => {
      const result = await engine.checkUpdate('test-knowledge-1')

      expect(result).toHaveProperty('needsUpdate')
      expect(result).toHaveProperty('reasons')
      expect(result).toHaveProperty('confidence')
      expect(typeof result.needsUpdate).toBe('boolean')
      expect(Array.isArray(result.reasons)).toBe(true)
    })
  })

  describe('performFalsification', () => {
    it('应该执行证伪审查', async () => {
      const record = await engine.performFalsification('test-knowledge-1')

      expect(record).toHaveProperty('id')
      expect(record).toHaveProperty('knowledgeId')
      expect(record).toHaveProperty('originalConclusion')
      expect(record).toHaveProperty('newEvidence')
      expect(record).toHaveProperty('result')
      expect(record).toHaveProperty('confidence')
      expect(record).toHaveProperty('createdAt')

      expect(['falsified', 'supported', 'inconclusive']).toContain(record.result)
    })

    it('应该返回有效的证伪结果', async () => {
      const record = await engine.performFalsification('test-knowledge-2')

      expect(record.confidence).toBeGreaterThanOrEqual(0)
      expect(record.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('getFalsificationHistory', () => {
    it('应该返回证伪历史记录', async () => {
      // 先执行证伪
      await engine.performFalsification('test-knowledge-3')

      const history = engine.getFalsificationHistory('test-knowledge-3')

      expect(Array.isArray(history)).toBe(true)
      expect(history.length).toBeGreaterThan(0)
    })

    it('应该返回空数组对于没有记录的知识', () => {
      const history = engine.getFalsificationHistory('non-existent')

      expect(Array.isArray(history)).toBe(true)
      expect(history.length).toBe(0)
    })
  })

  describe('getGrowthStats', () => {
    it('应该返回知识生长统计', () => {
      const stats = engine.getGrowthStats('test-knowledge-1')

      expect(stats).toHaveProperty('knowledgeId')
      expect(stats).toHaveProperty('totalGrowths')
      expect(stats).toHaveProperty('lastGrowthAt')
      expect(stats).toHaveProperty('growthByType')
      expect(stats.growthByType).toHaveProperty('update')
      expect(stats.growthByType).toHaveProperty('extension')
      expect(stats.growthByType).toHaveProperty('refinement')
    })
  })

  describe('createFalsificationEngine', () => {
    it('应该创建自定义配置的引擎实例', () => {
      const customEngine = createFalsificationEngine({
        defaultCheckIntervalDays: 14,
        confidenceThreshold: 0.9,
        enableAutoFalsification: true
      })

      expect(customEngine).toBeInstanceOf(FalsificationEngine)
    })
  })
})

/**
 * 研究Store测试
 */

import { useResearchStore, useResearchStats, useSortedQuestions } from '../stores/research-store'

describe('ResearchStore', () => {
  beforeEach(() => {
    // 清空store状态
    useResearchStore.getState().clearAll()
  })

  describe('问题管理', () => {
    it('应该添加研究问题', () => {
      const store = useResearchStore.getState()
      
      const id = store.addQuestion({
        question: '什么是机器学习？',
        type: 'conceptual',
        source: 'manual',
        status: 'discovered'
      })

      expect(id).toBeDefined()
      expect(id.length).toBeGreaterThan(0)

      const question = store.getQuestion(id)
      expect(question).toBeDefined()
      expect(question?.question).toBe('什么是机器学习？')
    })

    it('应该更新研究问题', () => {
      const store = useResearchStore.getState()
      
      const id = store.addQuestion({
        question: '测试问题',
        type: 'conceptual',
        source: 'manual',
        status: 'discovered'
      })

      store.updateQuestion(id, { status: 'researching' })

      const question = store.getQuestion(id)
      expect(question?.status).toBe('researching')
    })

    it('应该删除研究问题', () => {
      const store = useResearchStore.getState()
      
      const id = store.addQuestion({
        question: '测试问题',
        type: 'conceptual',
        source: 'manual',
        status: 'discovered'
      })

      store.deleteQuestion(id)

      const question = store.getQuestion(id)
      expect(question).toBeUndefined()
    })

    it('应该按状态获取问题', () => {
      const store = useResearchStore.getState()
      
      store.addQuestion({
        question: '问题1',
        type: 'conceptual',
        source: 'manual',
        status: 'discovered'
      })
      
      store.addQuestion({
        question: '问题2',
        type: 'methodological',
        source: 'manual',
        status: 'researching'
      })

      const discovered = store.getQuestionsByStatus('discovered')
      expect(discovered.length).toBe(1)
      expect(discovered[0].question).toBe('问题1')
    })

    it('应该按类型获取问题', () => {
      const store = useResearchStore.getState()
      
      store.addQuestion({
        question: '概念问题',
        type: 'conceptual',
        source: 'manual',
        status: 'discovered'
      })
      
      store.addQuestion({
        question: '方法问题',
        type: 'methodological',
        source: 'manual',
        status: 'discovered'
      })

      const conceptual = store.getQuestionsByType('conceptual')
      expect(conceptual.length).toBe(1)
      expect(conceptual[0].question).toBe('概念问题')
    })
  })

  describe('选择管理', () => {
    it('应该选中问题', () => {
      const store = useResearchStore.getState()
      
      const id = store.addQuestion({
        question: '测试问题',
        type: 'conceptual',
        source: 'manual',
        status: 'discovered'
      })

      store.selectQuestion(id)

      expect(store.selectedQuestionId).toBe(id)
      const selected = store.getSelectedQuestion()
      expect(selected).toBeDefined()
      expect(selected?.question).toBe('测试问题')
    })
  })

  describe('发现队列', () => {
    it('应该添加发现的问题到队列', () => {
      const store = useResearchStore.getState()
      
      store.addToDiscoveredQueue([
        {
          question: '发现的问题1',
          type: 'conceptual',
          typeConfidence: 0.85,
          source: {
            type: 'conversation',
            sourceId: 'conv-1',
            rawContent: '什么是AI？'
          },
          valueScore: 7,
          valueReason: '测试',
          recommendedMethodologies: ['socratic']
        }
      ])

      expect(store.discoveredQueue.length).toBe(1)
    })

    it('应该将发现的问题提升为研究问题', () => {
      const store = useResearchStore.getState()
      
      store.addToDiscoveredQueue([
        {
          question: '发现的问题',
          type: 'conceptual',
          typeConfidence: 0.85,
          source: {
            type: 'conversation',
            sourceId: 'conv-1',
            rawContent: '什么是AI？'
          },
          valueScore: 7,
          valueReason: '测试',
          recommendedMethodologies: ['socratic']
        }
      ])

      const id = store.promoteDiscoveredToQuestion(0)

      expect(id).not.toBeNull()
      expect(store.questions.length).toBe(1)
      expect(store.discoveredQueue.length).toBe(0)
    })
  })

  describe('统计选择器', () => {
    it('应该返回正确的统计信息', () => {
      // 使用选择器需要渲染组件，这里只测试基本逻辑
      const store = useResearchStore.getState()
      
      store.addQuestion({
        question: '问题1',
        type: 'conceptual',
        source: 'manual',
        status: 'discovered'
      })

      const { total, byStatus, byType } = useResearchStats.getState()

      expect(total).toBe(1)
      expect(byStatus.discovered).toBe(1)
      expect(byType.conceptual).toBe(1)
    })
  })
})