import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import zh from './locales/zh.json'

const retiredSections = new Set(['TeamCollaborationDialog'])

function scalarEntries(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') {
    return [[prefix, value]]
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) =>
    scalarEntries(child, prefix ? `${prefix}.${key}` : key)
  )
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, value)
}

function placeholders(value: string): string[] {
  return value.match(/\{\{[^}]+\}\}/g)?.sort() ?? []
}

describe('Team Space Chinese locale', () => {
  it('covers every active Team Space string without changing interpolation tokens', () => {
    const english = en.auto.components.team.space
    const chinese = zh.auto.components.team.space
    const activeEnglish = Object.fromEntries(
      Object.entries(english).filter(([section]) => !retiredSections.has(section))
    )

    for (const [path, englishValue] of scalarEntries(activeEnglish)) {
      const chineseValue = valueAtPath(chinese, path)
      expect(chineseValue, path).toEqual(expect.any(String))
      expect((chineseValue as string).trim(), path).not.toBe('')
      expect(placeholders(chineseValue as string), path).toEqual(placeholders(englishValue))
    }
  })
})
