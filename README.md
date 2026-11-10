# 词汇冲刺 · 英语词表备考

本地自用 + 手机云端访问的英语词汇冲刺站：词库来自《新视野大学英语》B1U1–B2U4 课后词表（PDF 提取，共 679 条）。打开就是冲刺界面，顶栏只有「冲刺 / 沉淀 / 作文 / 设置」四个入口。

## 跑起来

```bash
npm install
npm run dev      # http://127.0.0.1:5174
```

改动词表或校验逻辑后：

```bash
npm run lexicon  # 重新解析 scripts/wordlist_raw.txt → src/data/lexicon.json
npm run corpus   # 合并 scripts/corpus_src/B2U*.json → src/data/composition.json
npm run smoke    # 出题、拼写判定、冲刺/沉淀状态机、存档码、语料卡的自检（无浏览器）
npm run build    # 解析词表 + 校验语料 → 类型检查 → 打包 dist/
```

## 冲刺

全库 679 条一轮到底：

- 第一次遇见考「看英文选中文」，失败无惩罚，第二次照常轮到。
- 单词第二次遇见改用页面内键盘拼写（不走系统输入法，避免联想提示答案）；词组和专有名词永远停在选择题，连对两次算掌握。
- 拼对排到队尾并标记已掌握，之后再错立刻撤销；拼错插回队列第 3 位马上重考。
- 答对换来 2048 的一步移动（方向自选，无效方向不消耗这一步），答错立刻生成一个新数字并锁住移动。
- 全部词条掌握一次即出完成报告（用时、正确率、拼写关通过数、2048 最高分），可选择继续抽查。

手机竖屏下题目在上、2048 在下，一屏放得下，键盘可折叠。队列位置与掌握标记存在 `vocab.sprint.v1`，刷新接着刷。

## 沉淀

顶栏第二个入口。名单来源是**当前这轮冲刺里答错过至少一次的词**（`sprint.items[id].wrong > 0`），把它们收进 `vocab.deposit.v1` 单独多轮反复练：

- 题型沿用冲刺：单词拼写，词组与专有名词看英文选中文。
- 答对一次即算沉淀到位并移出名单（`DEPOSIT_STREAK = 1`）；答错连对清零并插回队列第 3 位马上重考。
- 名单练空出本轮报告，可「再练一轮」（重洗队列、连对清零、累计对错保留）或「重收名单」（按冲刺现在的错过词重建）。
- 2048 与冲刺共用同一份棋盘（仍存在 `vocab.sprint.v1`），所以沉淀里答对同样能推动那一步。
- 冲刺重开、继续抽查都不会改动已经收进来的名单；只有点「重收名单」才会覆盖它。

## 作文语料

顶栏第三个入口，覆盖 Book2 四个单元的作文表达素材：每单元 **68 张卡**，全套 **272 张**，分五类——

| 类别 | 每单元 | 说明 |
| --- | --- | --- |
| 常用词汇 | 18 | 高频实词，如 `accomplish` `bias` `cherish` |
| 专业词汇 | 12 | 学科术语，如 `algorithm` `gender stereotype` `the fossil record` |
| 常用表达 | 14 | 短语与句型，如 `as far as I am concerned` `at stake` |
| 高级表达 | 12 | 升格用词与句式，如 `serendipity` `entrenched`、`So rapid is… that…` 倒装 |
| 例句 | 12 | 可整套背诵的成句，`use` 标注用途（点题、因果、对比、结论） |

- 卡片**正面只有中文含义**，点一下翻出英文，再点翻回；英文面还会带「怎么用」（搭配、替换哪个朴素说法）和例句。
- 列表按类别分成几段，自上而下连续滑动即可翻找；手机上单列铺满宽度。顶部两行筛选：单元、类别（至少留一类）。
- 语料是只读数据，不进 localStorage、不进存档码，所以翻卡状态刷新会重置，进度也永远不会被它影响。

## 设置

显示与发音（音色、语速）、存档码、模型通道（MiniMax 国内/国际、OpenAI、DeepSeek、通义、Kimi、本机 Ollama 预设）、批量生成例句与助记、清空进度、版本（站点 / App 版本号与新包提醒）。

