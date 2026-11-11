import { useCallback, useEffect, useMemo } from 'react'
import { KEYS, loadMap, probeStorage, save, useJson, useMap, useObject } from './lib/store'
import { DEFAULT_LLM } from './lib/llm'
import { move as move2048, newGame } from './lib/game2048'
import type { Dir } from './lib/game2048'
import { answer as sprintAnswerOf, initSprint, normalize as normalizeSprint, rewardOf } from './lib/sprint'
import type { SprintState } from './lib/sprint'
import { answer as depositAnswerOf, newDeposit, normalize as normalizeDeposit, requeue as depositRequeue, rosterOf } from './lib/deposit'
import type { DepositState } from './lib/deposit'
import { wrapBackup, unwrapBackup } from './lib/backup'
import { grade as srsGrade, newCard } from './lib/srs'
import type { AiNote, CardState, Grade, LlmConfig, QuizRecord, Settings } from './lib/types'

export const DEFAULT_SETTINGS: Settings = { showZh: true, ttsRate: 0.9, voiceURI: '' }

export function useAppState() {
  const [progress, setProgress] = useMap<CardState>(KEYS.progress)
  const [settings, setSettings] = useObject<Settings>(KEYS.settings, DEFAULT_SETTINGS)
  const [llm, setLlm] = useObject<LlmConfig>(KEYS.llm, DEFAULT_LLM)
  const [ai, setAi] = useMap<AiNote>(KEYS.ai)
  const [records, setRecords] = useObject<{ items: QuizRecord[] }>(KEYS.records, { items: [] })

  const bump = useCallback(
    (id: string, g: Grade) => setProgress((p) => ({ ...p, [id]: srsGrade(p[id] ?? newCard(), g) })),
    [setProgress]
  )

  const setKnown = useCallback(
    (id: string, known: boolean) => setProgress((p) => ({ ...p, [id]: { ...(p[id] ?? newCard()), known } })),
    [setProgress]
  )

  const mergeAi = useCallback((chunk: Record<string, AiNote>) => setAi((prev) => ({ ...prev, ...chunk })), [setAi])

  const addRecord = useCallback(
    (r: QuizRecord) => setRecords((prev) => ({ items: [r, ...prev.items].slice(0, 200) })),
    [setRecords]
  )

  const [sprintRaw, setSprintRaw] = useJson<SprintState | null>(KEYS.sprint, null)

  useEffect(() => {
    if (!sprintRaw) setSprintRaw(initSprint())
  }, [sprintRaw, setSprintRaw])

  const sprint = sprintRaw ? normalizeSprint(sprintRaw) : null

  const sprintAnswer = useCallback(
    (id: string, correct: boolean) => {
      if (!sprint) return
      setSprintRaw(sprintAnswerOf(sprint, id, correct).state)
    },
    [sprint, setSprintRaw]
  )

  /** 答对换来的那一步；方向无效则不消耗 */
  const sprintMove = useCallback(
    (dir: Dir) => {
      setSprintRaw((s) => {
        if (!s || !s.canMove) return s
        const r = move2048(s.game, dir)
        return r.moved ? { ...s, game: r.state, canMove: false } : s
      })
    },
    [setSprintRaw]
  )

  const sprintRestart = useCallback(
    () => setSprintRaw(initSprint(sprintRaw?.game.best ?? 0)),
    [setSprintRaw, sprintRaw]
  )

  const sprintNewBoard = useCallback(
    () => setSprintRaw((s) => (s ? { ...s, game: newGame(s.game.best) } : s)),
    [setSprintRaw]
  )

  const [depositRaw, setDepositRaw] = useJson<DepositState | null>(KEYS.deposit, null)

  const deposit = depositRaw ? normalizeDeposit(depositRaw) : null

  const missed = useMemo(() => (sprint ? rosterOf(sprint).length : 0), [sprint])

  /** 名单从当前这轮冲刺里现收，收进来之后冲刺再怎么变动都不影响已经在练的这批 */
  const depositCollect = useCallback(() => {
    if (!sprint) return 0
    const ids = rosterOf(sprint)
    if (!ids.length) return 0
    setDepositRaw(newDeposit(ids))
    return ids.length
  }, [sprint, setDepositRaw])

  /** 棋盘仍然归冲刺那份档管，沉淀只负责自己的名单与计数 */
  const depositAnswer = useCallback(
    (id: string, correct: boolean) => {
      if (!deposit) return
      setDepositRaw(depositAnswerOf(deposit, id, correct))
      setSprintRaw((s) => {
        if (!s) return s
        const r = rewardOf(s.game, correct)
        return { ...s, game: r.game, canMove: r.canMove }
      })
    },
    [deposit, setDepositRaw, setSprintRaw]
  )

  const depositAgain = useCallback(() => setDepositRaw((d) => (d ? depositRequeue(d) : d)), [setDepositRaw])

  const depositClear = useCallback(() => setDepositRaw(null), [setDepositRaw])

  /** 备份文件里不许带 apiKey，所以模型通道整段排除在导出之外 */
  const exportAll = useCallback(
    () =>
      wrapBackup(
        Object.fromEntries(
          Object.entries(KEYS)
            .filter(([name]) => name !== 'llm')
            .map(([name, key]) => [name, loadMap<unknown>(key)])
        )
      ),
    []
  )

  const importAll = useCallback((text: string) => {
    const parsed = unwrapBackup(text)
    for (const [k, key] of Object.entries(KEYS)) if (parsed[k] !== undefined) save(key, parsed[k])
    location.reload()
  }, [])

  const storageOk = useMemo(probeStorage, [])

  return {
    progress, setProgress, bump, setKnown,
    settings, setSettings,
    llm, setLlm,
    ai, mergeAi, setAi,
    records, setRecords, addRecord,
    sprint, sprintAnswer, sprintMove, sprintRestart, sprintNewBoard,
    deposit, missed, depositCollect, depositAnswer, depositAgain, depositClear,
    exportAll, importAll,
    storageOk
  }
}

export type App = ReturnType<typeof useAppState>
