// Cloudflare Pages Functions — /api/chat
// 接收前端消息 -> 过准入闸门 -> 注入简历分身系统提示 -> 调用 OpenAI 兼容 SSE 接口 -> 原样流式返回。
// 密钥只来自环境变量（AI_API_BASE / AI_API_KEY / AI_MODEL），不进代码。
// 系统提示来自 resume.json（经 `node tools/gen-resume.mjs` 固化为 ./_resume.mjs）。
// 准入闸门见 ./_guard.mjs（与本地 dev.mjs 共用同一份逻辑，保证两侧行为一致）。

import { SYSTEM_PROMPT } from './_resume.mjs';
import { LIMITS, isSameOrigin, sanitizeMessages, createRateLimiter } from './_guard.mjs';

// 模块级限流器：在单个 isolate 生命周期内生效。跨 isolate 的分布式限流需另配 Turnstile /
// Rate Limiting binding，详见 _guard.mjs 的说明。
const allow = createRateLimiter();

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  // ① 同源校验：挡掉跨站盗用与脚本直刷
  if (!isSameOrigin(request.headers.get('Origin'), request.headers.get('Host') || url.host)) {
    return json({ error: '来源不被允许' }, 403);
  }

  // ② 来源限流：挡单点洪水
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!allow(ip)) return json({ error: '请求过于频繁，请稍后再试' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  // ③ 输入整形：长度上限 + 角色白名单（丢弃客户端自带的 system，防提示词注入）
  const { messages, error } = sanitizeMessages(body && body.messages, LIMITS);
  if (error) return json({ error }, 400);

  const payload = {
    model: env.AI_MODEL || 'agnes-2.5-flash',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    stream: true,
    temperature: 0.3,
    max_tokens: LIMITS.maxTokens,
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
    return new Response('无法连接模型服务：' + e.message, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => '');
    return new Response('上游模型错误 ' + upstream.status + ' ' + txt, { status: 502 });
  }

  // 不再回传 Access-Control-Allow-Origin: * —— 已强制同源，通配头只会扩大攻击面
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