## 进度保存

浏览器（尤其手机 WebView、无痕模式）会随时清掉 localStorage，所以退出重进可能回到零。当前方案是**手动存档码**，不依赖任何后端：

- 设置页「生成存档码」把冲刺队列、掌握标记、沉淀名单与计数、2048 棋盘和显示设置压成一串 base64（约 4–5 KB，带沉淀名单多约 0.4 KB），复制走即可。
- 「恢复」粘回同一串就接着上次继续。存档码开头带词库指纹（对全部条目 `id` 做 FNV-1a），换过词表后旧码会被明确拒绝，不会静默错位恢复；沉淀那一段是后加的，老码里没有就跳过、不动本机名单。
- 模型通道的 `apiKey` 永不进存档码，也不进「导出全部进度」的 JSON。

## 词表数据

`scripts/wordlist_raw.txt` 是 PDF 的逐行文本（PDF 硬换行，一条释义可能跨两三行）。`scripts/build-lexicon.mjs` 负责拼接与拆分：

- 相邻两行首尾都是 ASCII 才补空格，否则直接相接（中文按字断行）。
- 词性只在「词头之前的第一个 token」和「释义内部」两处识别，`abbr.` 这类括号注释不会被误当成词头词性；重复词性去重，`&` 两侧留空格、`/` 两侧不留。
- PDF 把连字符提取成了间隔号，词头里的 `·` `・` 一律还原成 `-`。拼写判定时连字符可写可不写，`breath-taking` 与 `breathtaking` 都算对。
- 原表里 `(原图无，跳过)` 的占位条目会被剔除，并在 `scripts/lexicon-report.txt` 记录。
- 自检：序号必须递增、英文词头不许残留词性或间隔号、释义里不许残留词性、每条都要有释义，有问题就退出码 1。

条目 `id` 形如 `B1U1-words-8`（单元-分节-原表序号），重新解析也不会变，所以进度和 AI 资料都按 `id` 认，不依赖数组下标。

## 语料数据

`scripts/corpus_src/B2U1..U4.json` 是作文语料的唯一真相，`scripts/build-corpus.mjs` 合并成 `src/data/composition.json`（改内容改源文件，别直接改产物）。四单元的选题取自词表本身的主题：U1 科技与创新、U2 旅行与行走、U3 现代生活与幸福感、U4 性别、身份与文化传承。构建前的硬校验：

- 每单元每类的条数必须正好是 18/12/14/12/12，`id` 必须是 `B2U2-p07` 这种「单元-类前缀+序号」且序号连续，缺号、多号、重复号都退出码 1。
- 中文面必须是中文且不超过 40 字（例句面 60 字），英文面必须纯 ASCII——不许残留词性标记（`n.` `vt.`）、间隔号或中文引号。
- `sentence` 类必须以句号/问号/感叹号收尾，且不得再另带 `eg`；`word/term/phrase` 三类每张都必须带一句 `eg`；`advanced` 可以是单词也可以是整套句式，句式就允许不另带例句。
- 全套 272 张的英文面不得互相重复（忽略大小写），产物按类别、再按 `id` 排序，重复构建字节级一致。

## 关于 AI 例句

例句、搭配、助记由你自配的模型生成，默认一条都不生成，在「设置 → AI 例句与助记」里选中单元后手动开始，每 12 条一批、3 路并发，结果存 `vocab.ai.v1`。生成过的词条，冲刺判定卡下方会附带那句例句和中文翻译。`apiKey` 只写在 localStorage，不入仓库、不入文件。没配模型也不影响冲刺——那部分完全离线可用。

## 存储键

`vocab.sprint.v1`（冲刺队列、掌握标记、2048 棋盘与 `canMove`）、`vocab.deposit.v1`（沉淀名单与每词对错、轮次）、`vocab.settings.v1`、`vocab.ai.v1`（AI 例句，判定卡会显示）、`vocab.llm.v1`。`vocab.progress.v1` 和 `vocab.records.v1` 是学习 / 测试旧版块的档案，当前界面只读不写，只有设置页的「清空学习进度」会动它们。

## 云端版本

