// Cloudflare Pages Functions — /api/event
// 接收匿名注意力事件（板块浏览 / 面板打开 / 留资），不含个人信息，仅用于衡量“摸鱼浏览”这种高意向信号。
// 本地：dev.mjs 落盘到 events.json；CF：若有 KV 绑定 EVENTS 则写入，否则仅回 ok。

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const rec = { ...data, ts: new Date().toISOString() };
  if (env.EVENTS) {
    const id = (data.type + ':' + (data.section || '') + ':' + Date.now());
    await env.EVENTS.put(id, JSON.stringify(rec));
  }
  return json({ ok: true });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
