// Cloudflare Pages Functions — /api/admin（主人侧线索看板数据接口）
// 安全：必须配置环境变量 ADMIN_TOKEN，未配置一律拒绝（fail-closed）——否则访客留下的联系方式会被任何人读走。
// 请求头：x-admin-token: <你的口令>

export async function onRequestGet({ request, env }) {
  const token = env.ADMIN_TOKEN;
  if (!token) {
    return json({ error: '未配置 ADMIN_TOKEN，看板已禁用（防止访客数据泄露）' }, 403);
  }
  if (request.headers.get('x-admin-token') !== token) {
    return json({ error: '口令不正确' }, 401);
  }

  const leads = env.LEADS ? await dump(env.LEADS) : [];
  const events = env.EVENTS ? await dump(env.EVENTS) : [];
  return json({
    ok: true,
    storage: env.LEADS ? 'kv' : 'none',
    note: env.LEADS ? '' : '未绑定 KV（LEADS / EVENTS），线上暂未持久化，看板为空属正常',
    leads,
    events,
  });
}

async function dump(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list(cursor ? { cursor, limit: 1000 } : { limit: 1000 });
    for (const k of page.keys) {
      const raw = await kv.get(k.name);
      let rec;
      try { rec = JSON.parse(raw); } catch { rec = { raw }; }
      out.push(rec);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  out.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return out;
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
