// Cloudflare Pages Functions — /api/lead
// 接收简历访客留下的联系方式（把注意力转成机会）。
// 本地：dev.mjs 落盘到 leads.json；CF：若有 KV 绑定 LEADS 则写入，否则仅回 ok（请在后台绑定 KV 后启用持久化）。

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  if (!data.contact) return json({ error: 'contact required' }, 400);

  const rec = { ...data, ts: new Date().toISOString() };
  if (env.LEADS) {
    const id = (data.contact + ':' + Date.now());
    await env.LEADS.put(id, JSON.stringify(rec));
  }
  return json({ ok: true });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
