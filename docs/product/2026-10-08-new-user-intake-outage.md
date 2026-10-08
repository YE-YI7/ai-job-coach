# 新用户材料整理503：定位、降级与恢复边界

## 生产根因

当前发布dpl_EyvEpRCoxuZ79hG6joLwqBcJaRm2的生产日志显示三次POST /api/opportunities/analyze失败，上游DeepSeek均返回402 Insufficient Balance，接口包装为503。站点免费用户走DeepSeek自带密钥，不是用户免费次数不足；已连接TokenPay用户走自己的授权通道，不是同一问题。未发现本轮六源或面试改动涉及此模型配置。生产环境变量名称核查只有DEEPSEEK_API_KEY，无OPENAI_API_KEY或其他站点备用密钥；没有充值或借用个人TokenPay凭据。

## 修复

站点余额耗尽时，已提取的材料可继续被接收：已明确的岗位/简历按原分类保留，未知粘贴材料进入待确认档案的来源备注，不猜公司、岗位、不将JD冒充简历。返回analysis=null、analysisDeferred=true、reasonCode=hosted_provider_quota、retryable=false；退还本次预留免费次数，不伪造模型结论，不提示用户为站点余额充值。用户自己的TokenPay恢复错误仍保留原语义，验证/读取错误不伪装为成功。

## 验收与未恢复项

新增余额错误回归及合成新账号脚本verify-intake-outage.mjs，覆盖原文接收、免费次数保留、云端保存和重新GET。测试账号不代表外部活跃用户，凭据仅在进程内，finally仅删除该合成账号及其级联记录。

这是材料接收降级修复，不是恢复真实AI整理/导师/面试。站点仍须补充DeepSeek余额或配置并验收可用站点备用模型；没有资金授权不能自动充值。新用户只交JD且公司/职位未被识别时，降级成待确认来源档案，不宣称已完整建立该岗位。完整冷启动和真实面试验收继续保持未签收。

## 已发布与实际验收

- 39f38ca代码已push开发分支和backend，独立干净快照177套1789项通过/3跳过、类型/本轮eslint/本地及云端生产构建通过；本轮未改UI，不做无关UI扫描。
- dpl_HjHfREF6LHeVtiuTFExiZm9MA8ZG production/READY，先在受保护暂存部署用合成用户执行真实接口，再promote，正式www别名ID一致。暂存与正式两次都成立：粘贴原文→200且analysis=null→免费次数仍3→云端创建→GET原文一致。测试账号删除并读回确认不存在，不消费真人账号额度，不触碰真人材料；失败日志/原始生成审计不等于外部增长。
- 首次脚本本机Node网络ECONNRESET，未完成验收；事后查询专用测试邮箱前缀无账号残留。启用Node继承既有代理后成功，不改VPN。服务器短窗两条错误日志是合成验收的上游余额402，应用返回200并明确降级，不宣称日志无错误。未做schema迁移。另补测试脚本的显式QA请求标签、测试ID及不带级联FK的生成审计清理，再跑正式域名通过。
- 回滚目标为dpl_EyvEpRCoxuZ79hG6joLwqBcJaRm2。真实AI服务仍未恢复。

## 供应商接入补核

按用户指定改为主要问主窗口、其次ASM，不再以运营窗口窄检索裁决接入。两个指定窗口找到StepFun官方API和HopBase历史接入及钥匙串配置；认证GET模型列表StepFun/HopBase Flash均200，不等于当前余额充分或结构化整理可用。私有凭据位置仅留内部交接，不写进公开仓库报告。

## 用户授权后的站点模型接入

用户明确批准使用现有StepFun接入，不再反复请求确认。新增生产环境STEPFUN_API_KEY（Sensitive，仅通过stdin）、HOSTED_LLM_PROVIDER=stepfun、HOSTED_LLM_MODEL=step-3.7-flash。没有充值，没有把密钥写进代码、仓库或日志，没有更改ASM本机实验预算。官方地址固定为https://api.stepfun.com/v1，连接TokenPay的用户继续使用自己的模型与密钥；缺Step密钥不静默切回余额耗尽的DeepSeek。

真实上游JSON生成200且成功解析；极小64-token试验出现空正文，扩大到512/1024可成功。API即使收到thinking-disabled也可能输出reasoning，所以不声称关闭推理：请求低effort、保持现有预算及正文非空校验，不向用户展示推理字段，保留失败退款与原文降级。402不再无意义重试。导师selection与实际站点模型同步，避免记录DeepSeek但实际调用Step。

verify-hosted-activation.mjs使用专用合成新用户验证真实JD识别、无简历不虚构强证据、材料存取、导师NDJSON正文与done、真实模型/用量、历史持久化和成功扣两次免费额度；结束清理自身生成审计与账号。暂存/正式验收结果以执行后追加为准；不以单元测试冒充真实面试/语音全流程。

### 本轮发布证据

- a8787cc已push backend及开发分支。隔离干净快照177套1797项通过、3跳过，tsc、本轮eslint、本地及云端生产build通过；共享工作树另有他人auth/admin变更，未混入发布。
- 本机同构生产构建真实JD整理22974ms、导师首正文23992ms/总28761ms，成功2次后免费次数3→1，整理所得JD与对话回读一致（不把LLM整理文本称为与输入逐字一致）；合成账号和自身生成审计已删除，四表核查均0。速度仍慢，不称性能问题已解决。
- 受保护暂存dpl_AdWzroapgCKnDiJgsScVSzzNyfmQ真实整理24182ms、导师总23943ms且NDJSON正文/done和历史回读通过；实际模型step-3.7-flash、491输出tokens，非stub/非analysisDeferred，免费3→1，合成账号及自身生成审计删除。该暂存检测通过Vercel curl整体读回，不能度量逐块首字时间。
- 上述部署production/READY，releaseCommit=a8787cc；promote成功且www.ai-job-coach.xin别名指向同一ID。发布前短窗error无结果，发布后真实正式验收另记。回滚目标是上一版dpl_HjHfREF6LHeVtiuTFExiZm9MA8ZG（仅原文降级，站点模型仍不可用），不是有真实AI能力的备用版。
- 正式www新用户复验通过：真实JD分析17752ms（analysis非null、非deferred）、导师首正文15597ms/总20433ms，实际step-3.7-flash/407输出tokens，NDJSON正文/done及云端历史回读通过，成功两次免费3→1。账号及自身生成审计删除。脚本早期输出字段originalMaterialPersisted实际只比较“整理后JD→保存→GET”，已订正为analyzedJdPersisted；不宣称模型整理与原始输入逐字相等。模型恢复与页面/语音/完整面试/完整PRD验收是不同门禁，本轮没有冒签后者。
