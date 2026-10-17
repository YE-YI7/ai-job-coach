# 简历工作区正式 Chrome 验收 · 2026-10-17

## 运行版本

- URL：https://www.ai-job-coach.xin/cockpit
- Target：production；Status：READY。
- Runtime commit：`16295dac0c2a51eb16936a47d1effab6bd23d594`，已推 `codex/resume-detail-polish-1017`。
- Deployment：`dpl_96cniG51aRtvWw9JbLxqCriearob`。
- Candidate：https://ai-job-coach-uhho8yx9z-velmavalienteqejimu22-jpgs-projects.vercel.app
- Framework：Next.js 16.3.0 / webpack；buildingAt→ready：104.447 秒。

以本提交的干净 Git archive 构建，没有带入未跟踪的 `.impeccable/review/qisi-20261017/`。暂存地址有 Vercel Authentication，使用现有授权 `vercel curl` 核实健康数据库 ok、应用返回未认证；未关闭保护或读取凭证。核对正式仍为上一运行提交后 promote 同一 production 构建，没有重建。www 和裸域 API 都指向上方同一 deployment/commit/READY；正式健康 200、database ok，匿名 resume-agent 401。

## 真实 Chrome 验收

使用独立 Google Chrome（headless channel chrome），通过正常登录入口进入一次性免费 QA 身份；不是用户已有 Chrome Cookie、不是伪造会话。只有一份明示虚构的“陈知远（虚构验收材料）”准备档案，无 JD、不调用模型、不充值、不改变额度。浏览器失败拦截只作用于该 QA page、该机会的 PATCH，不影响正式用户。

1. **原位改标题 → 保存 → 刷新**：在纸面输入“工作经历与产出”，点保存标题，等待“已保存到工作区”，正式刷新后同标题恢复。iframe 仍为 `allow-same-origin`。
2. **真实云保存的失败与重试**：给 QA 段落加一条明示测试文字，仅该机会 PATCH 受控返回一次 503。页面显示“云端保存失败”和“重试保存”，文字仍可见。用同账号正常 GET 回读，云端尚无测试文字，证明不是先保存再伪造失败。移除拦截，点重试保存，等云端成功回执；刷新后新段落恢复。
3. **实际 PDF**：打开一段编辑器，输入但不保存另一测试标题；点真实“导出 PDF”打开正文窗口，再点“保存为 PDF”，`beforeprint` 事件为 1。用该 Chrome 打印引擎写出文件，非另造简历渲染器。输出没有原位编辑器、编辑按钮、拖柄或变更标记；已保存标题和重试段落存在，未保存输入不存在。
4. **文字与视觉**：pdfinfo：1 页、594.96×841.92pt（A4）、42327 bytes；PyMuPDF 可解析 268 字符，命中保存后的标题/段落且排除未保存输入。逐页重渲染看过，姓名、独立联系方式、正文、分节与右侧日期没有截断、重叠或空白页。此为短简历单模板样本，不声称任意长简历/所有模板都一页。
5. 本轮正式页 `pageerror` 为 0。受控客户端 503 是故障注入，不算正式服务自然报错。

证据：[正式工作区](evidence/2026-10-17-resume-craft/production-desktop.png)、[保存失败](evidence/2026-10-17-resume-craft/production-save-failure.png)、[实际 PDF](evidence/2026-10-17-resume-craft/production-resume.pdf)、[PDF 重渲染](evidence/2026-10-17-resume-craft/production-pdf-render.png)。全部为虚构材料。

## 数据保护与清理

全过程旧 `interview_answers` 只读取聚合校验，不读正文。起始与清理后均为 41 条、整行聚合 MD5 `9e144836009b5eb9bfe09dec0ac90d32`。没有写入旧作答、真人简历或余额。

QA 机会通过正常 DELETE 清理，随后正常退出。只删除本轮精确 ID 与测试邮箱匹配的 public/auth 用户、一次性 invite；四项回读均为 0。删除的是虚构验收记录，可按本轮测试材料重新创建，不是删除真人历史。未生成 QA 模型调用或收费记录。

## 复核与限制

本地 8 项真实 Chrome 回放及 2297 项自动测试见 [实现记录](2026-10-17-resume-craft-implementation.md)。独立 finish review 的草稿丢失、确认焦点、输入焦点框三项经过修复；最终仅剩的跨视图恢复后回焦项定点评分 resolved。文档同步了实际原位编辑，但没有把检测/评审当作用户审美认可。

- 本次没有改变 Agent 改稿规则或跑新的真实模型质量样本；旧模型质量与长期上游稳定性不扩大签收。
- 未保存的输入仅跨当前会话视图保留；刷新前要点段落保存并等待云端回执。不声称后台自动保存任意输入。
- 近 5 分钟该部署 error 查询未返回条目；项目 drains 0。只代表短窗检查，不代表长期监控或所有流程健康。
- 既有 middleware/preferredRegion 弃用警告、历史设计令牌漂移、招聘源及额度上游待办不扩大修复。
