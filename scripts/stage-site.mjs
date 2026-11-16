/** dist 镜像到发布目录，顺带把 APK 一起放进去：发布工具只认会话根目录内的路径。
 *
 *  APK 不进 git，放在 apk/vocab-sprint.apk。每次出完新包，从
 *  https://github.com/Ayin-ay/VocabWeb/releases/latest/download/vocab-sprint.apk
 *  下下来覆盖它，再跑 npm run stage，然后发布站点。
 *  漏掉这一步不要紧——脚本会照样镜像，只是站点上留的是旧包。
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR = process.argv[2] ?? 'D:/StudyWeb/.sites/vocab/dist'
const APK = resolve(ROOT, 'apk/vocab-sprint.apk')

rmSync(MIRROR, { recursive: true, force: true })
cpSync(resolve(ROOT, 'dist'), MIRROR, { recursive: true })
const withApk = existsSync(APK)
if (withApk) cpSync(APK, resolve(MIRROR, 'vocab-sprint.apk'))

console.log(`${MIRROR}  ← dist${withApk ? ' + vocab-sprint.apk' : '（apk/ 里没有 APK，站点上不带包）'}`)
