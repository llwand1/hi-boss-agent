// 简历分身系统提示词生成器 —— 全项目唯一定义处（前端/本地后端/CF Functions 共用同一份逻辑）
// 输入：resume.json 解析后的对象；输出：注入给模型的 system prompt 文本。
// 注意：本文件保持纯函数、不 import 任何 Node 内置模块，以便被 Cloudflare Pages Functions 直接引入。

export function buildSystemPrompt(r) {
  const skills = (r.skills || [])
    .map((s) => `${s.name}（${s.level}%）`)
    .join('、');
  const tech = (r.tech || []).join('、');
  const contacts = [r.email, r.githubLabel, r.websiteLabel].filter(Boolean).join('、');
  const edu = r.education || {};
  const avail = r.available || {};

  // 求职意向：形如「目标岗位：xxx；期望城市：yyy；到岗时间：zzz」
  const intent = r.intent && Object.keys(r.intent).length
    ? Object.keys(r.intent).map((k) => `${k}：${r.intent[k]}`).join('；')
    : '';

  // 项目经历：把「关键取舍」一并注入 —— 这是简历分身最该讲清楚的部分（判断力，而非堆技术名词）
  const projects = (r.projects || [])
    .map((p) => {
      const head = `${p.name || ''}${p.period ? '（' + p.period + '）' : ''}`;
      const picks = (p.decisions || [])
        .map((d) => (typeof d === 'string' ? d : `${d.choice || ''}——${d.why || ''}`))
        .filter(Boolean);
      const stack = (p.stack || []).join('/');
      const parts = [p.desc || ''];
      if (stack) parts.push(`技术：${stack}`);
      if (picks.length) parts.push(`关键取舍：${picks.join('；')}`);
      return `- ${head}：${parts.filter(Boolean).join(' ')}`;
    })
    .join('\n');

  return `你是 ${r.name} 的 AI 分身，出现在 ${r.name} 的个人简历网站上。
只回答与 ${r.name} 本人相关的问题（专业、学校、技能、经历、项目、求职意向等）；遇到无关话题，礼貌说明你只负责介绍 ${r.name}，不展开回答。
不确定就说不确定，不要编造信息。

【${r.name} 简历】
- 姓名：${r.name}
- 身份：${r.role || ''}
- 学历：${edu.school || ''} · ${edu.major || ''}专业 · ${edu.years || ''}
- 所在地：${r.location || ''}
- 状态：${avail.enabled ? avail.text : '暂无明确状态'}${avail.detail ? '（' + avail.detail + '）' : ''}
- 核心技能：${skills}
- 技术栈：${tech}
- 简介：${r.about || ''}${intent ? '\n- 求职意向：' + intent : ''}${projects ? '\n- 项目经历：\n' + projects : ''}
- 联系方式：${contacts}（以页面展示为准）

【主动表现】
访客浏览某个板块（技能/教育/技术栈/关于我/求职意向/项目）时，主动、简洁地介绍该板块亮点，把这次访问变成一次自我介绍的机会。
当访客问到项目、或问起这个网站本身时，除了讲技术，更要讲清为它做过的关键取舍（例如：主动开口要克制以免骚扰、答不上来就转交本人而不是硬编、内容按需加载让响应更快）——这体现的是判断力，比罗列技术名词更有价值。
如果访客想进一步联系、留联系方式或问怎么联系你，友好地建议他使用对话窗口里的「留联」按钮留下联系方式；不要在对话里直接索要或暴露主人的私人联系方式。

回答风格：简洁、口语化、用中文。`;
}

// ───────────────────────────────────────────────────────────────────────────
// JD 自适应见面语生成器（求职者本人使用，非访客侧功能）
// 输入：resume 对象 + 一份岗位 JD 文本；输出：要求模型返回的严格 JSON（匹配度 + 招呼语）。
// 拆成三块，是为了让 gen-resume.mjs 能把「依赖简历」的部分烘焙成常量塞进 _resume.mjs，
// 从而让 Cloudflare Functions 无需跨目录 import shared/（见 _guard.mjs 顶部约定）。
// ───────────────────────────────────────────────────────────────────────────

// ① 简历事实块（依赖 resume，需被烘焙）
export function buildJdGreetingFacts(r) {
  const skills = (r.skills || []).map((s) => `${s.name}（${s.level}%）`).join('、');
  const tech = (r.tech || []).join('、');
  const edu = r.education || {};
  const avail = r.available || {};
  const intent = r.intent && Object.keys(r.intent).length
    ? Object.keys(r.intent).map((k) => `${k}：${r.intent[k]}`).join('；')
    : '';
  const projects = (r.projects || [])
    .map((p) => {
      const picks = (p.decisions || [])
        .map((d) => (typeof d === 'string' ? d : `${d.choice || ''}——${d.why || ''}`))
        .filter(Boolean);
      const stack = (p.stack || []).join('/');
      const parts = [p.desc || ''];
      if (stack) parts.push(`技术：${stack}`);
      if (picks.length) parts.push(`关键取舍：${picks.join('；')}`);
      return `- ${p.name || ''}${p.period ? '（' + p.period + '）' : ''}：${parts.filter(Boolean).join(' ')}`;
    })
    .join('\n');

  return `【简历事实】（只允许使用这里真实存在的信息，禁止编造）
- 姓名：${r.name}｜身份：${r.role || ''}
- 学历：${edu.school || ''} · ${edu.major || ''} · ${edu.years || ''}
- 所在地：${r.location || ''}
- 状态：${avail.enabled ? avail.text : '暂无明确状态'}${avail.detail ? '（' + avail.detail + '）' : ''}
- 核心技能：${skills}
- 技术栈：${tech}${intent ? '\n- 求职意向：' + intent : ''}${projects ? '\n- 项目：\n' + projects : ''}`;
}

// ② 任务说明 + 输出 JSON 契约（常量，与简历无关）
export const JD_GREETING_TASK = `【任务】
你是一名求职顾问。请针对上面这份「岗位 JD」，判断它与候选人简历的真实匹配度，并写出一段可以直接投递的打招呼语。

硬性要求：
1. 只能使用【简历事实】里真实存在的信息，严禁编造任何技能、经历、学历或成果。
2. JD 要求但简历明显缺失的点，必须如实写进 gaps，不要回避、也不要用含糊措辞掩盖。
3. 以应届 / 实习为基准诚实评分，不要为了好看而虚高。

只输出一个 JSON 对象（不要 markdown 代码块、不要任何多余文字），字段如下：
{
  "score": 0 到 100 的整数，表示真实匹配度,
  "verdict": "投" 或 "谨慎" 或 "不建议",
  "greeting": "可直接发给 HR 的打招呼语，中文，60-90 字。点出 JD 里 1-2 个与简历对得上的具体点，可借项目取舍体现判断力；口语、具体、不模板腔",
  "emphasize": ["JD 里最该向对方突出的 2-3 个点，必须对应简历中真实有的东西"],
  "gaps": ["JD 要求但简历明显缺失的点；没有则给空数组"],
  "rationale": "一句话说明这个 score 是怎么来的"
}`;

// ③ 完整系统提示（本地 dev.mjs 直接调用；CF 侧用 _resume.mjs 里的烘焙版）
export function buildJdGreetingPrompt(r, jd) {
  return `${buildJdGreetingFacts(r)}\n\n【岗位 JD】\n${jd}\n\n${JD_GREETING_TASK}`;
}
