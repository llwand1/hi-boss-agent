# 可对话简历 Agent · 部署到 Cloudflare Pages

静态单页简历 + 右上角 AI 问答分身（流式 SSE）+ 注意力捕捉（把「摸鱼浏览」变成线索）+ 主人侧线索看板。
**内容由 `resume.json` 单一数据源驱动**，改配置即可改变页面与 AI 分身的知识，不必改代码。

👉 **想快速了解这个项目的思路？先读 [`docs/INSIGHTS-设计思路.md`](docs/INSIGHTS-设计思路.md)**——七条可溯源的核心决策，以及我们主动砍掉的东西。

## 目录结构

**关键约定：只有 `public/` 会被部署上线**（Cloudflare Pages 的「构建输出目录」填 `public`）。
源码、`docs/`、`dev.mjs`、`shared/`、`tools/` 留在仓库根，不随站点公开 —— 但**本仓库是公开的**：
`docs/` 里的 ADR / SPEC 就是这个项目的设计过程与决策记录，本身也是作品的一部分，欢迎翻阅。
密钥与访客数据（`.env.*`、`leads.json`、`events.json`）始终被 `.gitignore` 屏蔽，从未进过提交历史。

```
public/                    ★ 发布目录：只有这里的内容会出现在线上
  index.html               简历页面（AI 面板 + 注意力捕捉；内容由 resume.json 渲染）
  admin.html               主人侧线索看板（谁看了哪块、谁留了联系方式）
  jd.html                  主人侧工具：JD 自适应见面语工作台（粘 JD → 匹配度 + 招呼语）
  resume.json              ★ 简历唯一数据源：改这里，页面与 AI 同步更新
  _routes.json             仅 /api/* 调用 Functions，静态资源走无限免费的静态通道

functions/api/chat.js      Pages Functions：AI 对话代理（OpenAI 兼容 SSE）
functions/api/jd-greeting.js  JD 见面语接口（非流式，返回严格 JSON）
functions/api/lead.js      留资接口
functions/api/event.js     匿名注意力事件接口
functions/api/admin.js     看板数据接口（需 ADMIN_TOKEN，防泄露）
functions/api/_guard.mjs   对话准入闸门：同源校验 + 输入整形 + 限流（本地与 CF 共用，非路由）
functions/api/_jd.mjs      JD 接口共用工具：长度上限 + JSON 抠取 + 输出整形（本地与 CF 共用，非路由）
functions/api/_resume.mjs  自动生成（由 tools/gen-resume.mjs 从 public/resume.json 生成，含 AI 与 JD 两套提示词）

shared/prompt.mjs          AI 系统提示词生成器（全项目唯一定义，本地与 CF 共用）
tools/gen-resume.mjs       把 public/resume.json 固化成 CF 可直接 import 的模块
tools/sync-fallback.mjs    把 public/resume.json 同步进 index.html 的 RESUME_FALLBACK（防两份副本漂移）
tools/export-outbound.mjs  把 public/resume.json 编译成 get_jobs 的 introduce + prompt（自动投递接入；改了内容要一并重跑）
outbound/get_jobs.md       上一步的产物：可直接粘进 get_jobs「AI 配置」—— 不随站点公开
dev.mjs                    本地零依赖服务：托管页面 + 代理 AI + 落盘 leads/events
docs/                      设计文档（SPEC / ADR / INSIGHTS 思路总览）—— 不随站点公开，但随仓库公开
CHANGELOG.md               变更登记与作废登记（SPEC §19 治理门禁要求的文件）
```

> 现状与待办看 `docs/SPEC-行为驱动主动性.md` §14.2（N0–N8）；历次变更与作废登记看 `CHANGELOG.md`。

## 快速开始（本地）

```bash
node dev.mjs
```

- 简历页：http://127.0.0.1:8788
- 线索看板：http://127.0.0.1:8788/admin.html
- JD 见面语工具：http://127.0.0.1:8788/jd.html
  - 未配置 `ADMIN_TOKEN` 时，启动日志会打印一个**本次运行有效的临时口令**，复制进看板即可（重启即变）。
    想要固定口令，就在 `.env.local` 里加一行 `ADMIN_TOKEN=你的口令`。
- 默认**只绑定 127.0.0.1**，局域网访问不到。确需手机预览用 `HOST=0.0.0.0 node dev.mjs` ——
  但这会把 `.env.local`（API Key）与 `leads.json`（访客联系方式）暴露给同网段，仅在可信网络短时使用。
