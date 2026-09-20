// Cloudflare Pages Functions — /api/event
// 接收匿名注意力事件（板块浏览 / 面板打开 / 留资），不含个人信息，仅用于衡量“摸鱼浏览”这种高意向信号。
// 本地：dev.mjs 落盘到 events.json；CF：若有 KV 绑定 EVENTS 则写入，否则仅回 ok。
// 闸门三层：同源校验 + 来源限流 + 字段白名单（白名单同时兜住了隐私：客户端塞的 ip/ua/联系方式一律丢弃）。

import { EVENT_LIMITS, isSameOrigin, createRateLimiter, pickFields, serverKey } from './_guard.mjs';

const allow = createRateLimiter(EVENT_LIMITS);
const EVENT_FIELDS = ['type', 'section'];

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (!isSameOrigin(request.headers.get('Origin'), request.headers.get('Host') || url.host)) {
    return json({ error: '来源不被允许' }, 403);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!allow(ip)) return json({ error: '请求过于频繁，请稍后再试' }, 429);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const clean = pickFields(data, EVENT_FIELDS, 60);
  if (!clean.type) return json({ error: 'type required' }, 400);

  const rec = { ...clean, ts: new Date().toISOString() };
  if (env.EVENTS) {
    await env.EVENTS.put(serverKey('evt'), JSON.stringify(rec));
  }
  return json({ ok: true });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
