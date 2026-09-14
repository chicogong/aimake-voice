# AIMake - 能发布的 NotebookLM

> 把任何内容（文章、PDF、URL）一键转成可分发的播客。

---

## 🖼️ 界面展示

![AIMake Voice UI Demo](docs/demo.jpg)

## 🎯 为什么选择 AIMake？(对标 NotebookLM)

Google NotebookLM 是一个极好的学习工具，但如果你想把它变成**创作者工具**，你会发现：

- ❌ 它只能生成音频，不能编辑脚本
- ❌ 不能导出 RSS 供外部订阅
- ❌ 不能直接发布到 Spotify 或 Apple Podcasts

**AIMake 的目标是补足「创作 → 发布」的最后一公里：**

- ✅ **脚本可控**：生成的对话脚本支持精细编辑
- ✅ **播客托管**：内置 RSS Feed 生成
- ✅ **一键发布**：支持直接分发到各大播客平台（如 Spotify, Apple Podcasts）

## 👥 适合谁使用？

- **内容创作者**：将写好的公众号文章或博客，一键转为播客，扩大受众群体。
- **知识付费博主**：把文字教程或长文研报转成高质量音频课程。
- **企业培训部门**：将干涩的企业内部文档、PDF 手册转成便于员工通勤收听的培训电台。

## 🚀 当前功能完成度

| 功能特性        | 状态      | 说明                                |
| --------------- | --------- | ----------------------------------- |
| 文本/URL 解析   | 🟢 已实现 | 支持直接粘贴长文本或文章链接        |
| AI 播客脚本生成 | 🟢 已实现 | 接入 DeepSeek LLM，生成双人对话脚本 |
| 多音色 TTS 生成 | 🟢 已实现 | 接入 SiliconFlow TTS，支持多种音色  |
| 用户系统与支付  | 🟢 已实现 | Clerk 鉴权 + Stripe 订阅支付体系    |
| 脚本编辑器      | 🟡 开发中 | 允许在生成语音前调整对话文本        |
| RSS Feed 导出   | 🟡 路线图 | 为每个节目生成标准播客 RSS          |
| 一键发布平台    | 🟡 路线图 | API 对接 Spotify / Apple Podcasts   |

## 🏗 架构

```
Frontend (React)          API (CF Workers)              Agent Service (Node.js)
localhost:5173            localhost:8787                 localhost:3001
                   REST + Clerk JWT          HTTP POST /generate
  CreatePage ──────────────► /api/jobs ──────────────────► voice-agent
  JobDetailPage ◄── SSE ─── /api/jobs/:id/stream         (Agent SDK + LLM)
                             /api/internal ◄──── callbacks ──┘
```

三个服务：

- **Frontend** — React + Vite + Tailwind + shadcn/ui
- **API** — Cloudflare Workers + Hono + D1 + R2 + KV
- **Agent Service** — Node.js + @tencent-ai/agent-sdk + SiliconFlow TTS

## ⚡ 快速开始

```bash
# 1. 安装依赖
cd api && npm install
cd ../agent-service && npm install
cd ../frontend && npm install

# 2. 配置环境变量（参考 .env.example）
# api/.dev.vars — Clerk + SiliconFlow + Internal Secret
# agent-service/.env — LLM + SiliconFlow + Callback URL
# frontend/.env.local — API URL + Clerk Key

# 3. 启动（三个终端）
cd api && npm run dev              # :8787
cd agent-service && npm run dev    # :3001
cd frontend && npm run dev         # :5173
```

## 技术栈

| 层    | 技术                                                       |
| ----- | ---------------------------------------------------------- |
| 前端  | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Clerk |
| API   | Cloudflare Workers, Hono, Drizzle ORM, D1, R2, KV          |
| Agent | @tencent-ai/agent-sdk, DeepSeek LLM, SiliconFlow TTS       |
| 认证  | Clerk                                                      |
| 支付  | Stripe                                                     |

## License

MIT
