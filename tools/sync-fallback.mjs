// 把 public/resume.json 同步进 public/index.html 里的 RESUME_FALLBACK 常量。
// 为什么需要：index.html 内置了一份兜底简历（file:// 直接双击时 fetch 不到 json 才用），
//   它和 resume.json 是同一份内容的两个副本。只改 json 不改这里，会出现
//   「数据源已经删掉的东西仍在页面上显示」——校名与技能百分比就是这么漏下来的。
// 用法：改完 public/resume.json 后执行 `node tools/sync-fallback.mjs`
// 与 gen-resume.mjs 的分工：那条命令喂给 Cloudflare Functions，这条喂 file:// 兜底，两者都只认 json 一处真值。
//
// 本工具只管 `var RESUME_FALLBACK = {...};` 这一块 JS 常量，**不动 HTML 里的静态占位内容**
// （正则改写 HTML 太脆，宁可留人工）。以下三处仍需在改 json 时手抄同一批文案：
//   #rfSkills 的技能行 · #rfTech 的标签 · #rfMajor/#rfEduSub · #rfAbout · <meta name="description">
// 已登记为 SPEC §14.2 N8 的待办：给这三处加漂移检查（检查而非改写）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'public', 'resume.json');
const htmlPath = join(root, 'public', 'index.html');

const resume = JSON.parse(readFileSync(jsonPath, 'utf8'));
const html = readFileSync(htmlPath, 'utf8');

const MARK = 'var RESUME_FALLBACK = ';
const start = html.indexOf(MARK);
if (start < 0) {
  console.error('[sync-fallback] 找不到 RESUME_FALLBACK 常量，未做任何修改');
  process.exit(1);
}
// 结束标记按行匹配：`\n  }`，其后的分号可能有也可能没有（历史版本丢过），统一补回
const end = html.indexOf('\n  }', start);
if (end < 0) {
  console.error('[sync-fallback] 找不到 RESUME_FALLBACK 的结束位置，未做任何修改');
  process.exit(1);
}
const endLen = html[end + 4] === ';' ? 5 : 4;

// 兜底块不参与渲染，去掉下划线开头的注释字段，免得 file:// 打开时把它们显示出来
const clean = {};
for (const k of Object.keys(resume)) if (!k.startsWith('_')) clean[k] = resume[k];

const body = JSON.stringify(clean, null, 2)
  .split('\n')
  .map((line, i) => (i === 0 ? line : '  ' + line))
  .join('\n');

const out = html.slice(0, start) + MARK + body + ';' + html.slice(end + endLen);
writeFileSync(htmlPath, out, 'utf8');
console.log('[sync-fallback] 已把 resume.json 同步进 index.html 的 RESUME_FALLBACK');
console.log('[sync-fallback] 技能 %s 条 / 项目 %s 个 / 板块话术 %s 条',
  (clean.skills || []).length, (clean.projects || []).length, Object.keys(clean.sectionTips || {}).length);
