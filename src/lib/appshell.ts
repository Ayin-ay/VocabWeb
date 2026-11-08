declare const __APP_VERSION__: string

/** 站点这一侧的版本只认 package.json；APK 的版本由 App.getInfo() 报回来 */
export const siteVersion: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

interface AppPlugin {
  getInfo(): Promise<{ build: string; version: string }>
  exitApp(): Promise<void>
  addEventListener(name: 'backButton', cb: () => void): Promise<{ remove: () => void }>
}

type WithCapacitor = Window & { Capacitor?: { Plugins?: { App?: AppPlugin } } }

const appPlugin = (): AppPlugin | undefined =>
  typeof window === 'undefined' ? undefined : (window as WithCapacitor).Capacitor?.Plugins?.App

/** 只有装出来的 APK 里有原生 App 插件；浏览器、微信内置页都按网页处理 */
export const inApp = (): boolean => Boolean(appPlugin())

export async function apkVersion(): Promise<string | null> {
  const plugin = appPlugin()
  if (!plugin) return null
  try {
    const info = await plugin.getInfo()
    return info.version || null
  } catch {
    return null
  }
}

/** 安卓返回键：handle 返回 true 表示这一下被页面吃掉（比如退回冲刺页），返回 false 就退出应用 */
export function onBackPress(handle: () => boolean): () => void {
  const plugin = appPlugin()
  if (!plugin) return () => undefined
  let dead = false
  void plugin
    .addEventListener('backButton', () => {
      if (!handle()) void plugin.exitApp()
    })
    .then((h) => {
      if (dead) void h.remove()
    })
    .catch(() => undefined)
  return () => {
    dead = true
  }
}

const parts = (v: string): number[] => v.split('.').map((p) => Number.parseInt(p, 10) || 0)

/** 比大小按点位比，0.10.0 不该排在 0.9.0 前面 */
export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false
  }
  return false
}

export interface ReleaseInfo {
  version: string
  notes: string
  download: string
}

/** 壳里加载的是线上站点，所以 app.json 就跟站点同域；读不到就当没有新包，不报警 */
export async function fetchRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch('/app.json', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<ReleaseInfo>
    if (typeof data.version !== 'string' || !data.version) return null
    return { version: data.version, notes: typeof data.notes === 'string' ? data.notes : '', download: typeof data.download === 'string' ? data.download : '' }
  } catch {
    return null
  }
}
