import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { speechText } from './ttstext'

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

/**
 * 没手动选音色时别交给浏览器默认音色：中文系统里默认往往是中文引擎，
 * 用它念英文就是「hobby 读成哈比」。优先挑在线/神经音色，实际听感最好的那批。
 */
const GOOD_VOICE = /google|natural|neural|online|premium|enhanced|aria|jenny|zira|ava|samantha|daniel|serena/i

export function pickVoice(list: SpeechSynthesisVoice[], voiceURI: string): SpeechSynthesisVoice | undefined {
  return list.find((v) => v.voiceURI === voiceURI) ?? list.find((v) => GOOD_VOICE.test(v.name)) ?? list[0]
}

/**
 * 手机系统里排第一的音色经常是中文引擎，不指定 voice 就会拿它念英文（hobby 读成「哈比」）。
 * 装机的 App 自己挑一个英文音色，只探一次。
 */
let nativeVoice: number | null = null
let nativeProbed = false

async function probeNativeVoice(): Promise<number | null> {
  if (nativeProbed) return nativeVoice
  nativeProbed = true
  try {
    const { voices: list } = await TextToSpeech.getSupportedVoices()
    const score = (v: SpeechSynthesisVoice): number =>
      (/^en/i.test(v.lang) ? 2 : 0) + (GOOD_VOICE.test(v.name) ? 1 : 0)
    let best: number | null = null
    let high = 0
    list.forEach((v, i) => {
      const s = score(v)
      if (s > high) {
        high = s
        best = i
      }
    })
    nativeVoice = high >= 2 ? best : null
  } catch {
    nativeVoice = null
  }
  return nativeVoice
}

export function speak(text: string, opt: SpeakOptions): void {
  const said = speechText(text)
  if (!said) return
  if (native()) {
    void probeNativeVoice().then((voice) =>
      TextToSpeech.speak({
        text: said,
        lang: 'en-US',
        rate: clampRate(opt.rate),
        pitch: 1,
        volume: 1,
        ...(voice === null ? {} : { voice })
      })
    ).catch(() => undefined)
    return
  }
  if (!webTts) return
  const u = new SpeechSynthesisUtterance(said)
  u.lang = 'en-US'
  u.rate = clampRate(opt.rate)
  const v = pickVoice(englishVoices(), opt.voiceURI)
  if (v) u.voice = v
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function stopSpeak(): void {
  if (native()) void TextToSpeech.stop().catch(() => undefined)
  if (webTts) window.speechSynthesis.cancel()
}
