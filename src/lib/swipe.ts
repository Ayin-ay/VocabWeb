import { useRef } from 'react'
import type { TouchEvent } from 'react'

/**
 * 判定卡上的左右滑＝下一题。
 * 只挂在判定卡上：没作答的题不认滑动，免得开一条不记答案的跳过旁路。
 */
export function useSwipeNext(onNext: () => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0]
      start.current = t ? { x: t.clientX, y: t.clientY } : null
    },
    onTouchEnd: (e: TouchEvent<HTMLDivElement>) => {
      const s = start.current
      start.current = null
      if (!enabled || !s) return
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) onNext()
    }
  }
}
