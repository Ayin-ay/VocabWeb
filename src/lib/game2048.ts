export type Dir = 'up' | 'down' | 'left' | 'right'

export interface GameState {
  /** 16 格，0 表示空 */
  board: number[]
  score: number
  best: number
  over: boolean
}

export const SIZE = 4

export function newGame(best = 0): GameState {
  let board = emptyBoard()
  board = spawn(board)
  board = spawn(board)
  return { board, score: 0, best, over: false }
}

export function emptyBoard(): number[] {
  return Array.from({ length: SIZE * SIZE }, () => 0)
}

export function spawn(board: number[], rand: () => number = Math.random): number[] {
  const holes = board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0)
  if (!holes.length) return board.slice()
  const at = holes[Math.floor(rand() * holes.length)]!
  const next = board.slice()
  next[at] = rand() < 0.9 ? 2 : 4
  return next
}

/** 一行向左滑动并合并：每个数字一次只合并一对，合并得分等于合成后的值 */
function slide(line: number[]): { line: number[]; gained: number } {
  const tiles = line.filter((v) => v !== 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i += 1) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i]! * 2
      out.push(merged)
      gained += merged
      i += 1
    } else {
      out.push(tiles[i]!)
    }
  }
  while (out.length < SIZE) out.push(0)
  return { line: out, gained }
}

/** 按方向取出四条线（统一成「向左滑」的朝向），算完再写回 */
function lines(board: number[], dir: Dir): number[][] {
  const idx = (r: number, c: number) => r * SIZE + c
  const out: number[][] = []
  for (let i = 0; i < SIZE; i += 1) {
    const line: number[] = []
    for (let j = 0; j < SIZE; j += 1) {
      const [r, c] =
        dir === 'left' ? [i, j] : dir === 'right' ? [i, SIZE - 1 - j] : dir === 'up' ? [j, i] : [SIZE - 1 - j, i]
      line.push(board[idx(r!, c!)]!)
    }
    out.push(line)
  }
  return out
}

function writeBack(next: number[][], dir: Dir): number[] {
  const board = emptyBoard()
  const idx = (r: number, c: number) => r * SIZE + c
  for (let i = 0; i < SIZE; i += 1) {
    for (let j = 0; j < SIZE; j += 1) {
      const [r, c] =
        dir === 'left' ? [i, j] : dir === 'right' ? [i, SIZE - 1 - j] : dir === 'up' ? [j, i] : [SIZE - 1 - j, i]
      board[idx(r!, c!)] = next[i]![j]!
    }
  }
  return board
}

export interface MoveResult {
  state: GameState
  moved: boolean
  gained: number
}

/** 答对换来的那一步：滑动 → 合并 → 补一个新数字。无效方向不消耗这一步。 */
export function move(state: GameState, dir: Dir, rand: () => number = Math.random): MoveResult {
  if (state.over) return { state, moved: false, gained: 0 }
  const slid = lines(state.board, dir).map(slide)
  const board = writeBack(slid.map((s) => s.line), dir)
  const moved = board.some((v, i) => v !== state.board[i])
  if (!moved) return { state, moved: false, gained: 0 }
  const gained = slid.reduce((sum, s) => sum + s.gained, 0)
  const withSpawn = spawn(board, rand)
  const score = state.score + gained
  return {
    state: { board: withSpawn, score, best: Math.max(state.best, score), over: !hasMoves(withSpawn) },
    moved: true,
    gained
  }
}

export function hasMoves(board: number[]): boolean {
  if (board.some((v) => v === 0)) return true
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const v = board[r * SIZE + c]!
      if (c + 1 < SIZE && board[r * SIZE + c + 1] === v) return true
      if (r + 1 < SIZE && board[(r + 1) * SIZE + c] === v) return true
    }
  }
  return false
}

export const maxValue = (board: number[]): number => Math.max(...board)
