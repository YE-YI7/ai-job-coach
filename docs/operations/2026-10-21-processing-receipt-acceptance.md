# 真实处理摘要、逐问与无依据评分清理

2026-10-21（America/Los_Angeles）。本人授权：先定位失败、清默认分数、接右侧真实处理摘要与导师逐问，保留模型选择和聊天体验；保存、刷新、PDF 验收后才上线。目录本人晚上处理，旧作答与积分不动。

## 已定位与实现

- 原 JD 测试复现 4 failed / 26 passed。当前机器将 `careers.manus.im` 解析为 `198.18.6.186`，原测试真实 DNS 触发安全拦截，未到模型。超时/402/余额日志的堆栈分别指向测试的 mock 构造行，不是实际模型失败证据。
- 仅测试中隔离 DNS/HTTP/LLM；补 198.18、127.0.0.1、10.0.0.1 拒绝且不调用 HTTP/额度/模型断言。33 项通过。没有放松生产 SSRF 防护，也不据此宣称原评论链接已在生产修复。
- 新投递结构不再补默认 80，旧分析 API 丢弃模型自带的匹配分字段，旧定制 API 不返回匹配分，两个白板和旧简历面板不展示百分比。另发现旧面试启发式也补固定 80，只去掉该默认，不改有量表依据的面试评估。保留旧路由、原数据和历史 JSON，不做批量迁移。
- 右侧折叠处理摘要读取同一用户、同一任务代次的真实 Trace 元数据，展示实际已读材料、入选知识、经过阶段和检查记录。不展示候选分数、提示词、推理或其他用户资料；没有历史记录便不编造。各真实阶段最多写一个串行检查点，终态按序落盘；不增加模型调用。
- 导师仍先讨论、自己决定是否执行编辑，继续沿用 NDJSON 逐步回复、Markdown 渲染、气泡和原模型选择位置。实时前缀与保存回复采用同一单问边界；明确“不知道/跳过”只标为跳过，不进入经历事实、不重复询问。
- 没有批准按钮、回复产物卡、上新首页、目录写入、订阅购买或积分兑换改动。

## 隔离与发布边界

当前开发树有协作者在途打印、模板偏好、DESIGN 和日检文件，本任务不提交、不从脏树直接部署。最终以本任务精确提交的干净归档构建、暂存 Production 验收、同构建 promote。

UI 手动 Impeccable detect 一次：0 primary，仅原进度条历史 2px 圆角 advisory；未改该历史样式，未开启自动钩子。类型检查与新增文件 lint 已通过。开发树定向 14 套 144 项通过（含协作者在途打印测试，不能代替最终干净归档回归）；新增旧面试默认分测试待合并最终运行。

## 写入前保护快照

仅查行数与排序 JSONB 摘要，不读取/输出用户正文。

| 范围 | 行数 | MD5 |
| --- | ---: | --- |
| interview_answers | 41 | 9e144836009b5eb9bfe09dec0ac90d32 |
| coach_opportunities | 36 | 7fee44e6f315f400430e8704c41686d3 |
| coach_resume_tasks 的 id/answers/conversation/result | 8 | 15af16ac187eca351f6fbcbdd8b90449 |
| watcha_point_wallets | 1 | 85eaeedc085c755397fcc75efd7d4591 |
| watcha_point_transfers | 1 | d2bcb60e210fd22927e355a2a70de90b |
| watcha_point_reservations | 6 | 427b4e11537b32e2d2392dcdd8cbe18e |

暂存前正式仍 `dpl_FZGGjoTQZhMwvQ9DvJ2yWmicmKbj`（bb70d9c），原上稳 `dpl_9d3XJNTbQqBoaffrjohy4fK8fTCs`。未删任何部署。

## 发布验收

待：干净归档回归/生产构建、隔离账号真实处理记录和讨论/跳过、保存刷新、桌面/窄屏模型菜单与 Markdown、真实 PDF 文件目视与文字检查、同构建正式域回读、QA 精确清理及保护快照重核。未通过前不切正式。

技术核对参考：[Supabase JSON 条件过滤](https://supabase.com/docs/reference/javascript/using-filters)、[Vercel 同构建晋级](https://vercel.com/docs/deployments/promoting-a-deployment)。未新增数据库表/字段或认证权限。
