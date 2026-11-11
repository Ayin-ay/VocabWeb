import { useEffect, useMemo, useRef, useState } from 'react'
import { Game2048 } from '../components/Game2048'
import { Keyboard } from '../components/Keyboard'
import { ALL, POS_LABELS } from '../lib/lexicon'
import { front, stageOf, stats } from '../lib/deposit'
import { generate, sameSpelling } from '../lib/quiz'
import type { Question } from '../lib/quiz'
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

const elapsed = (from: string, to: string | null) => {
  if (!to) return '—'
  const ms = new Date(to).getTime() - new Date(from).getTime()
  const min = Math.floor(ms / 60000)
  return `${min} 分 ${Math.round((ms % 60000) / 1000)} 秒`
}

export function DepositView({ app }: { app: App }) {
  const { deposit, sprint } = app
  const [given, setGiven] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [kbOpen, setKbOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const verdictRef = useRef<Verdict | null>(null)
  verdictRef.current = verdict
  const swipe = useSwipeNext(() => setVerdict(null), Boolean(verdict))

  /** 判定卡还挂着时，返回键先把它关掉而不是退到别的屏 */
  useEffect(
    () =>
      registerBack(() => {
        if (!verdictRef.current) return false
        setVerdict(null)
        return true
      }),
    []
  )

  const word = deposit && !verdict ? front(deposit) : null
  const stage = word ? stageOf(word) : 'choice'

  const choice: Question | null = useMemo(
    () => (word && stage === 'choice' ? generate([word], { kinds: ['en2cn'], count: 1, all: ALL })[0] ?? null : null),
    [word?.id, stage]
  )

  const s = deposit ? stats(deposit) : null

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

  const say = (text: string) => speak(text, { rate: app.settings.ttsRate, voiceURI: app.settings.voiceURI })

  const answer = (correct: boolean, text: string) => {
    if (!word) return
    app.depositAnswer(word.id, correct)
    setVerdict({ word, stage, correct, given: text })
    setGiven('')
  }

  const submitSpell = () => {
    if (!word || !given.trim()) return
    answer(sameSpelling(given, word.en), given.trim())
  }

  if (!deposit || !s) {
    return (
      <section className="panel">
        <h3>沉淀训练</h3>
        <div className="row">
          <span className="tag">冲刺里错过 {app.missed} 个</span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const n = app.depositCollect()
              if (n) setVerdict(null)
            }}
            disabled={!app.missed}
          >
            开始沉淀
          </button>
        </div>
      </section>
    )
  }

  const done = !s.pending

  return (
    <div className="sprint" data-stage={verdict ? 'verdict' : stage}>
      <div className="panel sprint-head">
        <div className="row-between">
          <div className="row">
            <span className="kpi">
              {s.done}
              <small>/ {s.total} 已沉淀</small>
            </span>
            <span className="sprint-extra">
              <span className="tag">待过 {s.pending}</span>
              <span className="tag">正确率 {s.accuracy}%</span>
              <span className="tag">第 {deposit.round} 轮</span>
            </span>
          </div>
          {!app.storageOk && <span className="tag" data-tone="warn">存储不可写</span>}
          <button
            type="button"
            onClick={() => {
              if (!confirm(`重新收名单会丢掉当前这份 ${s.total} 个词的练习记录，按现在冲刺的错过词重建。`)) return
              app.depositCollect()
              setVerdict(null)
              setGiven('')
            }}
          >
            重收名单
          </button>
        </div>
        <div className="bar">
          <i style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
        </div>
      </div>

      {done && (
        <section className="panel">
          <h3>第 {deposit.round} 轮沉淀完成</h3>
          <div className="row">
            <span className="kpi">
              {s.accuracy}%<small>正确率</small>
            </span>
            <span className="tag">用时 {elapsed(deposit.startedAt, deposit.finishedAt)}</span>
            <span className="tag">答错 {s.wrong} 次</span>
          </div>
          <div className="row sprint-actions">
            <button type="button" className="btn-primary" onClick={() => { app.depositAgain(); setVerdict(null); setGiven('') }}>
              再练一轮
            </button>
            <button type="button" onClick={app.depositClear}>
              清空名单
            </button>
          </div>
        </section>
      )}

      {!done && word && !verdict && (
        <section className="panel sprint-q">
          <div className="row-between">
            <span className="tag">{stage === 'spell' ? '拼写' : '选中文'}</span>
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
                {deposit.items[word.id]?.wrong ? <span className="tag" data-tone="warn">已错 {deposit.items[word.id]?.wrong} 次</span> : null}
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
                {deposit.items[word.id]?.wrong ? <span className="tag" data-tone="warn">已错 {deposit.items[word.id]?.wrong} 次</span> : null}
              </div>
              <button type="button" className="sprint-typed" data-empty={given ? undefined : '1'} onClick={() => setKbOpen(true)}>
                {given || (kbOpen ? '用下面的键盘拼写' : '点这里打开键盘')}
              </button>
            </>
          )}
        </section>
      )}

      {verdict && (
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

      {sprint && (
        <Game2048 game={sprint.game} canMove={sprint.canMove} onMove={app.sprintMove} onNewBoard={app.sprintNewBoard} />
      )}

      {!done && word && stage === 'spell' && !verdict && (
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
