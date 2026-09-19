// JD 见面语接口的共用工具 —— dev.mjs 与 Cloudflare Functions 共用同一份，保证两侧行为一致。
// 与 _guard.mjs / _resume.mjs 同一范式：放在 functions/api/ 下、以 _ 前缀命名，同目录相对引入，不产生路由。
// 纯函数、不 import 任何 Node 内置模块，以便被 CF Functions 直接引入。

// JD 文本长度上限：足够容纳长 JD，又挡住把接口当免费大模型用的人塞整本书。
export const MAX_JD_CHARS = 6000;

// 从模型输出里抠出第一个完整 JSON 对象。
// 容忍模型多嘴包了 markdown 代码块（```json ... ```）或前后带解释文字。
export function extractJson(s) {
  if (!s) return null;
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// 输出整形：字段缺失或类型不对时给安全默认值，避免前端拿到 undefined 崩掉。
export function normalizeJdGreeting(o) {
  if (!o || typeof o !== 'object') return null;
  const score = Number.isFinite(Number(o.score))
    ? Math.max(0, Math.min(100, Math.round(Number(o.score))))
    : null;
  const verdicts = ['投', '谨慎', '不建议'];
  const verdict = verdicts.includes(o.verdict)
    ? o.verdict
    : score == null
      ? ''
      : score >= 70
        ? '投'
        : score >= 45
          ? '谨慎'
          : '不建议';
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6) : []);
  return {
    score,
    verdict,
    greeting: typeof o.greeting === 'string' ? o.greeting.trim() : '',
    emphasize: arr(o.emphasize),
    gaps: arr(o.gaps),
    rationale: typeof o.rationale === 'string' ? o.rationale.trim() : '',
  };
}
