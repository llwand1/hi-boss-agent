# get_jobs 接入配置（由 tools/export-outbound.mjs 从 resume.json 生成，勿手改）

> 重新生成：`node tools/export-outbound.mjs`
> 背景与边界见 docs/ADR-0003-自动投递采用成熟开源.md

## 怎么用

1. 打开 get_jobs 网页端 →「AI 配置」
2. 把下面**个人介绍**整段粘进 `introduce` 字段
3. 把下面**提示词模板**整段粘进 `prompt` 字段（务必原样，别改动 `%1$s`~`%5$s`）
4. `.env` 里配好 `BASE_URL / API_KEY / MODEL`（可复用本项目同一把 key）
5. 先开调试模式空跑一轮，确认招呼语质量后再正式低频投递

## 个人介绍（introduce）

```text
我是 llwan，湖南汽车工程职业大学（本科）储能材料工程技术专业学生。核心技能：TypeScript / React、Node.js / Express、Python / Flask。在用的技术：React 18、Vite、Next.js、Express、better-sqlite3、SSE、Python、Flask。做过的项目：会打招呼的简历 Agent。求职意向：目标岗位：前端 / 全栈 / AI 应用开发（实习）；期望城市：长沙 · 株洲 / 远程；到岗时间：随时。
```

## 提示词模板（prompt）

```text
你是一名求职助手，替候选人写一句发给招聘方 HR 的中文打招呼语。

【候选人的真实情况】
%1$s

【本轮搜索关键词】%2$s
【岗位名称】%3$s
【岗位完整 JD】
%4$s
【兜底参考语】%5$s

写作要求：
1. 只输出打招呼语本身。不要任何解释、不要 JSON、不要加引号、不要出现 true 或 false 这两个词。
2. 中文，60 到 90 字，口语化、具体，避免模板腔。
3. 从【岗位完整 JD】里挑 1 到 2 个与【候选人的真实情况】明确对得上的点来讲，不要泛泛而谈。
4. 只能使用【候选人的真实情况】里真实存在的信息，严禁编造技能、经历、学历或成果。
5. 如果 JD 与该候选人明显不匹配，也要写一句礼貌、简短、不硬凑的招呼语，不要列举不适配之处。
```

## 三个必须知道的坑（ADR-0003 第四节）

1. `prompt` 由 Java `String.format(prompt, introduce, keyword, jobName, jd, sayHi)` 按序填充 ——
   `%1$s`=个人介绍、`%2$s`=关键词、`%3$s`=岗位名、`%4$s`=JD、`%5$s`=兜底招呼语。**顺序不能错**。
2. 模板里如果要写真正的百分号，必须写 `%%`，否则 `String.format` 会报 `UnknownFormatConversionException`。
3. 模型输出里一旦出现 `false`，get_jobs 会判定失败并回落到固定招呼语 —— 所以模板第 1 条强制"只输出招呼语本身"。
