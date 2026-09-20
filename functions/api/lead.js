// Cloudflare Pages Functions — /api/lead
// 接收简历访客留下的联系方式（把注意力转成机会）。
// 本地：dev.mjs 落盘到 leads.json；CF：若有 KV 绑定 LEADS 则写入，否则仅回 ok（请在后台绑定 KV 后启用持久化）。
// 闸门三层：同源校验 + 来源限流 + 字段白名单。理由见 _guard.mjs 的「写接口专用闸门」段。

import { LEAD_LIMITS, isSameOrigin, createRateLimiter, pickFields, serverKey } from './_guard.mjs';

const allow = createRateLimiter(LEAD_LIMITS);
const LEAD_FIELDS = ['name', 'contact', 'note', 'section'];

export async function onRequestPost({ request, env }) {
  // ① 同源：挡跨站脚本直刷（访客在本页面提交天然同源）
  const url = new URL(request.url);
  if (!isSameOrigin(request.headers.get('Origin'), request.headers.get('Host') || url.host)) {
    return json({ error: '来源不被允许' }, 403);
  }

  // ② 限流：免费版 KV 只有 1000 writes/day，被刷光当天真实留资会静默丢失
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!allow(ip)) return json({ error: '请求过于频繁，请稍后再试' }, 429);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  // ③ 白名单：只留这四个字段，其余客户端塞的一律丢弃
  const clean = pickFields(data, LEAD_FIELDS, 300);
  if (!clean.contact) return json({ error: 'contact required' }, 400);

  const rec = { ...clean, ts: new Date().toISOString() };
  if (env.LEADS) {
    await env.LEADS.put(serverKey('lead'), JSON.stringify(rec));
  }
  return json({ ok: true });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
