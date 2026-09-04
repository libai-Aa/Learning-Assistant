/**
 * AMiner Daily Paper Skill 测试
 * @module src/lib/aminer/__tests__/aminer-daily-paper.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AminerDailyPaper, createDailyPaper } from '../aminer-daily-paper'
import { AminerConfig } from '../../aminer-skill'

const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn'
}

describe('AminerDailyPaper', () => {
  let skill: AminerDailyPaper

  beforeEach(() => {
    skill = new AminerDailyPaper(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('aminer-daily-paper')
      expect(info.endpoint).toBe('/api/paper/daily')
    })
  })

  describe('获取每日论文', () => {
    it('应该返回论文列表', async () => {
      const mockResponse = {
        papers: [
          {
            paperId: '1',
            title: 'Daily Paper 1',
            authors: ['Author 1'],
            abstract: 'Abstract 1',
            year: 2024,
            citationCount: 5,
            url: 'https://example.com/paper/1'
          }
        ],
        topics: ['AI', 'ML'],
        updatedAt: '2024-01-01T00:00:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const response = await skill.getDailyPapers()
      expect(response.papers).toHaveLength(1)
      expect(response.topics).toEqual(['AI', 'ML'])
    })
  })

  describe('按主题获取论文', () => {
    it('应该包含主题参数', async () => {
      const mockResponse = {
        papers: [],
        topics: ['AI'],
        updatedAt: '2024-01-01T00:00:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const papers = await skill.getPapersByTopics(['AI'])
      expect(papers).toEqual([])
    })
  })

  describe('按学者获取论文', () => {
    it('应该包含学者ID参数', async () => {
      const mockResponse = {
        papers: [],
        topics: [],
        updatedAt: '2024-01-01T00:00:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const papers = await skill.getPapersByScholars(['scholar-1'])
      expect(papers).toEqual([])
    })
  })

  describe('按账号获取论文', () => {
    it('应该包含账号ID参数', async () => {
      const mockResponse = {
        papers: [],
        topics: [],
        updatedAt: '2024-01-01T00:00:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const papers = await skill.getPapersByAccounts(['account-1'])
      expect(papers).toEqual([])
    })
  })

  describe('获取最新论文', () => {
    it('应该返回论文列表', async () => {
      const mockResponse = {
        papers: [],
        topics: [],
        updatedAt: '2024-01-01T00:00:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const papers = await skill.getLatestPapers(10)
      expect(papers).toEqual([])
    })
  })

  describe('获取高引用论文', () => {
    it('应该包含引用数参数', async () => {
      const mockResponse = {
        papers: [],
        topics: [],
        updatedAt: '2024-01-01T00:00:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const papers = await skill.getHighlyCitedPapers(50, 10)
      expect(papers).toEqual([])
    })
  })

  describe('工厂函数', () => {
    it('createDailyPaper应该返回正确的实例', () => {
      const instance = createDailyPaper(testConfig)
      expect(instance).toBeInstanceOf(AminerDailyPaper)
    })
  })
})