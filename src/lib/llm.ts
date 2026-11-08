import type { AiNote, LlmConfig, Word } from './types'

export const DEFAULT_LLM: LlmConfig = {
  baseUrl: 'https://api.minimaxi.com/v1',
  apiKey: '',
  model: 'MiniMax-M3',
  temperature: 0.4
}

export interface ProviderPreset {
  id: string
  label: string
  baseUrl: string
  model: string
  hint: string
}

/** 预设只填地址和模型名，key 由用户自己贴，只存本机 localStorage */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'minimax-cn', label: 'MiniMax 国内站', baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M3', hint: '国内站 key 只认 api.minimaxi.com' },
  { id: 'minimax-intl', label: 'MiniMax 国际站', baseUrl: 'https://api.minimax.io/v1', model: 'MiniMax-M3', hint: '和国际站 key 不通用，填错 401' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: '' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: '' },
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', hint: '地址尾巴必须带 /compatible-mode/v1' },
  { id: 'moonshot', label: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-latest', hint: '' },
  { id: 'ollama', label: '本机 Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:14b', hint: '不需要 key，字段留空即可' }
]

export const isConfigured = (cfg: LlmConfig): boolean =>
  Boolean(cfg.baseUrl.trim() && cfg.model.trim()) && (cfg.baseUrl.includes('127.0.0.1') || cfg.baseUrl.includes('localhost') || Boolean(cfg.apiKey.trim()))

async function chat(cfg: LlmConfig, messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  const url = `${cfg.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      ...(cfg.apiKey.trim() ? { authorization: `Bearer ${cfg.apiKey.trim()}` } : {})
    },
    body: JSON.stringify({
      model: cfg.model.trim(),
      messages,
      temperature: cfg.temperature,
      max_tokens: 4096
    })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${body ? ` · ${body.slice(0, 200)}` : ''}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('返回内容为空')
  return text
}

/** 模型爱用 ```json 围栏，也可能前后带话，取第一个完整的数组 */
function extractArray(text: string): unknown[] {
  const cleaned = text.replace(/```(?:json)?/gi, '')
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error('没找到 JSON 数组')
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown
  return Array.isArray(parsed) ? parsed : []
}

const SYSTEM = '你是大学英语老师，为中文母语学生编写词汇学习资料。只输出 JSON 数组，不要任何解释文字。'

function prompt(batch: Word[]): string {
  const rows = batch.map((w) => ({ id: w.id, en: w.en, pos: w.pos || '未标注', zh: w.zh }))
  return [
    '为下面每个词条生成一份学习卡，字段顺序固定：',
    'id：原样返回；sentence：一句地道英文例句，10–16 个词，用该词（或其变形）且搭配正确；',
    'translation：该例句的中文翻译；collocations：2–3 个常见英文搭配，用分号隔开；',
    'mnemonic：不超过 25 字的中文助记（词根词缀、联想或形近词对比）。',
    '输出 JSON 数组，每个元素形如 {"id":"","sentence":"","translation":"","collocations":"","mnemonic":""}。',
    `词条：${JSON.stringify(rows)}`
  ].join('\n')
}

function toNote(item: unknown): AiNote | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const note: AiNote = {
    sentence: str(o.sentence),
    translation: str(o.translation),
    collocations: str(o.collocations),
    mnemonic: str(o.mnemonic)
  }
  return note.sentence ? note : null
}

export const BATCH = 12
export const CONCURRENCY = 3

export interface GenResult {
  done: number
  failed: string[]
}

/** 分批 + 小并发，每批完成立刻回调落盘，中途失败不影响已生成的部分 */
export async function generateNotes(
  cfg: LlmConfig,
  todo: Word[],
  onBatch: (map: Record<string, AiNote>) => void,
  signal?: AbortSignal
): Promise<GenResult> {
  const batches: Word[][] = []
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))

  const failed: string[] = []
  let done = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < batches.length) {
      if (signal?.aborted) return
      const batch = batches[cursor++]!
      try {
        const text = await chat(cfg, [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt(batch) }], signal)
        const items = extractArray(text)
        const map: Record<string, AiNote> = {}
        for (const item of items) {
          const id = (item as { id?: unknown })?.id
          const note = toNote(item)
          if (typeof id === 'string' && note && batch.some((w) => w.id === id)) map[id] = note
        }
        if (!Object.keys(map).length) throw new Error('这批没有可用条目')
        onBatch(map)
        done += Object.keys(map).length
      } catch (err) {
        if (signal?.aborted) return
        failed.push(`${batch[0]?.id?.split('-').slice(0, 2).join('-')} #${batch[0]?.num ?? '?'}: ${(err as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
  return { done, failed }
}

export async function ping(cfg: LlmConfig): Promise<string> {
  const text = await chat(cfg, [{ role: 'system', content: '只回复两个字：正常' }])
  return text.slice(0, 40)
}