`dist/` 镜像到 `D:\StudyWeb\.sites\vocab\dist` 后通过 Qoder Sites 发布，公开地址：<https://vocab-sprint-yc5z6ejvpmh.qoder.website>。纯静态站点，没有账号与远端数据库，所以手机上的进度依然只在那台设备的浏览器里——换设备靠存档码。

`public/app.json`（`{version, notes, download}`）随站点一起发布，是 App 里「有新包」提醒的唯一来源。

## 安卓 App

`android/` 是 Capacitor 7 的壳，**不含任何业务代码**：`server.url` 直接加载上面那个线上地址，所以改了站点就是改了 App，只有壳本身（图标、权限、版本号）需要重新出包。

- `capacitor.config.ts` 里 `allowNavigation` 必须带上这个域：安卓那侧靠它把远程 HTML 走本地代理并注入桥，桥在才有原生朗读、返回键和 `App.getInfo()`。
- 桥靠 `src/lib/appshell.ts` 和 `src/lib/tts.ts` 里显式 `import` 的 `@capacitor/core` / `@capacitor/app` / `@capacitor-community/text-to-speech` 注册（`cap.Plugins` 只认 JS 侧的 `registerPlugin`，光靠运行时探测取不到东西）。`inApp()` 为 false 时这些路径全部短路，浏览器行为不变；`npm run smoke` 里那条 `inApp() === false` 守的就是这一点。
- 朗读优先走 `@capacitor-community/text-to-speech`（Android WebView 里没有 `speechSynthesis`），网页那套只作回退；App 里音色跟随系统的「文字转语音」，设置页的音色下拉只在浏览器出现。
- 返回键：判定卡正在显示 → 关掉判定卡；不在冲刺页 → 回冲刺页；否则退出应用。
- **App 与浏览器是两份 localStorage**，装 App 不会带过来浏览器里的进度，第一次要在设置页贴一次存档码。
- 版本号只有 `package.json` 一处：`android/app/build.gradle` 读它算 `versionName` / `versionCode`，站点里 `__APP_VERSION__` 也来自它。发版顺序是「跑 `release.yml` 出包 → 再更新 `public/app.json` 发布站点」，反了会提示有新包却下不到对应版本。

出包（GitHub Actions，仓库公开）：

仓库建成 Public 而不是 Private，是为了 Release 的下载地址谁点开都能直接下载——私有仓库反过来要登录才能取，没被邀请的人干脆 404。公开的是词库和脚本，不是任何凭据：模型 key 只存在各人浏览器的 localStorage，签名密钥全在仓库 secret 里。

1. 建一个空仓库 `Ayin-ay/VocabWeb`（Public，**别勾初始化 README**），remote 指过来推上去。
2. Actions → 「生成签名用的 keystore」→ Run workflow，下载 artifact 里的 `release.keystore` / `release.keystore.base64` / `keystore-info.txt`，自己留一份 keystore。
3. 按 `keystore-info.txt` 建四个仓库 secret：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`（Settings → Secrets and variables → Actions）。PKCS12 里 **key 口令必须等于 store 口令**（新版 keytool 忽略 `-keypass`），所以 `ANDROID_KEY_PASSWORD` 抄 `ANDROID_KEYSTORE_PASSWORD` 那行的值；填成两样会在 `:app:packageRelease` 炸 `Given final block not properly padded`。
4. Actions → 「打包并发布安卓 APK」→ Run workflow（可填本版改了啥）。产物挂在 Release 上，固定名 `vocab-sprint.apk`，`https://github.com/Ayin-ay/VocabWeb/releases/latest/download/vocab-sprint.apk` 永远指向最新一版；`public/app.json` 的 `download` 就是这一条。

签名换了就等于换了另一个应用：覆盖安装会失败，只能卸载重装，而卸载会清掉那台设备上的进度。所以 keystore 丢了必须重新走一遍 1–2，并提前导出存档码。

图标与启动屏由 `python scripts/make-icons.py` 从 `app-assets/icon-master.png` 生成 `android/app/src/main/res` 下的 27 个 PNG（主图要改就换主图再跑一次；CI 不重跑这步，产物直接进仓库）。
