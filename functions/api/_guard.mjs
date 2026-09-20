// 接口准入闸门 —— dev.mjs 与 Cloudflare Pages Functions 共用同一份逻辑，保证两侧行为一致。
// 放在 functions/api/ 下、以 _ 前缀命名，与 _resume.mjs 同一范式：同目录相对引入，不产生路由。
// （曾评估放在 shared/ 由 CF 跨目录 import，但 Pages Functions 的跨目录引入未见于官方文档，
//   不拿部署可靠性赌这个不确定性。）
// 纯函数、不 import 任何 Node 内置模块，以便被 CF Functions 直接引入。
//
// 为什么需要它：/api/chat 会消耗上游模型额度。若无闸门，任何人都能把这个站点当免费 LLM 代理刷。
// 三层防线：① 同源校验（挡跨站盗用）② 输入整形（挡提示词注入与超长输入）③ 来源限流（挡单点洪水）。

export const LIMITS = {
  maxMessages: 20,          // 单次请求最多携带的历史条数
  maxCharsPerMessage: 2000, // 单条消息字符上限
  maxTotalChars: 8000,      // 全部消息合计字符上限
  maxTokens: 512,           // 限制单次输出长度，防长文烧额度
  rateWindowMs: 60 * 1000,  // 限流窗口
  rateMax: 12,              // 同一来源每窗口最多请求次数
};

// ① 同源校验。
// 浏览器发起的同源 POST 必定携带 Origin，所以「无 Origin 即拒绝」能挡掉 curl / 脚本直刷，
// 同时不误伤正常访客。file:// 打开时 Origin 为 "null"，同样被拒绝 —— 与 README 中
// 「直接双击 index.html 时 AI 不可用属正常」的既有约定一致。
export function isSameOrigin(originHeader, hostHeader) {
  if (!originHeader || !hostHeader) return false;
  try {
    return new URL(originHeader).host === hostHeader;
  } catch {
    return false;
  }
}

// ② 输入整形。
// 关键点：丢弃 system 等非 user/assistant 角色。否则客户端可传入自己的 system 消息，
// 覆盖或干扰简历分身的人设（提示词注入），让站点替他说出不该说的话。
export function sanitizeMessages(messages, limits = LIMITS) {
  if (!Array.isArray(messages)) return { messages: [], error: '消息格式错误' };

  const out = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : null;
    if (!role) continue;
    const content = typeof m.content === 'string' ? m.content.slice(0, limits.maxCharsPerMessage) : '';
    if (!content.trim()) continue;
    out.push({ role, content });
  }

  const trimmed = out.slice(-limits.maxMessages);
  const total = trimmed.reduce((n, m) => n + m.content.length, 0);
  if (!trimmed.length) return { messages: [], error: '消息为空' };
  if (total > limits.maxTotalChars) return { messages: [], error: '消息过长' };

  return { messages: trimmed, error: null };
}

// ③ 来源限流（滑动窗口，内存实现）。
// 诚实说明其边界：内存计数只在单个进程 / 单个 CF isolate 内有效，不是分布式限流。
// 它能挡住单点循环刷（同一来源通常落在同一 isolate），但挡不住分布式代理池。
// 要真正防刷，请在 Cloudflare 侧叠加 Turnstile 或 Rate Limiting binding —— 不要用 KV 做限流，
// 那会吃掉本项目的线索存储额度（免费版 1000 writes/day）。
export function createRateLimiter(limits = LIMITS) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < limits.rateWindowMs);
    if (recent.length >= limits.rateMax) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear(); // 粗糙的内存上限保护，避免长跑进程无限膨胀
    return true;
  };
}

// 恒定时间字符串比较，避免口令校验被时序侧信道逐字符试探。
export function safeEqual(a, b) {
  const A = String(a == null ? '' : a);
  const B = String(b == null ? '' : b);
  if (A.length !== B.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return diff === 0;
}

// ===== 写接口（/api/lead、/api/event）的专用闸门 =====
// 为什么单列：这两个接口不花模型额度，但直接写 Cloudflare KV —— 免费版只有 1000 writes/day，
// 被刷光的当天真实 HR 留资会**静默丢失**（丢的是本产品的唯一产出物）。危害形态与 /api/chat
// 不同，所以阈值也不同：留资是一次性动作（给极小配额 + 重试余量），事件由前端每 4s 探测板块
// 变化触发、快速划过 7 个板块就会连发多条（配额要给得宽松，否则误伤真实访客）。
export const LEAD_LIMITS = { rateWindowMs: 60 * 1000, rateMax: 5 };
export const EVENT_LIMITS = { rateWindowMs: 60 * 1000, rateMax: 30 };

// 字段白名单：只挑出声明过的字段，其余全部丢弃。
// 不做这层的后果是客户端可往记录里塞任意字段（伪造「来源」「岗位」、超长文本塞爆 KV 体积），
// 且隐私声明「不记个人信息」会变成一句由访客自己填写的空话。
export function pickFields(data, allowed, maxLen = 200) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const key of allowed) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, maxLen);
  }
  return out;
}

// 服务端生成 KV key：绝不拼客户端传来的值（旧实现用 data.contact 拼，等于允许访客往本命名空间
// 写任意 key）。前缀带类型便于排障，随机后缀防同一毫秒内碰撞。
export function serverKey(prefix, now = Date.now()) {
  let rnd = '';
  try {
    const bytes = new Uint8Array(4);
    (globalThis.crypto || {}).getRandomValues?.(bytes);
    rnd = Array.from(bytes, (b) => b.toString(36)).join('').slice(0, 6);
  } catch (e) {}
  return prefix + ':' + now + (rnd ? ':' + rnd : '');
}
