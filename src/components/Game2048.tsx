import { useEffect, useRef } from 'react'
import { maxValue } from '../lib/game2048'
import type { Dir, GameState } from '../lib/game2048'

const ARROWS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export function Game2048({ game, canMove, onMove, onNewBoard }: { game: GameState; canMove: boolean; onMove: (d: Dir) => void; onNewBoard: () => void }) {
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

  const endSwipe = (x: number, y: number) => {
    const s = start.current
    start.current = null
    if (!s || !canMove) return
    const dx = x - s.x
    const dy = y - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    onMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  }

  return (
    <section className="panel game-panel">
      <div className="row-between game-head">
        <h3>2048</h3>
        <div className="row">
          <span className="tag">{game.score}</span>
          <span className="tag">最高 {game.best}</span>
          <span className="tag" data-tone={canMove ? undefined : 'warn'}>{canMove ? '可移动一步' : '锁定'}</span>
        </div>
      </div>
      <div
        className="board"
        data-over={game.over ? '1' : '0'}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY } }}
        onPointerUp={(e) => endSwipe(e.clientX, e.clientY)}
        onPointerCancel={() => { start.current = null }}
      >
        {game.board.map((v, i) => (
          <div className={`tile${v ? ` t${Math.min(v, 2048)}` : ''}`} key={i}>
            {v || ''}
          </div>
        ))}
        {game.over && (
          <div className="board-over">
            <button type="button" className="btn-primary" onClick={onNewBoard}>
              棋盘满了，重开
            </button>
          </div>
        )}
      </div>
      <div className="row-between game-pad">
        <span className="muted game-max">最大 {maxValue(game.board)}</span>
        <div className="dpad">
          <button type="button" aria-label="上" disabled={!canMove} onClick={() => onMove('up')}>↑</button>
          <button type="button" aria-label="左" disabled={!canMove} onClick={() => onMove('left')}>←</button>
          <button type="button" aria-label="下" disabled={!canMove} onClick={() => onMove('down')}>↓</button>
          <button type="button" aria-label="右" disabled={!canMove} onClick={() => onMove('right')}>→</button>
        </div>
      </div>
    </section>
  )
}
