/**
 * AMiner Deep Search Skill测试
 * @module src/lib/__tests__/aminer-deep-search.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AminerDeepSearch, createDeepSearch } from '../aminer-deep-search'
import { AminerConfig } from '../aminer-skill'

const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn'
}

describe('AminerDeepSearch', () => {
  let skill: AminerDeepSearch

  beforeEach(() => {
    skill = new AminerDeepSearch(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('aminer-deep-search')
      expect(info.endpoint).toBe('/api/search/deep')
    })
  })

  describe('搜索参数验证', () => {
    it('空查询应该抛出错误', async () => {
      await expect(skill.search({ query: '' })).rejects.toThrow('搜索关键词不能为空')
    })
  })

  describe('深度搜索', () => {
    it('应该返回搜索结果树', async () => {
      const mockResponse = {
        resultTree: {
          paper: {
            paperId: '1',
            title: 'Root Paper',
            authors: ['Author 1'],
            abstract: 'Abstract',
            year: 2024,
            citationCount: 10,
            url: 'https://example.com/paper/1'
          },
          level: 0
        },
        totalNodes: 1,
        took: 200,
        searchPath: ['1']
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const response = await skill.search({ query: 'test' })
      expect(response.totalNodes).toBe(1)
      expect(response.searchPath).toEqual(['1'])
    })
  })

  describe('快速搜索', () => {
    it('应该返回论文列表', async () => {
      const mockResponse = {
        resultTree: {
          paper: {
            paperId: '1',
            title: 'Root Paper',
            authors: ['Author 1'],
            abstract: 'Abstract',
            year: 2024,
            citationCount: 10,
            url: 'https://example.com/paper/1'
          },
          citations: [],
          references: [],
          level: 0
        },
        totalNodes: 1,
        took: 100,
        searchPath: ['1']
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const papers = await skill.quickSearch('test')
      expect(papers).toHaveLength(1)
    })
  })

  describe('获取引用网络', () => {
    it('应该返回网络结构', async () => {
      const mockResponse = {
        resultTree: {
          paper: {
            paperId: '1',
            title: 'Root Paper',
            authors: ['Author 1'],
            abstract: 'Abstract',
            year: 2024,
            citationCount: 10,
            url: 'https://example.com/paper/1'
          },
          citations: [
            {
              paper: {
                paperId: '2',
                title: 'Citing Paper',
                authors: ['Author 2'],
                abstract: 'Abstract',
                year: 2024,
                citationCount: 5,
                url: 'https://example.com/paper/2'
              },
              level: 1
            }
          ],
          references: [],
          level: 0
        },
        totalNodes: 2,
        took: 150,
        searchPath: ['1', '2']
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const network = await skill.getCitationNetwork('test')
      expect(network.nodes).toBeDefined()
      expect(network.edges).toBeDefined()
    })
  })

  describe('工厂函数', () => {
    it('createDeepSearch应该返回正确的实例', () => {
      const instance = createDeepSearch(testConfig)
      expect(instance).toBeInstanceOf(AminerDeepSearch)
    })
  })
})