# Grok 交付口径交接

2026-10-22。对照 `docs/product/2026-10-22-delivery-and-entry-outsourcing.md` 第 1–4 节。未部署，未提交，未跑真实模型，未改积分、短信或真人简历。

## 改了什么

共享回执在 `lib/coach-harness/resume-delivery.ts`。`ResumeAgentTask.delivery` 可选。历史任务没有足够字段时 `outcome` 为 `unknown`，不能把 `ready` 当成 `delivered`。

服务端在拿到 lease 后写 `resume_task_started`，在这一代结束时写 `resume_task_outcome`。幂等键是事件名加代次 `taskId:version`，版本用服务端 `claimed.version`，不用前端猜的 `version-1`。写失败只返回 `unconfirmed`，不把任务改成失败，也不重跑模型。测试环境不写库。

浏览器不能提交 `resume_task_started`、`resume_task_outcome`、`resume_document_persisted`。`resume_result_presented` 和 `resume_change_decided` 只留代次、修改编号和 accept/keep，正文会被丢掉，并按代次去重。入口事件沿 Qoder 已有的 `entry_kind / page_category / request_id / stage / reason_code`。

管理员汇总 `buildAnalytics().resumeDelivery` 只数 `schema_version=2`。旧 `resume_generation_*` 不加入。本人、QA、development/preview 仍按原排除规则。页面布局没改。

`resume-execution.ts` 的质检协议自修、一次原编辑返修、事实门禁没有重写。空回复和超时仍走现有 `model_response_incomplete`。10/19 与 10/21 的历史 Trace 没有原文，不能据此再改供应商或协议。

## Qoder 要接的契约

```ts
delivery?: {
  schemaVersion: 2;
  generationId: string | null;
  traceId: string | null;
  evalRunId: string | null;
  outcome: "running" | "delivered" | "partial_delivered" | "unchanged" | "needs_detail" | "blocked" | "failed" | "quota_denied" | "unconfirmed" | "unknown";
  deliveredCount: number | null;
  persistence: "confirmed" | "not_persisted" | "returned_only" | "unknown";
  stage: string | null;
  reasonCode: "model_response_incomplete" | "resume_detail_needed" | "resume_document_review_failed" | "resume_review_unavailable" | "context_budget_exceeded" | "quota_denied" | "cas_conflict" | "trace_unconfirmed" | "draft_returned_without_opportunity" | "request_failed" | "unlisted" | null;
  retryable: boolean | null;
}
```

没有 `delivery` 或 `outcome === "unknown"` 时显示未记录。`persistence === "returned_only"` 不是已保存到工作区。讨论消息不产生 `resume_task_started`。

虚构的一条结果事件：

```json
{
  "event_name": "resume_task_outcome",
  "properties": {
    "schema_version": 2,
    "generation_id": "00000000-0000-4000-8000-000000000001:3",
    "trace_id": null,
    "eval_run_id": null,
    "outcome": "partial_delivered",
    "persistence": "confirmed",
    "stage": null,
    "reason_code": null,
    "delivered_count": 1
  }
}
```

## 测试

`npx jest lib/coach-harness/resume-delivery.test.ts app/api/product-events/route.test.ts app/api/coach/resume-agent/route.test.ts lib/admin-analytics.test.ts lib/coach-harness/resume-task.test.ts --runInBand`

57 项通过。随后 `resume-delivery.test.ts` 6 项再跑通过。上述改动文件的 eslint 通过。没有跑全量 `tsc`，没有跑真实模型。

覆盖：无效/空回复和质检失败不是 delivered；安全修改加一问是 partial_delivered；只追问是 needs_detail；不必改是 unchanged；旧 changes 不算本代；提交后传输失败仍保留已读回的 delivered；结束记录缺失是 unconfirmed；无岗位只返回是 returned_only；额度拒绝和 CAS 分开；客户端不能上报服务端终态；同一代次只计一次；旧 `resume_generation_completed` 不进新分母。

## 还没做

`resume_document_persisted` 已进白名单且浏览器不能发，但文档 revision 确认之后的写入点还没接上。汇总里的 `documentsPersisted` 会保持 0，不能把它读成「没有人采纳」。

直接调用、没有 `resumeTaskId` 的 draft 仍不会进入新分母。无机会时的 `draft_returned_without_opportunity` 只在分类函数里单列，没有从执行函数再记一条。

管理员页面没有新的表格。真实保存、刷新、PDF 和正式库都没验。
