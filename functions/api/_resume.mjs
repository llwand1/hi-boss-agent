// 自动生成，请勿手改 —— 数据源：resume.json
// 重新生成：node tools/gen-resume.mjs

export const RESUME = {
  "_readme": "简历唯一数据源：改这里即可同时更新页面与 AI 分身的知识。改完如需部署到 Cloudflare，跑一次 `node tools/gen-resume.mjs` 重新生成 functions/api/_resume.mjs。",
  "name": "llwan",
  "avatarText": "L",
  "role": "学生",
  "tagline": "本科 · 湖南",
  "location": "中国 · 湖南",
  "email": "you@example.com",
  "github": "https://github.com/llwan",
  "githubLabel": "github.com/llwan",
  "website": "https://llwan.dev",
  "websiteLabel": "llwan.dev",
  "available": {
    "enabled": true,
    "text": "随时到岗",
    "detail": "可接受实习 / 协作"
  },
  "education": {
    "major": "储能材料工程技术",
    "school": "湖南汽车工程职业大学（本科）",
    "years": "2025 — 2026"
  },
  "about": "湖南汽车工程职业大学（本科）储能材料工程技术专业本科生，目前正在系统学习软件开发与 Web 技术。喜欢动手把学到的知识做成能跑起来的小项目，习惯边做边学。对前端、AI 应用和独立开发有浓厚兴趣，正在持续积累实战经验，随时可以投入到实习或协作项目中。",
  "skills": [
    {
      "name": "TypeScript / React",
      "level": 95
    },
    {
      "name": "Node.js / Express",
      "level": 90
    },
    {
      "name": "Python / Flask",
      "level": 85
    }
  ],
  "tech": [
    "React 18",
    "Vite",
    "Next.js",
    "Express",
    "better-sqlite3",
    "SSE",
    "Python",
    "Flask",
    "Cloudflare",
    "Docker",
    "Tailwind",
    "Git"
  ],
  "greeting": "你好，我是 llwan 的 AI 分身。关于我的专业、技能、经历都可以问我～",
  "sectionTips": {
    "about": "我在系统学软件开发与 Web，想了解我做过什么？点我聊聊～",
    "skills": "看到你在看技能，想听我讲讲 Web / AI 方向的实操吗？",
    "tech": "我对 React、Cloudflare、SSE 这些都在用，想听哪个？",
    "edu": "储能材料 + 自学开发，这个组合有意思，想听我怎么平衡的？",
    "contact": "想进一步聊聊？点我可以随时问，或直接留个联系方式～"
  },
  "sectionChips": {
    "about": [
      "你做过哪些项目？",
      "你最擅长什么方向？",
      "现在能实习吗？"
    ],
    "skills": [
      "讲讲你的 React 实战",
      "你会后端吗？",
      "AI 应用做过什么？"
    ],
    "tech": [
      "用过 Cloudflare 吗？",
      "为什么喜欢用 SSE？",
      "技术栈怎么选的？"
    ],
    "edu": [
      "为什么读储能材料？",
      "专业和开发怎么兼顾？",
      "学校有什么资源？"
    ],
    "contact": [
      "怎么联系你？",
      "想聊什么岗位？",
      "可以留个联系方式吗？"
    ]
  },
  "_optional_blocks": "下面两块是模板预留位：填了内容才会渲染对应区块，留空则页面不显示（避免占位噪音）。",
  "intent": {},
  "projects": []
};

export const SYSTEM_PROMPT = "你是 llwan 的 AI 分身，出现在 llwan 的个人简历网站上。\n只回答与 llwan 本人相关的问题（专业、学校、技能、经历、求职意向等）；遇到无关话题，礼貌说明你只负责介绍 llwan，不展开回答。\n不确定就说不确定，不要编造信息。\n\n【llwan 简历】\n- 姓名：llwan\n- 身份：学生\n- 学历：湖南汽车工程职业大学（本科） · 储能材料工程技术专业 · 2025 — 2026\n- 所在地：中国 · 湖南\n- 状态：随时到岗（可接受实习 / 协作）\n- 核心技能：TypeScript / React（95%）、Node.js / Express（90%）、Python / Flask（85%）\n- 技术栈：React 18、Vite、Next.js、Express、better-sqlite3、SSE、Python、Flask、Cloudflare、Docker、Tailwind、Git\n- 简介：湖南汽车工程职业大学（本科）储能材料工程技术专业本科生，目前正在系统学习软件开发与 Web 技术。喜欢动手把学到的知识做成能跑起来的小项目，习惯边做边学。对前端、AI 应用和独立开发有浓厚兴趣，正在持续积累实战经验，随时可以投入到实习或协作项目中。\n- 联系方式：you@example.com、github.com/llwan、llwan.dev（以页面展示为准）\n\n【主动表现】\n访客浏览某个板块（技能/教育/技术栈/关于我）时，主动、简洁地介绍该板块亮点，把这次访问变成一次自我介绍的机会。\n如果访客想进一步联系、留联系方式或问怎么联系你，友好地建议他使用对话窗口里的「留联」按钮留下联系方式；不要在对话里直接索要或暴露主人的私人联系方式。\n\n回答风格：简洁、口语化、用中文。";
