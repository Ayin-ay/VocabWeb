import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'

const webTts = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Android WebView 里没有 speechSynthesis，装机的 App 走系统 TTS 引擎 */
const native = (): boolean => Capacitor.isNativePlatform()

export const canSpeak = (): boolean => native() || webTts

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
  if (native()) {
    void TextToSpeech.speak({ text, lang: 'en-US', rate: clampRate(opt.rate), pitch: 1, volume: 1 }).catch(() => undefined)
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
  if (native()) void TextToSpeech.stop().catch(() => undefined)
  if (webTts) window.speechSynthesis.cancel()
}
