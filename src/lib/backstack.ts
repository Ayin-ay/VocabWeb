/**
 * 安卓返回键的接管顺序：最后注册的先接（当前屏的判定卡），
 * 没人接由 App 退回冲刺页，再没人接才退出应用。
 */
const handlers = new Set<() => boolean>()

export function registerBack(handler: () => boolean): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

export function backConsumed(): boolean {
  for (const h of [...handlers].reverse()) {
    if (h()) return true
  }
  return false
}
