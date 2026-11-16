import { useEffect, useRef } from 'react'
import { maxValue, WARN_LIMIT } from '../lib/game2048'
import type { Dir, GameState } from '../lib/game2048'
import { COMBO_MERGES, COMBO_STREAK } from '../lib/gamefx'
import type { GameFx } from '../lib/gamefx'
import { sfx } from '../lib/sfx'

const ARROWS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export function Game2048({
  game,
  canMove,
  fx,
  onMove,
  onNewBoard
}: {
  game: GameState
  canMove: boolean
  fx: GameFx | null
  onMove: (d: Dir) => void
  onNewBoard: () => void
}) {
  const start = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = ARROWS[e.key]
      if (!d || !canMove) return
      e.preventDefault()
      onMove(d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canMove, onMove])

  // 音效跟着 fx 的 seq 走：同一个 seq 只响一次，重渲染不会重复播
  useEffect(() => {
    if (!fx) return
    if (fx.milestone) sfx.milestone(fx.milestone)
    else if (fx.combo >= COMBO_MERGES) sfx.merge(fx.combo)
    else if (fx.streak >= COMBO_STREAK) sfx.streak(fx.streak)
    else if (fx.combo > 0) sfx.merge(1)
    if (fx.warned) sfx.warn()
  }, [fx?.seq])

  const endSwipe = (x: number, y: number) => {
    const s = start.current
    start.current = null
    if (!s || !canMove) return
    const dx = x - s.x
    const dy = y - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    onMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  }

  const popped = (i: number) => Boolean(fx?.pop.includes(i))
  const born = (i: number) => fx?.spawn === i

  return (
    <section className="panel game-panel">
      <div className="row-between game-head">
        <h3>2048</h3>
        <div className="row">
          <span className="tag">{game.score}</span>
          <span className="tag">最高 {game.best}</span>
          <span className="tag" data-tone={canMove ? undefined : 'warn'}>{canMove ? '可移动一步' : '锁定'}</span>
          {game.warn > 0 && (
            <span className="tag" data-tone="warn">
              警示 {Math.min(game.warn, WARN_LIMIT)}/{WARN_LIMIT}
            </span>
          )}
        </div>
      </div>
      <div
        className="board"
        key={game.over ? 'dead' : 'live'}
        data-over={game.over ? '1' : '0'}
        data-warn={game.warn}
        data-shake={game.warn > 0 ? (game.warn % 2 === 1 ? 'a' : 'b') : undefined}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY } }}
        onPointerUp={(e) => endSwipe(e.clientX, e.clientY)}
        onPointerCancel={() => { start.current = null }}
      >
        {game.board.map((v, i) => (
          <div
            className={`tile${v ? ` t${Math.min(v, 2048)}` : ''}`}
            // 换 key 是为了让这一格整个重挂一次，CSS 动画才会重新起播；fx.seq 每步都在变
            key={popped(i) ? `p${i}-${fx?.seq}` : born(i) ? `n${i}-${fx?.seq}` : i}
            data-pop={popped(i) ? '1' : undefined}
            data-new={born(i) ? '1' : undefined}
          >
            {v || ''}
          </div>
        ))}
        {fx && fx.gained > 0 && (
          <span className="float-score" key={`f${fx.seq}`}>
            +{fx.gained}
          </span>
        )}
        {fx && fx.combo >= COMBO_MERGES && (
          <span className="fx-badge" key={`c${fx.seq}`}>
            {fx.combo} 对合并
          </span>
        )}
        {fx && fx.combo < COMBO_MERGES && fx.streak >= COMBO_STREAK && (
          <span className="fx-badge" key={`s${fx.seq}`}>
            连击 {fx.streak}
          </span>
        )}
        {fx?.milestone && (
          <>
            <span className="fx-flash" key={`x${fx.seq}`} />
            <span className="fx-milestone" key={`m${fx.seq}`}>
              合成 {fx.milestone}
            </span>
          </>
        )}
        {game.over && (
          <div className="board-over">
            <button type="button" className="btn-primary" onClick={onNewBoard}>
              {game.warn >= WARN_LIMIT ? '满格三次警示，重开' : '棋盘满了，重开'}
            </button>
          </div>
        )}
      </div>
      <div className="row-between game-pad">
        <span className="muted game-max">最大 {maxValue(game.board)}</span>
        <div className="dpad">
          <button type="button" data-d="up" aria-label="上" disabled={!canMove} onClick={() => onMove('up')}>↑</button>
          <button type="button" data-d="left" aria-label="左" disabled={!canMove} onClick={() => onMove('left')}>←</button>
          <button type="button" data-d="right" aria-label="右" disabled={!canMove} onClick={() => onMove('right')}>→</button>
          <button type="button" data-d="down" aria-label="下" disabled={!canMove} onClick={() => onMove('down')}>↓</button>
        </div>
      </div>
    </section>
  )
}