- 密钥放 `.env.local`（已被 `.gitignore` 屏蔽）：
  ```
  AI_API_BASE=https://api.agnes-ai.cn/v1
  AI_API_KEY=sk-xxxx
  AI_MODEL=agnes-2.5-flash
  ADMIN_TOKEN=你的看板口令   # 可选，本地不设则看板免口令
  ```

改完 `public/resume.json` 刷新页面即可看到新内容；本地 `dev.mjs` 的 AI 侧提示词也**热更新**（每次请求重读 json），无需重启服务。
但 `resume.json` 有**两份副本不会被自动跟着走**，改完要跑两条命令（见下一节）。

## 改简历内容（一个数据源 + 两条同步命令）

编辑 `public/resume.json`：姓名、头像字、身份、所在地、联系方式、教育、关于我、技能、技术栈、AI 开场白、各板块的主动话术与推荐问题。

⚠️ **三处已知副本，改 json 时必须一起过一遍**（本轮实测抓出的地雷，不是假想风险）：

| 副本位置 | 用途 | 怎么同步 |
|---|---|---|
| `functions/api/_resume.mjs` | CF 运行时读它（没有文件系统） | `node tools/gen-resume.mjs` |
| `public/index.html` 的 `RESUME_FALLBACK` | `file://` 双击打开时的兜底 | `node tools/sync-fallback.mjs`（幂等，只改这一块） |
| `public/index.html` 的**静态占位**（`#rfSkills`、`#rfTech`、`#rfMajor`/`#rfEduSub`、`#rfAbout`、`<meta name="description">`） | JS 执行前的首屏与无 JS 视图 | **需手抄**，工具故意不正则改写 HTML；漏抄已由 N8 记为待检查项 |

预留的可选区块（填了才显示，留空不占版面）：

```jsonc
"education": { "major": "储能材料工程技术", "level": "本科在读" },   // 校名按老板口径不对外展示，也不注入 AI 与 get_jobs（SPEC N10）
"skills":    [ { "name": "TypeScript / Node.js" } ],               // 只有名字，不写自评百分比（模型侧也已被禁止现编百分比）
"intent":    { "目标岗位": "AI 应用开发 / 全栈（实习）", "期望城市": "长沙 · 株洲 / 远程", "到岗时间": "随时" },
"projects":  [ {
  "name": "项目名", "period": "2026.03 - 2026.05", "url": "https://活链接可选",
  "desc": "做了什么", "stack": ["React", "SSE"],
  "decisions": [ { "choice": "选的方案", "why": "为什么这么选 / 放弃了什么" } ]   // 可选：渲染成「关键取舍」列表
} ]
```

`url` 会渲染成项目卡上的一行「线上实例」链接——**放之前确认它是活的**（`11wand.com` 于 2026-09-20 实测 HTTPS 200）。

本地开发时 json 改动即时生效；**要部署到 Cloudflare 前，跑这两条**（CF 运行时没有文件系统，且 `file://` 兜底是另一份副本）：

```bash
node tools/gen-resume.mjs      # → functions/api/_resume.mjs（CF 用）
node tools/sync-fallback.mjs   # → public/index.html 的 RESUME_FALLBACK（file:// 用）
```

## 线索看板

- 打开 `/admin.html`，填看板口令（线上为 `ADMIN_TOKEN`；本地未配置则用启动日志里打印的临时口令）。
- 显示：留联人数、打开对话次数、板块热度排行、对话→留联转化率、线索明细（时间/称呼/联系方式/想聊方向/当时在看哪块）。
- 每 30 秒自动刷新。

## JD 自适应见面语（求职者本人使用）

「会打招呼的简历 Agent」是**被动**的：HR 来看站、AI 答。这个工具把它翻成**主动**——你把一份岗位 JD 粘进去，
它按你的真实简历（`resume.json`）判断匹配度，并写出一段可直接投递的打招呼语。用 `/jd.html` 打开。

- 输入：岗位 JD 全文（上限 6000 字，`_jd.mjs` 的 `MAX_JD_CHARS`）。
- 输出（严格 JSON，`POST /api/jd-greeting`）：`score`（0-100）、`verdict`（投 / 谨慎 / 不建议）、
  `greeting`（60-90 字招呼语）、`emphasize`（该突出的点）、`gaps`（如实告知的缺口）、`rationale`。
- **诚实约束**：提示词强制「只能用简历里真实存在的信息，JD 缺什么必须如实列进 gaps」，不编造、不虚高。
- 复用 `/api/chat` 的同一套闸门（同源 + 限流）与同一份简历事实；差别是非流式、走 JD 专用提示词。

