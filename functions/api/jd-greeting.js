// Cloudflare Pages Functions — /api/jd-greeting
// 求职者本人使用的「JD 自适应见面语」接口：输入一份岗位 JD，返回匹配度 + 定制招呼语。
// 与 /api/chat 共用同一套准入闸门（./_guard.mjs）与同一份简历事实（./_resume.mjs 烘焙版）。
// 与 chat 的差别：① 非流式（结果短，一次性 JSON 更好解析）② 走 JD 专用提示词 ③ 输出严格 JSON。
// 密钥仍只来自环境变量（AI_API_BASE / AI_API_KEY / AI_MODEL），不进代码。

import { buildJdGreetingPrompt } from './_resume.mjs';
import { LIMITS, isSameOrigin, createRateLimiter } from './_guard.mjs';
import { MAX_JD_CHARS, extractJson, normalizeJdGreeting } from './_jd.mjs';

const allow = createRateLimiter();

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  // ① 同源校验（与 chat 一致）
  if (!isSameOrigin(request.headers.get('Origin'), request.headers.get('Host') || url.host)) {
    return json({ error: '来源不被允许' }, 403);
  }

  // ② 来源限流
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!allow(ip)) return json({ error: '请求过于频繁，请稍后再试' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const jd = String((body && body.jd) || '').trim();
  if (!jd) return json({ error: '缺少 JD 内容' }, 400);
  if (jd.length > MAX_JD_CHARS) return json({ error: `JD 过长（上限 ${MAX_JD_CHARS} 字）` }, 400);

  const payload = {
    model: env.AI_MODEL || 'agnes-2.5-flash',
    messages: [
      { role: 'system', content: buildJdGreetingPrompt(jd) },
      { role: 'user', content: '请按契约输出 JSON。' },
    ],
    stream: false,
    temperature: 0.4,
    max_tokens: Math.min(LIMITS.maxTokens * 2, 1200),
  };

  const base = (env.AI_API_BASE || 'https://api.agnes-ai.cn/v1').replace(/\/$/, '');
  let upstream;
  try {
    upstream = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (env.AI_API_KEY || ''),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: '无法连接模型服务：' + e.message }, 502);
  }

  if (!upstream.ok) {
    const t = await upstream.text().catch(() => '');
    return json({ error: '上游模型错误 ' + upstream.status, detail: t.slice(0, 300) }, 502);
  }

  const data = await upstream.json().catch(() => null);
  const content =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
  const parsed = normalizeJdGreeting(extractJson(content));
  if (!parsed) {
    return json({ error: '模型未返回可解析的 JSON', raw: String(content || '').slice(0, 500) }, 502);
  }

  return json(parsed);
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
