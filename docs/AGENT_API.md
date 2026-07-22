# Agent API — 外部 Agent（小龙虾 / Hermes CLI）接入文档

Convation 官网对外暴露一套**令牌认证**的 Agent API，供外部 CLI Agent（小龙虾发文、Hermes 值守）自动向 Notizie 供稿、监控并回复评论。站内已有一个**内置自动化 Worker** 常驻处理评论——外部 Agent 是可选增强，不是必需。

**语言约定**：前台是意/英双语站。发文必带 `lang`（`it` 意语版 / `en` 英语版，默认 `it`），文章只出现在对应语言版的 Notizie；`title/excerpt/content_md/category` 都要用该语言书写（`category` 会原样渲染成前台分类标签）。

## 认证

后台「智能助理 → API 令牌」生成令牌（`alan_xxx`，只显示一次，哈希存储、可吊销）。每次请求带：

```
Authorization: Bearer alan_xxxxxxxxxxxxxxxxxxxxxxxx
```

- 基址：`https://www.convation.it/api/agent`
- 限流：每令牌 240 次 / 10 分钟
- 每次调用刷新令牌 `last_used` 与全局 Agent 心跳，并写入后台「活动日志」

## 端点

### GET /status — 状态与队列（自适应用）
```bash
curl -H "Authorization: Bearer $TOKEN" https://www.convation.it/api/agent/status
```
返回当前模式与待处理量，外部 Agent 据此决定是否发文/回帖：
```json
{ "ok": true, "agent": "小龙虾",
  "modes": { "content_review": true, "comment_autoreply": true },
  "queue": { "comments_pending": 3, "comments_skipped": 1, "drafts_awaiting_review": 2, "messages_total": 5 },
  "server_time": "2026-07-17T..." }
```

### POST /posts — 发布文章
受**内容审核制**约束：开启时一律落草稿（`status:"draft"`），等后台一键发布。
```bash
curl -X POST https://www.convation.it/api/agent/posts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lang":"it","title":"Pompe di calore: guida agli incentivi 2026","category":"Incentivi","excerpt":"Cosa cambia e come muoversi.","content_md":"# Guida\n...","read_minutes":8}'
```
字段：`lang` `it`/`en`（默认 `it`，其余值 400）；`category` 默认 `Settore`；slug 由标题自动生成（意语变音符转写 + 时间戳后缀，SEO 友好）；发布日期按 Europe/Rome。
返回 `{ "ok": true, "id": 12, "slug": "pompe-di-calore-guida-...", "status": "draft", "lang": "it", "note": "..." }`

### GET /comments — 拉取评论队列
```bash
curl -H "Authorization: Bearer $TOKEN" "https://www.convation.it/api/agent/comments?status=pending&limit=20"
```
`status`：`pending`（未处理，默认）/ `skipped`（转人工）/ `all`。每条含文章上下文（`post_id/post_slug/post_title`），供生成针对性回复。**回复语言跟随评论所在文章的语言**（意语文章意语回，英语文章英语回）。

### POST /comments/:id/reply — 提交回复
**评论回复全自动**：直接上线，前台显示为 `Convation` + „Team Convation" 徽标。
```bash
curl -X POST https://www.convation.it/api/agent/comments/34/reply \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"body":"Grazie della domanda: per una pompa di calore aria-acqua..."}'
```

### GET /messages — 站内留言（只读，供汇总/提醒）
```bash
curl -H "Authorization: Bearer $TOKEN" "https://www.convation.it/api/agent/messages?limit=20"
```

## 值守脚本示例（轮询式，最贴合 CLI Agent）

```bash
#!/usr/bin/env bash
# 每 5 分钟拉未回复评论 → 生成回复 → 回帖
TOKEN="alan_xxx"; BASE="https://www.convation.it/api/agent"
while true; do
  curl -s -H "Authorization: Bearer $TOKEN" "$BASE/comments?status=pending" \
  | jq -c '.comments[]' | while read -r c; do
      id=$(echo "$c" | jq -r .id)
      body=$(echo "$c" | jq -r .body)
      reply=$(your_llm_generate "$body")   # 你的 LLM/小龙虾生成逻辑
      curl -s -X POST "$BASE/comments/$id/reply" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d "$(jq -n --arg b "$reply" '{body:$b}')"
    done
  sleep 300
done
```

## 双轨说明

- **站内 Worker（默认，零外部依赖）**：服务进程内每隔 N 分钟自动巡检未回复评论并回帖，含失败退避、开关关闭期间积压补处理。后台「智能助理」可开关、调间隔、看队列与活动日志。
- **外部 Agent API（本文，可选）**：需要外部 LLM/自定义逻辑或与既有小龙虾/Hermes CLI 打通时使用。两者可共存——外部 Agent 回帖后该评论即置为已处理，Worker 不会重复回。

## 安全

令牌哈希（sha256）存储、创建时只显示一次、可随时吊销；仅 HTTPS；发文受审核制约束；所有动作留痕于活动日志。
