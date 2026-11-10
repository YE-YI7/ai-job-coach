# F6 v11：新旧稿定位与事实来源分离

2026-11-10 · Codex。本人的“你能搞定不”按继续修复执行，不再交一份原因分析让本人介入。本轮只修已确定的接续工程缺陷；不追加模型费、不切正式站、不改旧作答或个人积分。

## 从原始失败到修复

原接续 Eval/Trace `a07cdda3-f912-433c-a585-6ba3ef6d94fc` 的模型原输出是 revise，用户引文真实，但 sourceExcerpt 引了当前 AI 稿的段落。旧代码只在原稿找这个句子，找不到就自作主张改成 discuss，要求用户再说明项目。原稿、当前稿与导师问题并没有漏传。

这次将职责分开：

- **证据**：用户 turnId + 逐字 quote；原稿仍是原材料核源。AI 草稿、导师举例、修改要求仍不能成为个人经历。
- **位置**：target 指明 resume/currentDraft 及该文档的引文；程序沿编辑器既有修改坐标映射回原稿，而不是做语义猜测。模型不用抄版本号、坐标、修改ID。
- **版本**：服务端记录原稿 SHA、当前投影 SHA、source revision、generation ID、实际范围与修改 ID；保存回复和启动原编辑前各核对一次。拒绝、手写或换代后旧位置不能覆盖当前稿。
- **错误归属**：非空但无法定位的引文是交接故障，走原有保留消息/未改稿/故障退款路径，不再伪装成“用户没讲清项目”。真正空归属的旧自述分支仍可讨论补问；新协议由导师自行判断 discuss，不写死组件顺序。

没有删除来源校验、强制新增事实、塞人工成稿、新增 Agent、HR 格式解析器或固定改稿流程。原 F6/B05、作者、HR、五工具、上游调用上限、模型选择和原计费包装不变。

## 实现位置

- `resume-conversation-location.ts`：确定性位置映射；只用 `resolveResumeEdits` 与同源完整投影。定位允许 PDF 空白/全半角归一化，但不做语义相似度猜测；多处重复引文不选第一处。
- `resume-conversation-decision.ts`：替换有冲突的事实/定位说明与输出字段；只修改交接协议，保持旧 Trace 的 sourceExcerpt 兼容。映射所得 sourceExcerpt 仍是原稿实际字节；location 单独标记非事实。
- `resume-conversation.ts`：把这次实际打开的修改记录/版本/任务传给解释层，不能仅把完整稿发给模型却不给结果消费者。
- `resume-task.ts`：保存和领编辑租约前复核坐标身份；新 location 附在私有编辑上下文，用户 quote 独立存入原事实链。已消费消息幂等返回，不能因后续新稿使其重新启动。
- `resume-task-types.ts`：可选 editLocation，只是编辑上下文，不改变事实声明类型。
- `f6-runtime-contract.ts`：候选身份 `f6-origin-runtime-v11-versioned-conversation-location`，可区分本地候选和未部署的旧构建。

无需数据库迁移；兼容旧任务/旧作答，未批量重写任何数据。

## 零费用证据

永久夹具 `__fixtures__/resume-conversation-current-draft-anchor.json` 来自本轮虚构简历的实际存档，不是人工拟一份更容易通过的输出。私有 `original-output-replay.json` 对同一字节的 rawDecision 分别执行：

- 旧 b9d9cf6 真实代码：discuss / 泛问归属。
- 当前代码：revise，保留同一用户引文；当前稿目标映射回原稿455字符的既有修改范围，并保留更精确的当前引文位置。没有将这455字符或AI新句作为用户自述。

真实路由与 FakeDb 集成测试：同一模型原输出 → 保存回复 → 原编辑租约 → 真实 worker 输入 → 原事实持久化 → 刷新/幂等。断言事实表只写逐字用户 quote、source_kind=user_statement、self_reported；AI 草稿目标不进入 claim。编辑生成回调仍是测试替身，**这不是新模型已写出合格返修稿**。

其他覆盖：显式原稿/当前稿目标、旧协议回放、跨多个修改、删除后坐标、PDF换行、长稿、重复句、重叠投影、假用户引用、错误文档、未知位置、拒绝/手写/换代/换源后失效、JSONB键序、保存前与领租约前的迟到结果、已消费消息幂等、账号隔离、故障退款、真人旧作答/钱包/额度夹具不变。v9原稿引文错归用户的老坏例仍通过原修复回放，未知主张仍拒绝。

## 检查

- 新增26条：位置19条、v10真实输出接续7条。
- 最终相关8套96条通过。
- 全量369套3436条通过，7套15条条件跳过，0失败；原始 JSON 保留。
- `tsc --noEmit`、本次10个TS文件定向ESLint、`git diff --check` 通过。
- 最终生产构建退出0；只有原 Next middleware/preferredRegion 弃用告警，没有为本任务改框架配置。
- 与 b9d9cf6 比对6个核心源SHA：f6-origin.json、f6-accepted.json、f6-mentor-guidance.ts、resume-f6-writer.ts、f6-tool-session.ts、f6-hr-review.ts 均同。没有悄悄换 F6 或放松 HR。

私有机械证据 `/Users/yi/Documents/Codex/yizhi-f6-location-repair-20261110-VGB1Bb/`，包括 `original-output-replay.json`、`full-tests-final.json` 与检查回执。不含新密钥，不上传新的个人材料。

## 明确未验与未解决

本轮0新模型调用、0新费用、0云端用户数据写入、0部署/推送、无UI修改；因此没有Impeccable UI扫描。上一轮¥0.165783账本继续封账，原失败Eval不改成成功，不造一条新模型成功Trace。

定位断点已经由同一真实输出与路由回放证明可接到编辑入口；但新的主作者返修结果、HR能否抓住职责夸大/学历遗漏/离线与灰度混接、实际云端保存刷新与PDF均未重测。上轮这些质量问题仍属未通过，不能用3436条机械测试宣称简历质量合格，更不能据此悄悄上线。

下一步若继续真实试跑，仍用自然用户回答，不从内部Trace提示作者；先明确新的受控费用许可，再只跑验证该分支需要的一轮。用户不需要再设计接线、填密钥或替我们定位代码。