> 这是**本人侧**工具，不面向访客。

## 自动投递（outbound）——采用成熟开源，不自研

真正把招呼语发到 Boss 直聘 / 猎聘等平台是另一层能力：需要本地 Chrome + 登录态，且有平台风控。
**这一层不自研，直接采用开源 `loks666/get_jobs`**（唯一覆盖国内平台、自带按 JD 生成招呼语、且该提示词可自定义的活跃项目）。
决策与边界见 `docs/ADR-0003-自动投递采用成熟开源.md`。

分工是：**开源负责「手」（登录、点按钮、发消息、过验证），本项目负责「脑」（按真实简历判断与措辞）。**
接入点是 `get_jobs` 网页端「AI 配置」里的 `prompt` 字段——它按
`String.format(prompt, introduce, keyword, jobName, jd, sayHi)` 填充，所以我们把简历编译成这个模板即可：

```bash
node tools/export-outbound.mjs     # 产出 outbound/get_jobs.md（introduce + prompt，可直接复制粘贴）
```

三个必须知道的坑（详见 ADR-0003 第四节）：① `%1$s`~`%5$s` 顺序不能错；② 模板里字面 `%` 要写 `%%`；
③ 模型输出含 `false` 会被 get_jobs 判为失败、回落到固定招呼语——故模板已强制「只输出招呼语本身」。

## 注意力捕捉（把「摸鱼浏览」变成机会）

- **板块感知**：IntersectionObserver 标记访客正在看的板块（关于我 / 技能 / 技术栈 / 教育 / 联系方式）。
- **主动轻推**：停留 6 秒且没开聊 → FAB 弹贴合该板块的提示（看技能→「想听我讲讲 Web/AI 实操吗？」）；开场白也贴合当前板块。
- **建议问题**：面板内快捷问题 chips，点一下直接问。
- **留资转化**：面板「留联」→ 填称呼/联系方式/方向 → `POST /api/lead`。
- **匿名事件**：板块浏览 / 面板打开 / 留资 → `POST /api/event`（仅类型+板块，无个人信息）。

## 部署到 Cloudflare Pages（免费）

1. 推到 GitHub（本仓库即公开作品——`docs/` 的设计文档本身就是求职证据链的一部分）。仓库已初始化，首次推送：
   ```bash
   git remote add origin git@github.com:<你的账号>/resume.git
   git push -u origin main
   ```
2. 先本地执行 `node tools/gen-resume.mjs` **和** `node tools/sync-fallback.mjs`，并提交生成的 `functions/api/_resume.mjs`。
   **改了 `public/resume.json` 就必须两条都重跑**，否则线上或 `file://` 兜底仍是旧内容 —— 这一步没有自动校验，最容易忘（2026-09-20 就因此把校名与自评百分比漏在页面上过）。
   ⚠️ 上线前先清掉 SPEC §14.2 **N10 的三条**：`email` 仍是 `you@example.com`、`website` 指向 **DNS 不存在的 `llwan.dev`**、GitHub 展示名与 remote 账号不一致。不清就上线，AI 分身会当着 HR 的面把访客往不存在的出口上领（已实测复现）。
3. Cloudflare 控制台 → **Workers & Pages → 创建 → Pages → 连接 Git 仓库**。
4. 构建设置：**构建命令留空，输出目录填 `public`**（纯静态，无需 build）。
   ⚠️ `functions/` 必须留在**仓库根**，不能放进 `public/`，否则 Functions 不会被识别。
5. 项目 → **设置 → 环境变量**（生产）添加：
   - `AI_API_BASE` / `AI_API_KEY` / `AI_MODEL`
   - `ADMIN_TOKEN`（**强烈建议设置**，否则看板会禁用；不设则 `/api/admin` 返回 403 以免访客联系方式泄露）
6. 需要线上留存线索：设置 → 函数 → **KV 命名空间绑定**，变量名 `LEADS` 和 `EVENTS`（可指向同一个）。
   不绑定不会报错，但会静默降级成「只回 ok 不落库」，线索直接丢。
7. 重新部署，得到 `xxx.pages.dev`；自定义域可在项目里绑定（免费套餐支持）。**部署成功后把地址写回本 README 与 SPEC**——本仓多处文档写过「已上线」却查无地址，别再留这种账。

### 部署后必做的一次冒烟测试

