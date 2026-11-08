const webTts = typeof window !== 'undefined' && 'speechSynthesis' in window

/** APK 里的原生朗读：桥上有插件就走系统 TTS 引擎，网页那套在 Android WebView 里根本不可用 */
interface NativeTts {
  speak(opts: { text: string; lang: string; rate: number; pitch: number; volume: number }): Promise<void>
  stop(): Promise<void>
}

const native = (): NativeTts | undefined => {
  if (typeof window === 'undefined') return undefined
  const w = window as Window & { Capacitor?: { Plugins?: { TextToSpeech?: NativeTts } } }
  return w.Capacitor?.Plugins?.TextToSpeech
}

export const canSpeak = (): boolean => Boolean(native()) || webTts

let voices: SpeechSynthesisVoice[] = []

function refresh(): void {
  if (!webTts) return
  voices = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang))
}

if (webTts) {
  refresh()
  window.speechSynthesis.onvoiceschanged = refresh
}

/** 只有浏览器能列出音色；App 里音色跟随系统 TTS 设置 */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!voices.length) refresh()
  return voices
}

export interface SpeakOptions {
  rate: number
  voiceURI: string
}

const clampRate = (r: number): number => Math.min(2, Math.max(0.5, r))

export function speak(text: string, opt: SpeakOptions): void {
  if (!text) return
  const p = native()
  if (p) {
    void p.speak({ text, lang: 'en-US', rate: clampRate(opt.rate), pitch: 1, volume: 1 }).catch(() => undefined)
    return
  }
  if (!webTts) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = clampRate(opt.rate)
  const v = englishVoices().find((x) => x.voiceURI === opt.voiceURI)
  if (v) u.voice = v
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function stopSpeak(): void {
  const p = native()
  if (p) void p.stop().catch(() => undefined)
  if (webTts) window.speechSynthesis.cancel()
}
