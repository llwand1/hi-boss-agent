// 把 resume.json 烘焙成 Cloudflare Pages Functions 可直接 import 的模块。
// 为什么需要这一步：Cloudflare 运行时没有 fs，不能在部署后读文件；所以部署前把配置固化成 JS。
// 用法：改完 public/resume.json 后执行 `node tools/gen-resume.mjs`
// 注意：数据源在 public/ 下（那是发布目录），生成物在 functions/api/ 下（不进发布目录）。

import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const resume = JSON.parse(readFileSync(new URL('public/resume.json', root), 'utf8'));
const { buildSystemPrompt, buildJdGreetingFacts, JD_GREETING_TASK } = await import(new URL('shared/prompt.mjs', root));

const out = `// 自动生成，请勿手改 —— 数据源：public/resume.json
// 重新生成：node tools/gen-resume.mjs

export const RESUME = ${JSON.stringify(resume, null, 2)};

export const SYSTEM_PROMPT = ${JSON.stringify(buildSystemPrompt(resume))};

// ── JD 自适应见面语生成器（烘焙版）─────────────────────────────────────
// 与 SYSTEM_PROMPT 同样的理由：CF 运行时没有 fs、也不做跨目录 import，
// 所以把「依赖简历的提示词部分」在构建期固化成常量，运行期只拼接 JD。
export const JD_GREETING_FACTS = ${JSON.stringify(buildJdGreetingFacts(resume))};

export const JD_GREETING_TASK = ${JSON.stringify(JD_GREETING_TASK)};

export function buildJdGreetingPrompt(jd) {
  return JD_GREETING_FACTS + '\\n\\n【岗位 JD】\\n' + jd + '\\n\\n' + JD_GREETING_TASK;
}
`;

writeFileSync(new URL('functions/api/_resume.mjs', root), out, 'utf8');
console.log('[gen] 已生成 functions/api/_resume.mjs（来自 public/resume.json）');
console.log('[gen] 姓名：%s ｜ 学历：%s ｜ 项目 %s 个',
  resume.name, [resume.education?.level, resume.education?.major].filter(Boolean).join(' · ') || '-',
  (resume.projects || []).length);
