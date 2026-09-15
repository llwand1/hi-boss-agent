// 本地开发服务器（零依赖，仅用 Node 内置模块）
// 作用：① 托管静态简历页面  ② /api/chat 代理到 Agnes（OpenAI 兼容 SSE）
//      ③ /api/lead 留资落盘  ④ /api/event 匿名注意力事件落盘  ⑤ /api/admin 主人侧看板数据
// 配置从 .env.local 或进程环境变量读取：AI_API_BASE / AI_API_KEY / AI_MODEL / ADMIN_TOKEN / HOST / PORT
// 简历内容来自 resume.json（改它即可，无需改代码）
// 启动：node dev.mjs   （默认 http://127.0.0.1:8788，仅本机可访问）

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { buildSystemPrompt } from './shared/prompt.mjs';
import { LIMITS, isSameOrigin, sanitizeMessages, createRateLimiter, safeEqual } from './functions/api/_guard.mjs';

// 读取 .env.local（不进 git）
if (existsSync('.env.local')) {
  const txt = readFileSync('.env.local', 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8788;
// 只绑本机回环。本服务托管着项目目录与密钥文件，绑 0.0.0.0 会让同一局域网内任何人
// 直接下载 .env.local（API Key）与 leads.json（访客联系方式）。
// 确需局域网调试（如手机预览）时显式设 HOST=0.0.0.0，并知悉上述数据将对同网段公开。
const HOST = process.env.HOST || '127.0.0.1';

// 静态资源白名单（deny by default）：新增前端资源请在此登记，未登记的一律 404。
// 之所以用白名单而非黑名单——黑名单漏一项就会把 .env.local / leads.json / 源码直接暴露出去。
const PUBLIC_FILES = new Set(['/index.html', '/admin.html', '/resume.json']);
const PUBLIC_DIRS = []; // 例：'/assets/'

// 看板口令：未配置则生成本次运行有效的临时口令并打印，绝不静默放行
// （此前「本地未设口令即放行」会让访客联系方式在本机被任何人裸读）。
let ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ADMIN_TOKEN_IS_TEMP = !ADMIN_TOKEN;
if (ADMIN_TOKEN_IS_TEMP) ADMIN_TOKEN = randomBytes(12).toString('hex');

const allowChat = createRateLimiter();

// 系统提示：由 resume.json 生成（与 Cloudflare 侧共用 shared/prompt.mjs，保证一致）
let SYSTEM_PROMPT = '你是简历站点的 AI 助手，用中文简洁回答访客问题。';
function loadSystemPrompt() {
  try {
    const r = JSON.parse(readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
    SYSTEM_PROMPT = buildSystemPrompt(r);
  } catch (e) {
    console.warn('[dev] 读取 resume.json 失败（' + e.message + '），使用兜底提示词');
  }
}
loadSystemPrompt();

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// 读取 NDJSON（每行一条记录）文件
function readNdjson(fp) {
  if (!existsSync(fp)) return [];
  return readFileSync(fp, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .reverse();
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // ===== /api/chat 代理 =====
  if (req.method === 'POST' && u.pathname === '/api/chat') {
    // ① 同源校验：挡掉跨站盗用与脚本直刷（浏览器同源 POST 必带 Origin，不误伤正常访客）
    if (!isSameOrigin(req.headers.origin, req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '来源不被允许' }));
      return;
    }
    // ② 来源限流：挡单点洪水
    if (!allowChat(req.socket.remoteAddress || 'unknown')) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '请求过于频繁，请稍后再试' }));
      return;
    }

    let raw = '';
    for await (const c of req) raw += c;
    let data;
    try { data = JSON.parse(raw); } catch { res.writeHead(400); res.end('bad json'); return; }

    // ③ 输入整形：长度上限 + 角色白名单（丢弃客户端自带的 system，防提示词注入）
    const { messages, error: msgErr } = sanitizeMessages(data && data.messages, LIMITS);
    if (msgErr) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msgErr }));
      return;
    }

    const base = (process.env.AI_API_BASE || '').replace(/\/$/, '');
    if (!base) {
      res.writeHead(500);
      res.end('缺少 AI_API_BASE，请在 .env.local 配置 Agnes 的接口地址（如 https://api.xxx.com/v1）');
      return;
    }

    loadSystemPrompt();   // 开发期热更新：改完 resume.json 无需重启服务
    const payload = {
      model: process.env.AI_MODEL || 'agnes-2.5-flash',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      temperature: 0.3,
      max_tokens: LIMITS.maxTokens,
    };

    try {
      const upstream = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (process.env.AI_API_KEY || ''),
        },
        body: JSON.stringify(payload),
      });
      if (!upstream.ok || !upstream.body) {
        const t = await upstream.text().catch(() => '');
        res.writeHead(502);
        res.end('upstream error ' + upstream.status + ' ' + t);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (e) {
      res.writeHead(500);
      res.end('proxy error: ' + e.message);
    }
    return;
  }

  // ===== /api/lead 留资（把注意力转成机会）=====
  if (req.method === 'POST' && u.pathname === '/api/lead') {
    let raw = '';
    for await (const c of req) raw += c;
    let data;
    try { data = JSON.parse(raw); } catch { res.writeHead(400); res.end('bad json'); return; }
    if (!data.contact) { res.writeHead(400); res.end('contact required'); return; }
    const rec = { ...data, ts: new Date().toISOString(), ip: req.socket.remoteAddress };
    const fp = path.join(ROOT, 'leads.json');
    const prev = existsSync(fp) ? readFileSync(fp, 'utf8').trim() : '';
    writeFileSync(fp, (prev ? prev + '\n' : '') + JSON.stringify(rec) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ===== /api/event 匿名注意力事件（无个人信息）=====
  if (req.method === 'POST' && u.pathname === '/api/event') {
    let raw = '';
    for await (const c of req) raw += c;
    let data;
    try { data = JSON.parse(raw); } catch { res.writeHead(400); res.end('bad json'); return; }
    const rec = { ...data, ts: new Date().toISOString() };
    const fp = path.join(ROOT, 'events.json');
    const prev = existsSync(fp) ? readFileSync(fp, 'utf8').trim() : '';
    writeFileSync(fp, (prev ? prev + '\n' : '') + JSON.stringify(rec) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ===== /api/admin 主人侧看板数据 =====
  // fail-closed：口令不匹配一律拒绝（恒定时间比较，防逐字符时序试探）。
  // 线上 admin.js 早已是 fail-closed；此前本地「未设口令则放行」是唯一的缺口。
  if (req.method === 'GET' && u.pathname === '/api/admin') {
    if (!safeEqual(req.headers['x-admin-token'], ADMIN_TOKEN)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '口令不正确' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      storage: 'local',
      leads: readNdjson(path.join(ROOT, 'leads.json')),
      events: readNdjson(path.join(ROOT, 'events.json')),
    }));
    return;
  }

  // ===== 静态文件（白名单，deny by default）=====
  // 未经登记的文件一律 404 —— 这是防止 .env.local / leads.json / events.json / 源码被下载的关键。
  let rel;
  try {
    rel = decodeURIComponent(u.pathname);
  } catch {
    res.writeHead(400); res.end('bad path'); return;
  }
  if (rel === '/') rel = '/index.html';
  const isPublic = PUBLIC_FILES.has(rel) || PUBLIC_DIRS.some(function (d) { return rel.indexOf(d) === 0; });
  if (!isPublic) { res.writeHead(404); res.end('not found'); return; }

  const fp = path.resolve(ROOT, '.' + rel);
  if (fp !== ROOT && fp.indexOf(ROOT + path.sep) !== 0) { res.writeHead(403); res.end('forbidden'); return; }
  try {
    const buf = await readFile(fp);
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': (MIME[ext] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log('[dev] 简历站点本地运行中： http://' + HOST + ':' + PORT);
  console.log('[dev] 看板： http://' + HOST + ':' + PORT + '/admin.html');
  console.log('[dev] AI 代理目标 AI_API_BASE =', process.env.AI_API_BASE || '（未配置）');
  console.log('[dev] 仅绑定 ' + HOST + '，局域网不可访问。确需手机预览请显式设 HOST=0.0.0.0（届时密钥与访客线索将对同网段公开）。');
  if (ADMIN_TOKEN_IS_TEMP) {
    console.log('[dev] 未配置 ADMIN_TOKEN，本次运行使用临时口令（重启即变，复制到看板即可）：');
    console.log('      ' + ADMIN_TOKEN);
  }
});
