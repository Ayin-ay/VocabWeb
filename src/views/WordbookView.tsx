import { useMemo, useState } from 'react'
import { ALL, LIBS, libsOf } from '../lib/lexicon'
import { speak } from '../lib/tts'
import type { App } from '../state'

/** 一次渲染 120 条：手机上五千行一次性铺开会卡住滚动 */
const PAGE = 120

/**
 * 单词本：全库都在这里，按词库筛。
 * 一个词形在教材单元和四级里各有一份时，归属按词形算，所以两边筛选都能查到它。
 */
export function WordbookView({ app }: { app: App }) {
  const [lib, setLib] = useState('')
  const [shared, setShared] = useState(false)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)

  const rows = useMemo(() => ALL.map((w) => ({ w, libs: libsOf(w) })), [])
  const sharedTotal = useMemo(() => rows.filter((r) => r.libs.length > 1).length, [rows])

  const list = useMemo(() => {
    const key = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (shared && r.libs.length < 2) return false
      if (lib && !r.libs.includes(lib)) return false
      if (!key) return true
      return r.w.en.toLowerCase().includes(key) || r.w.zh.includes(key)
    })
  }, [rows, lib, shared, q])

  const pick = (id: string, on: boolean) => {
    setLib(on ? id : '')
    if (on) setShared(false)
    setShown(PAGE)
  }

  const say = (text: string) => speak(text, { rate: app.settings.ttsRate, voiceURI: app.settings.voiceURI })
  const items = app.sprint?.items ?? {}

  return (
    <div className="wb">
      <section className="panel wb-head">
        <input
          className="wb-q"
          type="search"
          value={q}
          placeholder="查拼写或中文"
          onChange={(e) => {
            setQ(e.target.value)
            setShown(PAGE)
          }}
        />
        <div className="wb-filters">
          <button type="button" className="chip" data-on={!lib && !shared ? '1' : '0'} onClick={() => { setLib(''); setShared(false) }}>
            全部 {ALL.length}
          </button>
          {LIBS.map((l) => (
            <button key={l.id} type="button" className="chip" data-on={lib === l.id ? '1' : '0'} onClick={() => pick(l.id, lib !== l.id)}>
              {l.label} {l.ids.length}
            </button>
          ))}
          <button type="button" className="chip" data-on={shared ? '1' : '0'} onClick={() => { setShared((v) => !v); setLib('') }}>
            共有 {sharedTotal}
          </button>
        </div>
        <div className="muted">
          {list.length === ALL.length ? `${ALL.length} 条` : `筛出 ${list.length} 条 / 全库 ${ALL.length} 条`} · 点一行朗读拼写
        </div>
      </section>

      <section className="panel wb-list">
        {list.length === 0 && <div className="muted">没有符合条件的词条</div>}
        {list.slice(0, shown).map(({ w, libs }) => {
          const st = items[w.id]
          return (
            <button key={w.id} type="button" className="wb-row" onClick={() => say(w.en)}>
              <span className="wb-en">
                {w.en}
                {w.pos ? <small>{w.pos}</small> : null}
              </span>
              <span className="wb-zh">{w.zh}</span>
              <span className="wb-tags">
                {libs.map((id) => (
                  <i key={id}>{id}</i>
                ))}
                {st?.mastered ? <i data-tone="ok">已掌握</i> : null}
                {st?.wrong ? <i data-tone="warn">错 {st.wrong}</i> : null}
              </span>
            </button>
          )
        })}
        {shown < list.length && (
          <button type="button" className="chip wb-more" onClick={() => setShown((s) => s + PAGE)}>
            再显示 {Math.min(PAGE, list.length - shown)} 条
          </button>
        )}
      </section>
    </div>
  )
}
