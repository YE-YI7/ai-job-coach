# F6 v24：公开查询与链接由作者选择

## 授权与修改范围

本人上一轮明确要求先讨论、不要直接改代码，因此先完成32项限制盘点；本轮追问“为啥不改代码，我都说出来问题了”后，按最新授权实施已指出的搜索接入问题。没有将此授权扩大为删除全部限制或重做其他组件。

本轮只修两项：生产 `search` 从四个预设topic改为作者自写公开query；`fetch` 可直接读用户提供、页面发现或搜索返回的安全公开HTTPS链接，不再要求先进入本轮搜索索引。同时修正管理员工具验收入口，避免继续验旧实验菜单却报告新工具通过。

保留F6/B05、作者模型选择、五工具名称、自主工具调用、原独立HR及其时机、Memory/资料编译、保存/CAS、人工确认、计费、12次作者/4次公网/1次HR上限。无UI、Auth、RLS、SQL或迁移变更；旧作答、个人钱包与积分别动。

## 代码与接入

- `647fdd2`：生产工具schema、描述、执行器和本地外发隐私检查一起修改，不只是给system追加一句提醒。
- `25b8559`：管理员验证切到真实生产工具合同，补原稿私密片段保护回归；本次发布固定此提交。
- `f6-output-channels.ts`：生产search接收query而非topic；fetch说明直接公开链接可用。冻结 `f6-origin.json` 不改。
- `f6-public-tools.ts`：query原样发往同一keyless Exa MCP，不加公司前缀/英文模板；公司域名仅用于来源归属。保留原请求数、超时和无付费兜底。
- `f6-public-research-privacy.ts`：外发前本地检查联系方式、已知姓名、常见凭据及复制的长私密片段，检查HTTPS/URL凭据/IP等；不增加隐私判断模型或模型费用。80个规范化字符的重合窗口用于外发隐私提示，不是简历写作长度限制。属于尽力防护，不能保证识别所有语义秘密或宣称完成网络安全认证。
- `f6-tool-session.ts` / `resume-f6-writer.ts`：当前稿、原始材料及事实只用于本地外发检查；外部搜索参数不包含私有材料。注入测试服务也经过同样检查。旧topic调用给明确错误，不静默转成预设query。
- `f6-origin-research.ts`：旧四主题只保留在明确的冻结实验适配器，正常产品mentor-enabled F6不使用它。保留实验来源不等于生产仍限制四主题。
- `f6-runtime-verification.ts`：使用生产session，先直接fetch再发自由query，回执区分生产tools和冻结originTools；没有新增作者/HR调用。

## 已实际验证

1. 最新全量Jest：381 suites / 3515 tests通过，9 suites / 25 tests按既有条件跳过，0失败。初次回归发现一条旧预算夹具仍发topic，已改成真实query，预算断言未放宽。
2. `tsc --noEmit`、定向ESLint、`git diff --check`、本地production build通过。
3. 本地真实生产session匿名请求：先直接读取Anthropic公开工具设计文章，再原样搜索 `Harvard career services resume accomplishments evidence`，无公司名、不属于旧四主题，获得4条真实来源。2次公网请求，1646ms，0作者/HR模型调用、0新增模型费、0数据库写入。
4. 同一session先尝试虚构联系方式查询，在外发前拒绝，网络计数仍0。另有测试覆盖原稿私密段落、编码URL、非互联网查询、公共技术短语不误拦、直接读取、四次共用预算以及作者fetch→search→写稿→原HR的接线。
5. 管理员工具验证单测检查真实产品schema及先fetch后search，不再拿旧origin工具假作生产验收。该管理员端点未宣称线上执行过。

真实公开请求发生在首个功能提交前的工作区候选，原回执保留 `uncommittedCandidate:true`，不改写为提交后的执行。后续提交未改变该实际请求的核心工具实现；源归档另外逐blob核对。

## 发布状态

已发布：固定提交 `25b8559` 的2040个tracked文件逐blob核同，归档不含QA回放instrumentation、预算拦截或导出的环境密钥。干净production构建READY后，先验证候选完整runtime与虚构QA原状态，再确认正式仍是v23，最后promote该候选；没有用工作区的未提交历史报告作发布源。

- 最终部署：`dpl_Fw3eodpLpxb3Pins6tTJ1QJ31SZd`，固定地址 `https://ai-job-coach-gulwiyuv5-velmavalienteqejimu22-jpgs-projects.vercel.app`。
- 正式地址：`https://yizhioffer.com`。2026-11-12 00:45:32 UTC（当地11月11日16:45）完整runtime逐字段与源码相等；www规范跳转后同。Vercel inspect确认正式域名指向最终部署。
- 候选与正式均只读核验原QA简历、已保存成稿、采纳记录、answers和conversation逐字不变，匿名任务读取401，岗位列表未越出QA账号范围。没有新建/修改用户、简历、作答、钱包或积分。
- 本次部署近10分钟error日志查询无返回；仅表示该次查询窗口未见error记录，不代表已做长时间流量或模型质量验收。

- runtime：`f6-origin-runtime-v24-autonomous-public-research`，新增 `publicResearch=author_queries_and_public_urls_local_privacy_checks`。
- 原system SHA：`93be16d69b9ba62fc28de3cf63bbad2fabfbdc8a16be053a694e0be0099775c4`；冻结origin工具SHA：`a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d`。生产工具SHA随search/fetch合同改变，HR及导师策略不变。
- 回滚目标为上一正式v23：`dpl_8Ac4cruFa2REijExGSBmbQkEQpTZ` / 源 `e343ed7`，只回滚部署，不回滚用户数据。
- 首个647fdd2候选 `dpl_GraDYEo1W2MWr2FgsHjnfUhDv2WJ` 未切正式，因管理员验证仍用旧菜单而被后续25b8559候选取代，不能把前者当最终发布。

私有原始证据：`/Users/yi/Documents/Codex/yizhi-f6-v24-research-20261111-jBXDtX/`，含全部测试结果、匿名公共请求回执、固定提交源一致性、部署和只读HTTP回执。报告只记录无凭据信息，不提交Cookie、私有会话或原始用户资料。

## 未证明、未更改

这轮证明查询和链接能够按新合同实际执行，不证明模型必定主动搜索或新成稿一定优秀。未新调用收费模型、未改旧预算、不以工具请求成功替代语义验收。没有重做Memory自主发现、全部知识库检索、HR轮次、存稿/终稿意图或PDF版式；没有新原生PDF导出或UI验收。现有相关PDF/保存测试属于回归，不冒充真实新稿端到端验收。
