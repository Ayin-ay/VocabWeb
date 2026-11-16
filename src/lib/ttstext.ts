/**
 * 朗读前的文本清洗：词表里的词条是给眼睛看的，不是给 TTS 念的。
 * 单独成模块（不碰 Capacitor 依赖）是为了能被 node 侧自检直接调用。
 */

/** 词典缩写占位符：引擎会把 sb. 念成「艾斯批」，展开成人话才不刺耳 */
const ABBREV: [RegExp, string][] = [
  [/\bsb\./g, 'somebody'],
  [/\bsth\./g, 'something'],
  [/\betc\./g, 'et cetera'],
  [/\be\.g\./g, 'for example'],
  [/\bi\.e\./g, 'that is'],
  [/\betc\b/g, 'et cetera'],
]

export function speechText(raw: string): string {
  let s = raw
  for (const [re, to] of ABBREV) s = s.replace(re, to)
  // 「be / get / feel burned out」这种并列斜杠：念成停顿比念成 slash 好，也比连读成 "beget" 好
  s = s.replace(/\s*\.{2,}\s*/g, ' ')
  s = s.replace(/\s*\/\s*/g, ', ')
  // 括号只是排版用的可选成分，去掉括号本身、留下里面的词
  s = s.replace(/[(){}[\]]/g, '')
  s = s.replace(/,/g, ', ').replace(/ {2,}/g, ' ')
  // 逗号叠多了会变成一顿一顿的，两个连续停顿合成一个
  s = s.replace(/(,\s*){2,}/g, ', ')
  return s.trim()
}
