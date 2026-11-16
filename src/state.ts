import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KEYS, loadMap, probeStorage, save, useJson, useMap, useObject } from './lib/store'
import { DEFAULT_LLM } from './lib/llm'
import { move as move2048, newGame } from './lib/game2048'
import type { Dir } from './lib/game2048'
import { fxMemory, fxMove, fxPenalty } from './lib/gamefx'
import type { FxMemory, GameFx } from './lib/gamefx'
import { answer as sprintAnswerOf, addLib, initSprint, normalize as normalizeSprint, removeLib, rewardOf, setMark } from './lib/sprint'
import type { SprintState } from './lib/sprint'
import { answer as depositAnswerOf, DEPOSIT_STREAK, newDeposit, normalize as normalizeDeposit, requeue as depositRequeue, rosterOf } from './lib/deposit'
import type { DepositState } from './lib/deposit'
import { add as addDay, dayKey, normalize as normalizeDays, todayRow, weekRow } from './lib/days'
import type { Days } from './lib/days'
import { DriftError, wrapBackup, unwrapBackup } from './lib/backup'
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

  /**
   * 2048 的动效信号：只活在内存里，一个字都不进存档，所以刷新页面最多丢掉连击计数。
   * seq 每发生一次就加一，Game2048 拿它当 key 让动画重新起播。
   */
  const [gameFx, setGameFx] = useState<GameFx | null>(null)
  const fxMem = useRef<FxMemory | null>(null)

  const fxBump = useCallback((step: (mem: FxMemory) => { fx: GameFx; mem: FxMemory }, board: number[]) => {
    const r = step(fxMem.current ?? fxMemory(board))
    fxMem.current = r.mem
    setGameFx(r.fx)
  }, [])

  const fxReset = useCallback((board: number[]) => {
    fxMem.current = fxMemory(board)
    setGameFx(null)
  }, [])

  /** 按天计数：卷王榜的数据源，先从今天起记 */
  const [daysRaw, setDaysRaw] = useJson<Days>(KEYS.days, {})
  const days = useMemo(() => normalizeDays(daysRaw), [daysRaw])
  const dayToday = useMemo(() => todayRow(days), [days])
  const dayWeek = useMemo(() => weekRow(days), [days])
  const bumpDay = useCallback(
    (d: Parameters<typeof addDay>[2]) => setDaysRaw((prev) => addDay(normalizeDays(prev), dayKey(), d)),
    [setDaysRaw]
  )

  const sprintAnswer = useCallback(
    (id: string, correct: boolean) => {
      if (!sprint) return
      const next = sprintAnswerOf(sprint, id, correct)
      setSprintRaw(next.state)
      if (!correct) fxBump((mem) => fxPenalty(mem, next.spawned, next.warned), next.state.game.board)
      const before = sprint.items[id]?.mastered ?? false
      const after = next.state.items[id]?.mastered ?? false
      bumpDay({
        answered: 1,
        right: correct ? 1 : 0,
        wrong: correct ? 0 : 1,
        mastered: (after ? 1 : 0) - (before ? 1 : 0),
        best: next.state.game.score,
      })
    },
    [sprint, setSprintRaw, bumpDay, fxBump]
  )

  /** 答对换来的那一步；方向无效则不消耗 */
  const sprintMove = useCallback(
    (dir: Dir) => {
      if (!sprint || !sprint.canMove) return
      const r = move2048(sprint.game, dir)
      if (!r.moved) return
      setSprintRaw({ ...sprint, game: r.state, canMove: false })
      fxBump((mem) => fxMove(mem, r), r.state.board)
      bumpDay({ best: r.state.score })
    },
    [sprint, setSprintRaw, bumpDay, fxBump]
  )

  /** 词库整取整放：加进来的排到队尾，撤掉的只取消还没轮到的那些，已答记录一律保留 */
  const sprintSetLib = useCallback(
    (libId: string, on: boolean) => {
      setSprintRaw((s) => {
        if (!s) return s
        const next = normalizeSprint(s)
        return on ? addLib(next, libId) : removeLib(next, libId)
      })
    },
    [setSprintRaw]
  )

  /** 判定卡上的「进沉淀 / 不进沉淀」自评，只影响名单去向 */
  const sprintMark = useCallback(
    (id: string, mark: 'in' | 'out') => {
      setSprintRaw((s) => (s ? setMark(normalizeSprint(s), id, mark) : s))
    },
    [setSprintRaw]
  )

  const sprintNewBoard = useCallback(() => {
    if (!sprint) return
    const game = newGame(sprint.game.best)
    setSprintRaw({ ...sprint, game })
    fxReset(game.board)
  }, [sprint, setSprintRaw, fxReset])

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

  /**
   * 重新开始只重洗当前选中的词库：一个都没选就留空，不许偷偷把全库塞回去。
   * 答错记录只存在冲刺这一份档里，重洗就把本轮的错题来源一起抹掉，所以先替它收进沉淀；
   * 沉淀里已经有一批在练时不动那批，免得把正在做的名单换掉。
   */
  const sprintRestart = useCallback(() => {
    if (!deposit) depositCollect()
    const next = initSprint(sprint ? sprint.scope : undefined, sprintRaw?.game.best ?? 0)
    setSprintRaw(next)
    fxReset(next.game.board)
  }, [deposit, depositCollect, setSprintRaw, sprintRaw, sprint, fxReset])

  /** 棋盘仍然归冲刺那份档管，沉淀只负责自己的名单与计数 */
  const depositAnswer = useCallback(
    (id: string, correct: boolean) => {
      if (!deposit) return
      const next = depositAnswerOf(deposit, id, correct)
      setDepositRaw(next)
      const reward = sprint ? rewardOf(sprint.game, correct) : null
      setSprintRaw((s) => {
        if (!s) return s
        const r = rewardOf(s.game, correct)
        return { ...s, game: r.game, canMove: r.canMove }
      })
      if (reward && !correct) fxBump((mem) => fxPenalty(mem, reward.spawned, reward.warned), reward.game.board)
      bumpDay({
        answered: 1,
        right: correct ? 1 : 0,
        wrong: correct ? 0 : 1,
        deposited: (next.items[id]?.streak ?? 0) >= DEPOSIT_STREAK ? 1 : 0,
        best: reward ? reward.game.score : 0
      })
    },
    [deposit, sprint, setDepositRaw, setSprintRaw, bumpDay, fxBump]
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
    let parsed: Record<string, unknown>
    try {
      parsed = unwrapBackup(text)
    } catch (e) {
      if (!(e instanceof DriftError)) throw e
      if (!confirm(`${e.message}？`)) throw new Error('已取消，进度没动')
      parsed = unwrapBackup(text, true)
    }
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
    sprint, sprintAnswer, sprintMove, sprintRestart, sprintNewBoard, sprintSetLib, sprintMark, gameFx,
    deposit, missed, depositCollect, depositAnswer, depositAgain, depositClear,
    days, dayToday, dayWeek,
    exportAll, importAll,
    storageOk
  }
}

export type App = ReturnType<typeof useAppState>
