// 把 resume.json 烘焙成 Cloudflare Pages Functions 可直接 import 的模块。
// 为什么需要这一步：Cloudflare 运行时没有 fs，不能在部署后读文件；所以部署前把配置固化成 JS。
// 用法：改完 public/resume.json 后执行 `node tools/gen-resume.mjs`
// 注意：数据源在 public/ 下（那是发布目录），生成物在 functions/api/ 下（不进发布目录）。

import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const resume = JSON.parse(readFileSync(new URL('public/resume.json', root), 'utf8'));
const { buildSystemPrompt } = await import(new URL('shared/prompt.mjs', root));

const out = `// 自动生成，请勿手改 —— 数据源：public/resume.json
// 重新生成：node tools/gen-resume.mjs

export const RESUME = ${JSON.stringify(resume, null, 2)};

export const SYSTEM_PROMPT = ${JSON.stringify(buildSystemPrompt(resume))};
`;

writeFileSync(new URL('functions/api/_resume.mjs', root), out, 'utf8');
console.log('[gen] 已生成 functions/api/_resume.mjs（来自 public/resume.json）');
console.log('[gen] 姓名：%s ｜ 学校：%s', resume.name, resume.education?.school || '-');
