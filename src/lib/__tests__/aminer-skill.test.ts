/**
 * AMiner Skill基类测试
 * @module src/lib/__tests__/aminer-skill.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AminerSkillBase, AminerError, AminerConfig } from '../aminer-skill'

// 测试配置
const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn',
  timeout: 5000,
  maxRetries: 2,
  retryDelay: 500,
  tokenExpiry: 3600
}

// 测试用Skill实现
class TestSkill extends AminerSkillBase {
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo('test-skill', '/api/test')
  }

  async testRequest(params: Record<string, unknown>) {
    return this.request<{ success: boolean }, Record<string, unknown>>('POST', params)
  }
}

describe('AminerSkillBase', () => {
  let skill: TestSkill

  beforeEach(() => {
    skill = new TestSkill(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化配置', () => {
      expect(skill.getConfig().apiKey).toBe('test-api-key')
      expect(skill.getConfig().baseUrl).toBe('https://test-api.aminer.cn')
    })

    it('没有API Key时应该抛出错误', () => {
      expect(() => {
        new TestSkill({ apiKey: '' })
      }).toThrow('AMiner API Key未配置')
    })

    it('应该使用默认配置', () => {
      const minimalSkill = new TestSkill({ apiKey: 'test-key' })
      const config = minimalSkill.getConfig()
      expect(config.baseUrl).toBe('https://api.aminer.cn')
      expect(config.timeout).toBe(30000)
      expect(config.maxRetries).toBe(3)
    })
  })

  describe('Token生成', () => {
    it('Token签名已移至Rust后端，前端返回空字符串', () => {
      const token = skill['generateToken']()
      expect(token).toBe('')
    })

    it('多次调用返回一致的空Token（无前端缓存）', () => {
      const token1 = skill['generateToken']()
      const token2 = skill['generateToken']()
      expect(token1).toBe(token2)
    })

    it('更新配置后Token保持为空（Authorization由后端aminer_request注入）', async () => {
      const token1 = skill['generateToken']()
      await new Promise(resolve => setTimeout(resolve, 10))
      skill.updateConfig({ timeout: 10000 })
      const token2 = skill['generateToken']()
      expect(token1).toBe('')
      expect(token2).toBe('')
    })
  })

  describe('请求方法', () => {
    it('应该正确获取Skill信息', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('test-skill')
      expect(info.endpoint).toBe('/api/test')
    })

    it('应该正确更新配置', () => {
      skill.updateConfig({ timeout: 10000, maxRetries: 5 })
      const config = skill.getConfig()
      expect(config.timeout).toBe(10000)
      expect(config.maxRetries).toBe(5)
    })
  })

  describe('错误处理', () => {
    it('应该正确抛出AminerError', () => {
      const error = new AminerError('TEST_ERROR', '测试错误', 'test-skill')
      expect(error.code).toBe('TEST_ERROR')
      expect(error.message).toBe('测试错误')
      expect(error.skill).toBe('test-skill')
      expect(error.name).toBe('AminerError')
    })
  })

  describe('延迟函数', () => {
    it('应该正确延迟指定时间', async () => {
      const startTime = Date.now()
      await skill['delay'](100)
      const endTime = Date.now()
      expect(endTime - startTime).toBeGreaterThanOrEqual(100)
    })
  })
})