| 检查 | 期望 |
|---|---|
| 打开首页 | 简历正常渲染；直接双击本地 `public/index.html` 时 AI 不可用属正常 |
| 与 AI 对话 | 能流式回复（若 403 说明同源校验误伤，需看 `Origin` 与 `Host` 是否一致） |
| 留资 + 看板 | 留一条测试线索，看板能读到（读不到＝KV 未绑定） |
| `GET /README.md`、`/dev.mjs`、`/docs/...` | **应当 404**（发布目录为 `public` 时天然如此，这是验证发布目录配对的关键一步） |

## 安全基线（改动前请先读）

本地服务与线上接口**都**按「默认拒绝」设计（四条会写数据或花额度的接口 `/api/chat`、`/api/jd-greeting`、`/api/lead`、`/api/event` 已全部覆盖，看板口令独立），不要为了图方便把闸门摘掉：

| 项 | 规则 | 为什么 |
|---|---|---|
| 发布目录 | 只发布 `public/`（CF 输出目录填 `public`，`dev.mjs` 的静态根也是 `public/`）；源码、`docs/`、`dev.mjs`、`tools/` 留在仓库根 | 输出目录填 `/` 会把 README、`dev.mjs`、`docs/SPEC`、`tools/` 一并发布到站点上 |
| 静态资源 | `dev.mjs` 只放行 `PUBLIC_FILES` 白名单（`/index.html`、`/admin.html`、`/jd.html`、`/resume.json`），其余一律 404 | 黑名单漏一项就会把 `.env.local`（API Key）、`leads.json`（访客联系方式）、源码直接暴露。新增前端资源请在 `dev.mjs` 的 `PUBLIC_FILES` 里登记 |
| 监听地址 | 默认 `127.0.0.1` | 绑 `0.0.0.0` 时同网段任何人可下载上述文件 |
| 看板 | 本地与线上都 fail-closed，口令不匹配即 401 | 线上未配 `ADMIN_TOKEN` 时直接 403，防访客数据泄露 |
| `/api/chat` | 同源校验 + 每来源每分钟 12 次 + 消息长度/条数上限 + 角色白名单 + `max_tokens` | 接口会消耗模型额度，无闸门等于对公网开放一个免费 LLM 代理；角色白名单同时防提示词注入（客户端自带 system 消息会被丢弃） |
| `/api/lead` | 同源校验 + 每来源每分钟 5 次 + 字段白名单（只取 `name/contact/note/section`，单字段截 300 字）+ KV key 由服务端生成 | 留资是一次性动作，5 次/分钟足够且留了重试余量。白名单挡住「访客自己往记录里塞字段」，KV key 不再拼 `contact`（旧实现等于允许访客自由写本命名空间）。**不写 ip**，与本地 `dev.mjs` 一致，兑现 SPEC §7.2 |
| `/api/event` | 同源校验 + 每来源每分钟 30 次 + 字段白名单（只取 `type/section`，截 60 字）+ KV key 由服务端生成 | 阈值比留资宽松得多：前端每 4s 探测板块变化，快速划过 7 个板块就会连发，收紧会误伤真实访客。客户端传来的 `ts` 一律丢弃、改由服务端盖时间戳（防伪造时序）。这两个接口不花模型额度但**直接写 KV**，免费版 1000 writes/day 被刷光当天真实留资会静默丢失 |

闸门逻辑集中在 `functions/api/_guard.mjs`，本地与 CF 共用同一份，改一处两侧同时生效。

已知未覆盖：限流是**单进程/单 isolate 内存计数**，不是分布式限流，挡不住代理池。
要真正防刷请在 Cloudflare 侧叠加 Turnstile 或 Rate Limiting binding ——
**不要用 KV 做限流**，会吃掉线索存储额度（免费版 1000 writes/day）。

## 说明

- 前端走同域 `/api/*`，无 CORS 问题。**直接双击 `public/index.html`（`file://`）打开时 AI 问答、留资、事件上报与看板均不可用属正常**——四条接口都做同源校验，`file://` 的 `Origin` 为 `null` 会被 403；此时页面仍用内置兜底内容展示简历，不会白屏。
- 密钥只存环境变量 / `.env.local` / `.dev.vars`，不进代码；`.env.local`、`leads.json`、`events.json` 已被 gitignore。
- `leads.json` / `events.json` 是**本地开发**的落盘文件，留在仓库根（不在 `public/` 下，不会被发布）；线上数据走 KV。
- 换模型或接非 OpenAI 兼容 API：改 `functions/api/chat.js` 里的 fetch 部分即可。
