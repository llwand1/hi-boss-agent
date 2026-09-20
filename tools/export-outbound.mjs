// 把 public/resume.json 编译成 loks666/get_jobs 需要的两段配置：introduce（个人介绍）+ prompt（招呼语提示词模板）。
// 用法：node tools/export-outbound.mjs  →  产出 outbound/get_jobs.md（可直接复制粘贴进 get_jobs 网页端「AI 配置」）
//
// 为什么要这个脚本：get_jobs 的 prompt 走 Java 的 String.format(prompt, introduce, keyword, jobName, jd, sayHi)，
// 它只负责"发消息"这个动作，不知道我们简历里的真实细节。我们把简历事实源编译成它的提示词，
// 让 outbound 的招呼语质量由本项目的 resume.json 保证（见 docs/ADR-0003）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resume = JSON.parse(readFileSync(join(root, 'public/resume.json'), 'utf8'));

// ① 个人介绍：给"脑"喂事实。语气克制、只陈述真实存在的信息。
function buildIntroduce(r) {
  const skills = (r.skills || []).map((s) => s.name).join('、');
  const tech = (r.tech || []).slice(0, 8).join('、');
  const edu = r.education || {};
  const intent = r.intent && Object.keys(r.intent).length
    ? Object.keys(r.intent).map((k) => `${k}：${r.intent[k]}`).join('；')
    : '';
  const projects = (r.projects || []).map((p) => p.name).filter(Boolean).join('；');
  return [
    // 不写校名：与页面、AI 分身同口径（SPEC N10「校名不对外展示」是全链路要求，get_jobs 也是对外出口）
    `我是 ${r.name}，${[edu.level, edu.major ? edu.major + '专业' : ''].filter(Boolean).join('，')}。`,
    skills ? `核心技能：${skills}。` : '',
    tech ? `在用的技术：${tech}。` : '',
    projects ? `做过的项目：${projects}。` : '',
    intent ? `求职意向：${intent}。` : '',
  ].filter(Boolean).join('');
}

// ② 提示词模板：走 get_jobs 的 String.format 契约，5 个占位按序填入。
//    必须用半角 %1$s 形式；模板正文里不能出现任何裸 %（否则 String.format 抛异常）。
function buildPromptTemplate() {
  return [
    '你是一名求职助手，替候选人写一句发给招聘方 HR 的中文打招呼语。',
    '',
    '【候选人的真实情况】',
    '%1$s',
    '',
    '【本轮搜索关键词】%2$s',
    '【岗位名称】%3$s',
    '【岗位完整 JD】',
    '%4$s',
    '【兜底参考语】%5$s',
    '',
    '写作要求：',
    '1. 只输出打招呼语本身。不要任何解释、不要 JSON、不要加引号、不要出现 true 或 false 这两个词。',
    '2. 中文，60 到 90 字，口语化、具体，避免模板腔。',
    '3. 从【岗位完整 JD】里挑 1 到 2 个与【候选人的真实情况】明确对得上的点来讲，不要泛泛而谈。',
    '4. 只能使用【候选人的真实情况】里真实存在的信息，严禁编造技能、经历、学历或成果。',
    '5. 如果 JD 与该候选人明显不匹配，也要写一句礼貌、简短、不硬凑的招呼语，不要列举不适配之处。',
  ].join('\n');
}

const introduce = buildIntroduce(resume);
const prompt = buildPromptTemplate();

// ③ 自检：把 ADR-0003 里那三个坑在生成时就拦住。
const problems = [];
const placeholders = prompt.match(/%\d\$s/g) || [];
if (placeholders.length !== 5) {
  problems.push(`占位符数量应为 5，实际 ${placeholders.length}`);
}
['%1$s', '%2$s', '%3$s', '%4$s', '%5$s'].forEach((p) => {
  if (!prompt.includes(p)) problems.push(`缺少占位符 ${p}`);
});
// 去掉合法占位符后，若仍有裸 %，说明会被 String.format 误判
const stripped = prompt.replace(/%\d\$s/g, '');
if (stripped.includes('%')) {
  problems.push('模板正文含未转义的裸 %（String.format 会抛异常），请写成 %%');
}
if (/%[^0-9]/.test(stripped)) {
  problems.push('模板正文含可疑的 % 序列');
}
if (!introduce || introduce.length < 40) {
  problems.push('introduce 过短，检查 resume.json 是否缺字段');
}

const md = `# get_jobs 接入配置（由 tools/export-outbound.mjs 从 resume.json 生成，勿手改）

> 重新生成：\`node tools/export-outbound.mjs\`
> 背景与边界见 docs/ADR-0003-自动投递采用成熟开源.md

## 怎么用

1. 打开 get_jobs 网页端 →「AI 配置」
2. 把下面**个人介绍**整段粘进 \`introduce\` 字段
3. 把下面**提示词模板**整段粘进 \`prompt\` 字段（务必原样，别改动 \`%1$s\`~\`%5$s\`）
4. \`.env\` 里配好 \`BASE_URL / API_KEY / MODEL\`（可复用本项目同一把 key）
5. 先开调试模式空跑一轮，确认招呼语质量后再正式低频投递

## 个人介绍（introduce）

\`\`\`text
${introduce}
\`\`\`

## 提示词模板（prompt）

\`\`\`text
${prompt}
\`\`\`

## 三个必须知道的坑（ADR-0003 第四节）

1. \`prompt\` 由 Java \`String.format(prompt, introduce, keyword, jobName, jd, sayHi)\` 按序填充 ——
   \`%1$s\`=个人介绍、\`%2$s\`=关键词、\`%3$s\`=岗位名、\`%4$s\`=JD、\`%5$s\`=兜底招呼语。**顺序不能错**。
2. 模板里如果要写真正的百分号，必须写 \`%%\`，否则 \`String.format\` 会报 \`UnknownFormatConversionException\`。
3. 模型输出里一旦出现 \`false\`，get_jobs 会判定失败并回落到固定招呼语 —— 所以模板第 1 条强制"只输出招呼语本身"。
`;

mkdirSync(join(root, 'outbound'), { recursive: true });
writeFileSync(join(root, 'outbound/get_jobs.md'), md, 'utf8');

console.log('[export-outbound] 已生成 outbound/get_jobs.md');
console.log(`  introduce 长度：${introduce.length} 字`);
console.log(`  prompt 占位符：${placeholders.join(' ')}`);
if (problems.length) {
  console.error('\n[自检未通过]');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('  自检：通过（占位符 5 个、无裸 %、introduce 非空）');
