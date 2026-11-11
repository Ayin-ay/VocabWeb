import { useEffect, useMemo, useRef, useState } from 'react'
import { Game2048 } from '../components/Game2048'
import { Keyboard } from '../components/Keyboard'
import { ALL, LIBS, POS_LABELS } from '../lib/lexicon'
import { generate, sameSpelling } from '../lib/quiz'
import type { Question } from '../lib/quiz'
import { ALL_LIBS, front, stats } from '../lib/sprint'
import { speak } from '../lib/tts'
import { registerBack } from '../lib/backstack'
import { useSwipeNext } from '../lib/swipe'
import type { App } from '../state'
import type { Word } from '../lib/types'

interface Verdict {
  word: Word
  stage: 'choice' | 'spell'
  correct: boolean
  given: string
}

const elapsed = (from: string, to: string) => {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  const min = Math.floor(ms / 60000)
  return `${min} 分 ${Math.round((ms % 60000) / 1000)} 秒`
}

export function SprintView({ app }: { app: App }) {
  const sprint = app.sprint
  const [given, setGiven] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [kbOpen, setKbOpen] = useState(false)
  const [reportSeen, setReportSeen] = useState(false)
  const [libOpen, setLibOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const verdictRef = useRef<Verdict | null>(null)
  verdictRef.current = verdict
  const libRef = useRef(libOpen)
  libRef.current = libOpen
  const swipe = useSwipeNext(() => setVerdict(null), Boolean(verdict))

  /** 判定卡、词库面板还挂着时，返回键先把它们关掉而不是退到别的屏 */
  useEffect(
    () =>
      registerBack(() => {
        if (verdictRef.current) {
          setVerdict(null)
          return true
        }
        if (libRef.current) {
          setLibOpen(false)
          return true
        }
        return false
      }),
    []
  )

  const word = sprint && !verdict && !libOpen ? front(sprint) : null
  const item = word && sprint ? sprint.items[word.id] : undefined
  const stage = item?.stage ?? 'choice'

  const choice: Question | null = useMemo(
    () => (word && stage === 'choice' ? generate([word], { kinds: ['en2cn'], count: 1, all: ALL })[0] ?? null : null),
    [word?.id, stage]
  )

  const s = sprint ? stats(sprint) : null

  useEffect(() => {
    if (!verdict?.correct) return
    timer.current = window.setTimeout(() => setVerdict(null), 900)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [verdict])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  if (!sprint || !s) return <section className="panel">正在准备冲刺队列…</section>

  const say = (text: string) => speak(text, { rate: app.settings.ttsRate, voiceURI: app.settings.voiceURI })

  const answer = (correct: boolean, text: string) => {
    if (!word) return
    app.sprintAnswer(word.id, correct)
    setVerdict({ word, stage, correct, given: text })
    setGiven('')
  }

  const submitSpell = () => {
    if (!word || !given.trim()) return
    answer(sameSpelling(given, word.en), given.trim())
  }

  const finished = Boolean(sprint.finishedAt) && !reportSeen

  const queued = new Set(sprint.queue)
  const libRows = LIBS.map((l) => {
    let mastered = 0
    let inQueue = 0
    for (const id of l.ids) {
      if (sprint.items[id]?.mastered) mastered += 1
      if (queued.has(id)) inQueue += 1
    }
    return { id: l.id, label: l.label, total: l.ids.length, mastered, inQueue, on: sprint.scope.includes(l.id) }
  })

  return (
    <div className="sprint" data-stage={verdict ? 'verdict' : stage}>
      <div className="panel sprint-head">
        <div className="row-between">
          <div className="row">
            <span className="kpi">
              {s.mastered}
              <small>/ {s.total} 已掌握</small>
            </span>
            <span className="sprint-extra">
              <span className="tag">待攻 {s.pending}</span>
              <span className="tag">正确率 {s.accuracy}%</span>
              <span className="tag">队列 {sprint.queue.length}</span>
            </span>
          </div>
          {!app.storageOk && <span className="tag" data-tone="warn">存储不可写</span>}
          <button type="button" data-on={libOpen ? '1' : '0'} onClick={() => setLibOpen((v) => !v)}>
            词库 {sprint.scope.length}/{LIBS.length}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm('重新开始会把选中的词库重新洗牌、清掉这一轮的掌握标记，2048 最高分与词库选择保留。')) return
              app.sprintRestart()
              setVerdict(null)
              setReportSeen(false)
            }}
          >
            重新开始
          </button>
        </div>
        <div className="bar">
          <i style={{ width: `${s.total ? (s.mastered / s.total) * 100 : 0}%` }} />
        </div>
      </div>

      {libOpen && (
        <section className="panel lib-panel">
          <div className="row-between">
            <span className="muted">选中即加入本轮：新加的词排到队尾，取消只是撤掉还没轮到它的</span>
            <div className="row">
              <button type="button" className="chip" onClick={() => ALL_LIBS.forEach((id) => app.sprintSetLib(id, true))}>
                全选
              </button>
              <button type="button" className="chip" onClick={() => [...sprint.scope].forEach((id) => app.sprintSetLib(id, false))}>
                全不选
              </button>
            </div>
          </div>
          <div className="lib-list">
            {libRows.map((l) => (
              <button
                key={l.id}
                type="button"
                className="lib-item"
                data-on={l.on ? '1' : '0'}
                onClick={() => app.sprintSetLib(l.id, !l.on)}
              >
                <span className="lib-name">
                  {l.label}
                  <small className="mono">{l.id}</small>
                </span>
                <span className="muted mono">{l.total} 词</span>
                <span className="tag" data-tone={l.mastered === l.total ? 'ok' : undefined}>
                  掌握 {l.mastered}
                </span>
                {l.on ? <span className="muted">在队 {l.inQueue}</span> : null}
              </button>
            ))}
          </div>
        </section>
      )}

      {!libOpen && finished && s.total > 0 && (
        <section className="panel">
          <h3>本轮冲刺完成</h3>
          <div className="row">
            <span className="kpi">
              {s.accuracy}%<small>正确率</small>
            </span>
            <span className="tag">本轮 {s.total} 词</span>
            <span className="tag">用时 {elapsed(sprint.startedAt, sprint.finishedAt!)}</span>
            <span className="tag">拼写关通过 {s.spellDone}</span>
            <span className="tag">2048 最高 {sprint.game.best}</span>
          </div>
          <div className="row sprint-actions">
            <button type="button" className="btn-primary" onClick={() => setReportSeen(true)}>
              继续抽查
            </button>
            <button type="button" onClick={() => setLibOpen(true)}>
              换词库
            </button>
            <button type="button" onClick={() => { app.sprintRestart(); setReportSeen(false); setVerdict(null) }}>
              再来一轮
            </button>
          </div>
        </section>
      )}

      {/* 一个词库都不选时 removeLib 会把这一轮标成完成，那种「完成」是 0 词，该提示选词库而不是出报告 */}
      {!libOpen && !word && !verdict && (!finished || s.total === 0) && (
        <section className="panel sprint-q">
          <div className="muted">本轮队列空了：这一轮取消的词库还没补回来，去「词库」里选一批就能继续。</div>
          <div className="row sprint-actions">
            <button type="button" className="btn-primary" onClick={() => setLibOpen(true)}>
              选词库
            </button>
          </div>
        </section>
      )}

      {!finished && word && !verdict && (
        <section className="panel sprint-q">
          <div className="row-between">
            <span className="tag">{stage === 'spell' ? '第二次遇见 · 拼写' : '第一次遇见 · 选中文'}</span>
            <span className="muted">
              {word.unitId} · {word.sectionLabel}
            </span>
          </div>

          {stage === 'choice' && choice ? (
            <>
              <div className="sprint-word">
                {word.en}
                {word.pos && <span className="sprint-pos">{word.pos} {POS_LABELS[word.pos] ?? ''}</span>}
              </div>
              <div className="row sprint-tools">
                <button type="button" onClick={() => say(word.en)}>
                  朗读
                </button>
                {item?.wrong ? <span className="tag" data-tone="warn">错过 {item.wrong} 次</span> : null}
                {item?.mastered ? <span className="tag">已掌握</span> : null}
              </div>
              {(choice.options ?? []).map((o) => (
                <button key={o} type="button" className="option" onClick={() => answer(o === choice.answer, o)}>
                  {o}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="sprint-zh">{word.zh}</div>
              <div className="row sprint-tools">
                <span className="muted mono">
                  {word.pos || '—'} · {word.en.length} 个字母 · 首字母 {word.en.slice(0, 1)}
                </span>
                {item?.mastered ? <span className="tag">已掌握</span> : null}
              </div>
              <button type="button" className="sprint-typed" data-empty={given ? undefined : '1'} onClick={() => setKbOpen(true)}>
                {given || (kbOpen ? '用下面的键盘拼写' : '点这里打开键盘')}
              </button>
            </>
          )}
        </section>
      )}

      {verdict && !libOpen && (
        <section className="panel sprint-q" {...swipe}>
          <div className="row-between">
            <span className="tag" data-tone={verdict.correct ? undefined : 'warn'}>
              {verdict.correct ? '答对' : '答错'}
            </span>
            <span className="muted">
              {verdict.word.unitId} · {verdict.stage === 'spell' ? '拼写' : '选中文'}
            </span>
          </div>
          <div className="sprint-word">{verdict.word.en}</div>
          <div className="sprint-zh">{verdict.word.zh}</div>
          {verdict.stage === 'spell' && !verdict.correct && (
            <div className="row">
              <span className="mono" style={{ color: 'var(--warn)' }}>{verdict.given || '（未作答）'}</span>
              <span className="mono" style={{ color: 'var(--ok)' }}>{verdict.word.en}</span>
            </div>
          )}
          {app.ai[verdict.word.id]?.sentence && (
            <div className="card-ai">
              <div>{app.ai[verdict.word.id]?.sentence}</div>
              <div className="muted">{app.ai[verdict.word.id]?.translation}</div>
            </div>
          )}
          <div className="row sprint-actions">
            <button type="button" className="btn-primary" onClick={() => setVerdict(null)}>
              下一题
            </button>
            <button type="button" onClick={() => say(verdict.word.en)}>
              朗读
            </button>
          </div>
        </section>
      )}

      <Game2048 game={sprint.game} canMove={sprint.canMove} onMove={app.sprintMove} onNewBoard={app.sprintNewBoard} />

      {word && stage === 'spell' && !verdict && (
        <div className="kb-wrap">
          <div className="kb-bar">
            <button type="button" className="chip" onClick={() => setKbOpen((v) => !v)}>
              {kbOpen ? '收起键盘' : '展开键盘'}
            </button>
          </div>
          {kbOpen && (
            <Keyboard
              onKey={(ch) => setGiven((g) => (g + ch).slice(0, 40))}
              onBack={() => setGiven((g) => g.slice(0, -1))}
              onSubmit={submitSpell}
              onSkip={() => answer(false, given)}
              canSubmit={Boolean(given.trim())}
            />
          )}
        </div>
      )}
    </div>
  )
}
