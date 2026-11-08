import { useEffect, useMemo, useState } from 'react'
import { Bar, SectionChips, Speak } from '../components/Bits'
import { LEX, POS_LABELS, wordsOf } from '../lib/lexicon'
import { isWrong, unitStats } from '../lib/srs'
import type { App } from '../state'
import type { SectionKey, Word } from '../lib/types'

function PosTag({ w }: { w: Word }) {
  const label = w.pos ? POS_LABELS[w.pos] ?? w.pos : w.section === 'names' ? '专名' : '短语'
  return <span className="tag">{label}</span>
}

export function StudyView({ app, unitId, setUnitId }: { app: App; unitId: string; setUnitId: (id: string) => void }) {
  const [sections, setSections] = useState<SectionKey[]>(['words', 'phrases', 'names'])
  const [mode, setMode] = useState<'list' | 'card'>('card')
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const list = useMemo(() => wordsOf(unitId).filter((w) => sections.includes(w.section)), [unitId, sections])
  const unit = LEX.units.find((u) => u.id === unitId)!
  const stats = unitStats(wordsOf(unitId), app.progress)
  const w = list[Math.min(idx, list.length - 1)]
  const note = w ? app.ai[w.id] : undefined
  const known = Boolean(w && app.progress[w.id]?.known)

  useEffect(() => {
    if (mode !== 'card') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); setFlipped((f) => !f) }
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, list.length])

  const go = (delta: number) => {
    setIdx((i) => Math.max(0, Math.min(list.length - 1, i + delta)))
    setFlipped(false)
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <section className="panel">
        <div className="row-between">
          <div className="row">
            {LEX.units.map((u) => (
              <button key={u.id} type="button" className="chip" data-on={u.id === unitId ? '1' : '0'} onClick={() => { setUnitId(u.id); setIdx(0); setFlipped(false) }}>
                {u.id}
              </button>
            ))}
          </div>
          <div className="row">
            <button type="button" className="chip" data-on={mode === 'card' ? '1' : '0'} onClick={() => setMode('card')}>
              词卡
            </button>
            <button type="button" className="chip" data-on={mode === 'list' ? '1' : '0'} onClick={() => setMode('list')}>
              列表
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <SectionChips unitId={unitId} value={sections} onChange={(next) => { setSections(next); setIdx(0) }} />
        </div>
        <div className="row-between" style={{ marginTop: 10 }}>
          <span className="muted">
            {unit.label} · 已学 {stats.done}/{stats.total}（{stats.percent}%）{stats.weak ? ` · 待巩固 ${stats.weak}` : ''}
          </span>
          <div style={{ flex: 1, maxWidth: 260 }}>
            <Bar percent={stats.percent} />
          </div>
        </div>
      </section>

      {mode === 'card' && w && (
        <>
          <article className="card" onClick={() => setFlipped((f) => !f)}>
            <div className="row-between">
              <span className="muted mono">
                {idx + 1} / {list.length}
              </span>
              <span className="muted">{w.sectionLabel}</span>
            </div>
            <div className="en">{w.en}</div>
            <div className="row">
              <PosTag w={w} />
              {w.pos && <span className="pos">{w.pos}</span>}
            </div>
            {(flipped || app.settings.showZh) && (
              <>
                <div className="zh">{w.zh}</div>
                {note && (
                  <div className="ai">
                    <div>
                      <b>{note.sentence}</b>
                    </div>
                    <div>{note.translation}</div>
                    {note.collocations && <div>搭配：{note.collocations}</div>}
                    {note.mnemonic && <div>助记：{note.mnemonic}</div>}
                  </div>
                )}
              </>
            )}
            <div className="row" onClick={(e) => e.stopPropagation()}>
              <Speak text={w.en} settings={app.settings} />
              <button type="button" onClick={() => setFlipped((f) => !f)}>
                {flipped || app.settings.showZh ? '隐藏释义' : '显示释义'}
              </button>
              <button type="button" className="btn-primary" onClick={() => app.setKnown(w.id, !known)}>
                {known ? '已掌握' : '标记已掌握'}
              </button>
              {isWrong(app.progress[w.id]) && <span className="tag" data-tone="warn">在错题本</span>}
            </div>
          </article>
          <div className="row">
            <button type="button" onClick={() => go(-1)} disabled={idx === 0}>
              上一条
            </button>
            <button type="button" onClick={() => go(1)} disabled={idx >= list.length - 1}>
              下一条
            </button>
            <span className="muted">空格翻面，← → 翻页</span>
          </div>
        </>
      )}

      {mode === 'list' && (
        <section className="entry-list">
          {list.map((e) => (
            <div key={e.id} className="entry" data-known={app.progress[e.id]?.known ? '1' : '0'}>
              <span className="num mono">{e.num}</span>
              <div>
                <span className="en">{e.en}</span> {e.pos && <span className="muted">{e.pos}</span>}
                <div className="zh">{e.zh}</div>
              </div>
              <div className="row">
                <Speak text={e.en} settings={app.settings} />
                <button type="button" onClick={() => app.setKnown(e.id, !app.progress[e.id]?.known)}>
                  {app.progress[e.id]?.known ? '取消' : '已掌握'}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
