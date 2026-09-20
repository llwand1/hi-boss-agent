# CHANGELOG

本仓库的变更登记。格式参考 Conventional Commits；作废类变更按《文档撤销规范》登记六要素（对象 / 原因 / 日期 / 替代方案 / 影响面 / 执行人），**历史登记行只追加不回改**。

类型：`feat` 新功能 ｜ `fix` 纠错 ｜ `refactor` 重构 ｜ `docs` 纯文档 ｜ `chore` 杂项 ｜ `revoke` 作废登记

---

## [Unreleased]

### feat (2026-09-20)

**BDP 主动气泡落地：N1 删随机弹窗 + N2 单会话额度 2 次 + N3「别主动找我」开关与说明行**

- 施工面：`public/index.html`（唯一代码文件）、`docs/SPEC-行为驱动主动性.md`（§14.2 N1/N2/N3 状态列）、`docs/ADR-0003-*.md`（增「事实定论」段：老板确认**从未部署到 Cloudflare Pages**，「inbound 已上线」定论为「已具备部署条件」）、本文件。**未动** `resume.json`（N3 说明行走前端固定文案，不入内容表，避免污染单一事实源）、`functions/*`、`dev.mjs`。
- 动因：§17.1 复测证实「额度 ≤2」假设从未落地——`scheduleTip()` 在未开面板路径上每 18–36s 无限弹；§7 红线两件（开关 + 明示）缺位。
- 实现要点：
  - `scheduleTip`/`tipTimer` 整段删除；主动提示唯一入口收敛为 `adaptiveTip()`（6s 闲置停留）。
  - 弹次判定：`tipShowing` 手动跟踪替代读 class（jsdom 无 CSS 级联，读 class 才是真相）。同一条气泡跨板块换文案**不重复计额度**（算同一次打扰）；自动收起/点 × 后再停留算新一次。
  - 「面板开过一次即停」改由 `panelOpened` 标记承担。**踩坑实录**：`toggleAI` 在 `:688` 被「panel_open 上报」装饰器整体重新赋值，直接函数体里的标记会被覆盖失效——已在装饰链外再包一层 `_toggleWithStop` 补挂。
  - 开关在面板头部（§18.1 已决：不放顶部工具条），勾选即时收起当前气泡，会话内生效、不落盘（与「不跨会话」假设一致）。
- 实测依据（jsdom 直驱 `node dev.mjs` 真实页面，非 mock；内置浏览器视图 0×0 不可见故未走真实渲染）：
  - 逻辑断言 **16/16 通过**：A 组=额度路径（首弹带说明行→第 2 弹无说明行→第 3 板块不弹→全程恰 2 次）；B 组=开关（额度未满时勾选→即时收起→再停留两板块均不弹）；C 组=真实点击链（FAB pointerdown/up 开面板→关→停留不弹）。
  - N1 出口判据：**静置 126s 零交互，全程仅弹 1 次**（首弹来自进页 6s 停留判定，之后永久静默）。
  - `node --check`（IIFE 包裹内联脚本）通过；grep 无 `scheduleTip`/`tipTimer` 残留。
- 已知未验：① 视觉渲染（说明行撑破 210px 气泡、开关挤压头部）需真浏览器复核 → 派单 MT-001；② 事件侧未记录弹次，看板弹次是 **N4** 的范围，本批未做。

### docs (2026-09-19)

**规划收敛：SPEC BDP v0.1.0 → v0.2.0，按 ADR-0002 对齐；ADR-0001/0002/0003 补采纳与事实校正**

- 变更文件：`docs/SPEC-行为驱动主动性.md`、`docs/ADR-0001-*.md`、`docs/ADR-0002-*.md`、`docs/ADR-0003-*.md`、`README.md`（安全基线表补一行）、本文件（新建）
- 动因：ADR-0002（2026-09-16）已把 BDP 主机制从「运行时状态机判断开口」换成「构建期话术枚举查表」，但 SPEC 连续 3 天未同步，导致同一仓库内并存两套互斥口径；且 SPEC 自订门禁要求的 `CHANGELOG.md` 从未创建。
- 性质：**纯文档收敛，未改动任何代码或站点内容**。
- 实测依据（本轮得出，非推断）：
  - `functions/api/*.js` 5 个路由用 `node --check` 全部 FAIL（ESM 被按 CJS 解析），按 ESM 校验后 5/5 通过 → SPEC §19 门禁按原样执行必然误报。
  - 重跑 `node tools/gen-resume.mjs` 与库内 `functions/api/_resume.mjs` 比对，diff 为空 → 无内容漂移。
  - 本地起 `dev.mjs` 探活 11 项：4 个白名单资源 200；`/README.md`、`/dev.mjs`、`/.env.local`、`/leads.json`、`/functions/api/chat.js`、`/docs/*`、`/outbound/*`、`/tools/*`、`/shared/*` 全 404；未授权 `/api/admin` 401；跨源 `POST /api/chat` 403 → README 安全基线四规则实测成立。
  - `POST /api/chat` 返回上游 `401 该令牌状态不可用`（Agnes）→ 被动问答链路当前不可用，`/api/jd-greeting` 同键同挂。
  - `public/index.html:717-719` 的 `scheduleTip()`（18–36s 随机弹窗）仍在，全仓搜不到 `nextStance` / `stance` / `bot_like` → BDP v0.1.0 的实现度为 0；同时 `public/resume.json` 的 `sectionTips`（7 条）已在驱动主动气泡 → ADR-0002 口径的主机制已在。

