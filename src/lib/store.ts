import { useCallback, useState } from 'react'

const PREFIX = 'vocab.'

export const KEYS = {
  progress: `${PREFIX}progress.v1`,
  settings: `${PREFIX}settings.v1`,
  llm: `${PREFIX}llm.v1`,
  ai: `${PREFIX}ai.v1`,
  records: `${PREFIX}records.v1`,
  sprint: `${PREFIX}sprint.v1`,
  deposit: `${PREFIX}deposit.v1`
} as const

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? ({ ...(fallback as object), ...(JSON.parse(raw) as object) } as T) : fallback
  } catch {
    return fallback
  }
}

/** map 型记录直接整体存，不做浅合并（浅合并会把删除的键又带回来） */
export function loadMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, T>) : {}
  } catch {
    return {}
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 无痕模式或配额满：本次会话内仍可用，只是不落盘 */
  }
}

type MapUpdate<T> = Record<string, T> | ((prev: Record<string, T>) => Record<string, T>)

/** 无痕模式、微信内置浏览器、退出即清站点数据——写进去读不回来就等于没存 */
export function probeStorage(): boolean {
  try {
    const key = `${PREFIX}probe.v1`
    localStorage.setItem(key, '1')
    const ok = localStorage.getItem(key) === '1'
    localStorage.removeItem(key)
    return ok
  } catch {
    return false
  }
}

export function useMap<T>(key: string): [Record<string, T>, (next: MapUpdate<T>) => void] {
  const [map, setMap] = useState<Record<string, T>>(() => loadMap<T>(key))
  const update = useCallback(
    (next: MapUpdate<T>) => {
      setMap((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        save(key, value)
        return value
      })
    },
    [key]
  )
  return [map, update]
}

/** 整体存取的记录：不做浅合并，避免旧字段把新结构污染回来 */
export function useJson<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  })
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        save(key, v)
        return v
      })
    },
    [key]
  )
  return [value, update]
}

export function useObject<T extends object>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback))
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? next(prev) : next
        save(key, v)
        return v
      })
    },
    [key]
  )
  return [value, update]
}
