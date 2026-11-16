/**
 * D1：音效全部用 Web Audio 现场合成，不打包任何音频文件、不额外下载。
 * 每个音都压在 150ms 以内，抢在答完自动朗读开口之前放完，两者不会叠在一起。
 * 第一次调用发生在点击「提交 / 选项 / 方向键」之后，正好满足浏览器的用户手势要求。
 */

let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    // 没有音频设备或被策略拦了：音效缺席，答题本身绝不能因此中断
    return null
  }
}

function tone(freq: number, delay: number, dur: number, peak: number, type: OscillatorType = 'triangle'): void {
  const c = ac()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t = c.currentTime + delay
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

const SEMI = (base: number, semi: number) => base * 2 ** (semi / 12)

export const sfx = {
  /** 合并：一对一声「嗒」，一次合并多对就按大调上行音阶连着响 */
  merge(count: number): void {
    const steps = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    for (let i = 0; i < Math.min(count, steps.length); i += 1) tone(steps[i]!, i * 0.05, 0.07, 0.06)
  },
  /** 连续几步都在合并（C3）：比单合并更亮的一串方波 */
  streak(level: number): void {
    const semis = [0, 4, 7, 12]
    for (let i = 0; i < Math.min(level, semis.length); i += 1) tone(SEMI(392, semis[i]!), i * 0.04, 0.08, 0.05, 'square')
  },
  /** 里程碑和弦：越大越往上挪 */
  milestone(value: number): void {
    const base = 440 * Math.min(2, Math.max(1, value / 512))
    ;[0, 4, 7].forEach((semi, i) => tone(SEMI(base, semi), i * 0.03, 0.12, 0.07))
  },
  /** 满格警示：低鸣一声，和整盘泛红同步 */
  warn(): void {
    tone(150, 0, 0.13, 0.09, 'sawtooth')
  }
}