#### 作废登记（六要素）

| 要素 | 内容 |
|---|---|
| **对象** | SPEC v0.1.0 的 §0 一句话、§5.2 有效停留定义、§5.3 信号分级、§6.1 姿态作开口判据的角色、§6.2 姿态转换规则、§6.3 状态行进 prompt、§12.1 单元/集成两层测试、§14 的 T2/T3/T5/T6；ADR-0002 原拟的 `resume.json` 新增 `proactive` 字段；ADR-0003「inbound 已上线」表述与「可复用本项目同一把 key」建议 |
| **原因** | ①ADR-0002 已采纳「决策在构建期枚举、不在运行时判断」，上述条款依赖被撤销的连续行为流与状态机；②`proactive` 与现存 `sectionTips` 同义，并存会违反单一事实源；③「已上线」缺证据、key 实测 401 |
| **日期** | 2026-09-19 |
| **替代方案** | SPEC v0.2.0 §4.1 现行架构（区块 → `sectionTips` 查表 + 额度三问）；话术表沿用 `sectionTips` 不新建字段；任务清单改指 §14.2 的 N0–N9；ADR-0003 分层表述以「已具备部署条件」理解，outbound 前置改为「先修 Agnes key」 |
| **影响面** | 仅文档。代码零改动，站点行为零变化，未产生新的部署动作。**注意**：SPEC §9 原写部署输出目录为 `/`，属事实错误（会把 README / docs / tools 发布到公网），本轮已修正为 `public` —— 若此前有人照旧文档配置过 Cloudflare Pages，**该配置需人工复核** |
| **执行人** | Qoder agent（AI），由 llwan 选定「先收敛规划文档」授权；措辞与判据待 llwan 复核 |

#### 本轮实测新发现的基线偏差（已登记，未修）

1. **`/api/lead` 与 `/api/event` 两侧都无闸门**：无同源校验、无限流、无字段白名单；`lead.js:16` 的 KV key 由客户端传来的 `contact` 拼接。最直接的后果不是泄露，是**静默丢数据**——免费版 KV 1000 writes/day 被刷光后，当天真实 HR 留资无声丢失。故 README 原「本地服务与线上接口**都**按默认拒绝设计」一句属**声明过宽**，本轮已在 README 收窄措辞并补一行已知未覆盖项，代码留作 N9。
2. **本地与线上的留资字段不一致**：`dev.mjs:250` 额外写 `ip`（本地恒为 `::1`），`functions/api/lead.js:14` 不写。与 SPEC §7.2「不记 IP」冲突的是本地这一侧。二选一处置记入 N9。
3. 事件侧**干净**：`events.json` 全部 23 条只有一种字段组合 `section+ts+type`，0 条含身份字段（type 分布：section_view 19 / panel_open 4）。

#### 本轮新增的待办（写进 SPEC §14.2，不在本条完成）

N0 修 Agnes key（阻断）｜N1 删随机弹窗｜N2 主动弹额度计数器｜N3 隐私开关 + 说明行｜N4 看板弹次｜N5 7 条话术定稿（等老板原话）｜N7 七场景评测集｜N8 门禁脚本化｜**N9 补 lead/event 闸门（上线前必做）**。

---

## 追溯登记（以下 4 条据 `git log` 补记，提交时本文件尚不存在）

### feat · `9d46a34` (2026-09-19 13:55)

新增 JD 见面语工作台与 get_jobs 自动投递接入，补 ADR-0002/0003。
`public/jd.html`、`functions/api/jd-greeting.js`、`functions/api/_jd.mjs`、`tools/export-outbound.mjs`、`outbound/get_jobs.md`，共 14 文件 +1059/-16。

### refactor · `16ca14c` (2026-09-15 11:14)

引入 `public/` 发布目录，源码与文档不再随站点公开。**副作用**：SPEC/ADR 内所有裸文件名（`index.html`、`resume.json` 等）自此漂移，已在 SPEC v0.2.0 §14.1 路径校正中统一说明。

### chore · `f77a512` (2026-09-15 11:09)

新增 `public/_routes.json`，仅 `/api/*` 调用 Functions，静态资源走免费静态通道。

### chore · `ecf1dad` (2026-09-15 11:08)

建立仓库基线，纳入首个可上线的简历站（静态页 + `/api/chat` 问答 + 注意力捕捉 + 线索看板）。
