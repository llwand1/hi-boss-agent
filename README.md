# 可对话简历 Agent · 部署到 Cloudflare Pages

静态单页简历 + 右上角 AI 问答分身（流式 SSE）+ 注意力捕捉（把「摸鱼浏览」变成线索）+ 主人侧线索看板。
**内容由 `resume.json` 单一数据源驱动**，改配置即可改变页面与 AI 分身的知识，不必改代码。

## 目录结构

```
index.html                简历页面（AI 面板 + 注意力捕捉；内容由 resume.json 渲染）
admin.html                主人侧线索看板（谁看了哪块、谁留了联系方式）
resume.json               ★ 简历唯一数据源：改这里，页面与 AI 同步更新
shared/prompt.mjs         AI 系统提示词生成器（全项目唯一定义，前端/本地/CF 共用）
tools/gen-resume.mjs      把 resume.json 固化成 CF 可直接 import 的模块
dev.mjs                   本地零依赖服务：托管页面 + 代理 AI + 落盘 leads/events
functions/api/chat.js     Pages Functions：AI 对话代理（OpenAI 兼容 SSE）
functions/api/lead.js     留资接口
functions/api/event.js    匿名注意力事件接口
functions/api/admin.js    看板数据接口（需 ADMIN_TOKEN，防泄露）
functions/api/_resume.mjs 自动生成（由 tools/gen-resume.mjs 从 resume.json 生成）
functions/api/_guard.mjs  对话接口准入闸门：同源校验 + 输入整形 + 限流（本地与 CF 共用，非路由）
```

## 快速开始（本地）

```bash
node dev.mjs
```

- 简历页：http://127.0.0.1:8788
- 线索看板：http://127.0.0.1:8788/admin.html
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

改完 `resume.json` 刷新页面即可看到新内容；AI 侧提示词也**热更新**，无需重启服务。

## 改简历内容（只需动一个文件）

编辑 `resume.json`：姓名、头像字、身份、所在地、联系方式、教育、关于我、技能、技术栈、AI 开场白、各板块的主动话术与推荐问题。

预留的可选区块（填了才显示，留空不占版面）：

```jsonc
"intent":   { "目标岗位": "前端 / AI 应用实习", "期望城市": "长沙 / 远程", "到岗时间": "随时" },
"projects": [ { "name": "项目名", "period": "2026.03 - 2026.05", "desc": "做了什么", "stack": ["React", "SSE"] } ]
```

部署到 Cloudflare 前，跑一次生成命令（CF 运行时没有文件系统，需把配置固化）：

```bash
node tools/gen-resume.mjs
```

## 线索看板

- 打开 `/admin.html`，填看板口令（线上为 `ADMIN_TOKEN`，本地未设置则留空）。
- 显示：留联人数、打开对话次数、板块热度排行、对话→留联转化率、线索明细（时间/称呼/联系方式/想聊方向/当时在看哪块）。
- 每 30 秒自动刷新。

## 注意力捕捉（把「摸鱼浏览」变成机会）

- **板块感知**：IntersectionObserver 标记访客正在看的板块（关于我 / 技能 / 技术栈 / 教育 / 联系方式）。
- **主动轻推**：停留 6 秒且没开聊 → FAB 弹贴合该板块的提示（看技能→「想听我讲讲 Web/AI 实操吗？」）；开场白也贴合当前板块。
- **建议问题**：面板内快捷问题 chips，点一下直接问。
- **留资转化**：面板「留联」→ 填称呼/联系方式/方向 → `POST /api/lead`。
- **匿名事件**：板块浏览 / 面板打开 / 留资 → `POST /api/event`（仅类型+板块，无个人信息）。

## 部署到 Cloudflare Pages（免费）

1. 本目录推到 GitHub（仓库如 `resume`）。
2. 先本地执行 `node tools/gen-resume.mjs` 并提交生成的 `functions/api/_resume.mjs`。
3. Cloudflare 控制台 → **Workers & Pages → 创建 → Pages → 连接 Git 仓库**。
4. 构建设置：**构建命令留空，输出目录填 `/`**（纯静态，无需 build）。
5. 项目 → **设置 → 环境变量**（生产）添加：
   - `AI_API_BASE` / `AI_API_KEY` / `AI_MODEL`
   - `ADMIN_TOKEN`（**强烈建议设置**，否则看板会禁用；不设则 `/api/admin` 返回 403 以免访客联系方式泄露）
6. 需要线上留存线索：设置 → 函数 → **KV 命名空间绑定**，变量名 `LEADS` 和 `EVENTS`（可指向同一个）。
7. 重新部署，得到 `xxx.pages.dev`；自定义域可在项目里绑定（免费套餐支持）。

## 安全基线（改动前请先读）

本地服务与线上接口都按「默认拒绝」设计，不要为了图方便把闸门摘掉：

| 项 | 规则 | 为什么 |
|---|---|---|
| 静态资源 | `dev.mjs` 只放行 `PUBLIC_FILES` 白名单（`/index.html`、`/admin.html`、`/resume.json`），其余一律 404 | 黑名单漏一项就会把 `.env.local`（API Key）、`leads.json`（访客联系方式）、源码直接暴露。新增前端资源请在 `dev.mjs` 的 `PUBLIC_FILES` 里登记 |
| 监听地址 | 默认 `127.0.0.1` | 绑 `0.0.0.0` 时同网段任何人可下载上述文件 |
| 看板 | 本地与线上都 fail-closed，口令不匹配即 401 | 线上未配 `ADMIN_TOKEN` 时直接 403，防访客数据泄露 |
| `/api/chat` | 同源校验 + 每来源每分钟 12 次 + 消息长度/条数上限 + 角色白名单 + `max_tokens` | 接口会消耗模型额度，无闸门等于对公网开放一个免费 LLM 代理；角色白名单同时防提示词注入（客户端自带 system 消息会被丢弃） |

闸门逻辑集中在 `functions/api/_guard.mjs`，本地与 CF 共用同一份，改一处两侧同时生效。

已知未覆盖：限流是**单进程/单 isolate 内存计数**，不是分布式限流，挡不住代理池。
要真正防刷请在 Cloudflare 侧叠加 Turnstile 或 Rate Limiting binding ——
**不要用 KV 做限流**，会吃掉线索存储额度（免费版 1000 writes/day）。

## 说明

- 前端走同域 `/api/*`，无 CORS 问题。**直接双击 `index.html` 打开时 AI 与看板不可用属正常**（会用内置兜底内容展示简历，不会白屏）。
- 密钥只存环境变量 / `.env.local` / `.dev.vars`，不进代码；`.env.local`、`leads.json`、`events.json` 已被 gitignore。
- 换模型或接非 OpenAI 兼容 API：改 `functions/api/chat.js` 里的 fetch 部分即可。
