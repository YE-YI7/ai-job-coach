# 国内招聘源核验与滴滴发布 · 2026-10-14

## 本轮变更

正式发布工作树此前仍为七源，另一协作分支的滴滴提交 `a62377e` 尚未进入这条正式发布链。本轮只迁入其已审查的小范围适配器与相关测试，不合并协作工作树的认证、支付、管理后台或其他未提交修改。

对照当前官方社招入口 `https://talent.didiglobal.com/social/neit`，公开脚本 `recruit-portal-social-pc.B08liQMu.js` 实际调用 `/recruit-portal-service/api/job/front/list`，关键词参数为 `jobName`。匿名“产品”列表返回业务 code0、total580、第一页40条；“物流”返回 code0、total40，返回ID和内容不同。原页 `https://talent.didiglobal.com/social/jobDetail?jdId=66749` HTTP200，匿名 `/recruit-portal-service/api/job/front/view/66749` 的岗位编号 JR2026101000E、标题、北京地点与列表一致，jdStatus2。详情字段与列表字段不同，完整职责与任职要求使用列表正文，不把页面200当成完整JD取数证明。

补齐迁入代码的两项边界：保留原始地点（含国外选项）、原岗位编号供引用核验；去标签后没有实际职责/要求的条目丢弃。只收国内地点候选，仍保留海外业务职责及英语等门槛原文，不因国内地点抹去岗位的其他条件。不收录招聘联系人字段。官网社招入口不作为自动认证所有岗位招聘类型的证据，校园/实习资格按原文门槛判断。

每次关键词每源至多一页40条、HTTPS白名单、禁止跳转、12秒超时、全局并发3、显式失败与调用计数不变。国内源数8，公开搜索另有最多3次，discover总调用上限相应为11。缓存版本升为 cn-official-v6-eight-sources；旧结果仅提示重搜，不刷新自动执行付费评审。

## 实测

- 八源匿名公开烟测：腾讯40、网易40、百度20、美团38、京东应届5、快手校招/实习40、小米38、滴滴40；8次请求、0失败、0截断，共261条原始候选，5736ms。
- 滴滴关键词对照：产品40、物流38个国内候选，物流中35个ID不在产品批次；原页/职责/要求/无伪造发布日期断言通过。
- 小米关键词对照：产品38、物流37，物流37个ID不同；汽车/硬件业务断言通过。
- 三项 opt-in 来源实测通过；来源与discover等21套235项回归通过，3项显式live跳过。完整212套2103项回归通过，7项显式live跳过；类型检查通过。
- 非互联网复核：比亚迪官方社招质量查询 code0、total1，深圳主任感知质量工程师 ID2054491604131110913；同编号详情 code0，职责及任职要求可读，发布日期仍null。比亚迪仍为研究源；未将关联职位正文合并，也未接入运行时，详情扇出预算仍待实现。

候选数不等于推荐数。简历、专业方向、国内地点、年限/学历/校园等硬门槛、原文引用、核验与少量展示均沿用现有流程；没有真实用户付费推荐或模型调用，没有用户资料、旧作答、余额和充值变更。字节、阿里、小红书、B站仍未新增直连验收；不称全部大厂或全行业已接通。

## 发布验收

发布前正式版本为 dpl_H3YGTCd5n8jaTpiPV6nwVyjCvunk，保留为回滚目标。

- 运行时提交 `4aa09a7e8626a607504006e3b7520678786df76e`，7个本任务文件；普通push到 codex/resume-original-first，ls-remote确认相同SHA。没有UI改动，不运行UI扫描。另一任务的Chrome连接诊断文档留在原工作树，不纳入本任务提交。
- 从该提交 git archive 生成独立发布快照 `/private/tmp/yizhi-didi-release.ndQHnu`，不带脏工作树内容、Cookie或密钥。两边适配器 SHA256 均为 `67ec3d30a00c1de20e76d252fbc165c1bd663eb44c7ad5396fcb6cfc65e17883`，确认Chrome诊断文档不存在于快照。复用既有项目连接文件，核验项目 prj_fav7gQZKEEE2JO3b8v9S9leeRhkS、既有团队、Node22，未重新链接项目。
- production skip-domain 云构建成功、TypeScript通过；候选 dpl_BXKGjf6dm8kincjGDV7BTnzgwoYn READY。候选首页200、health `{ok:true,database:ok}`、匿名搜岗POST401。匿名 /cockpit/preview 按现有认证规则307到登录页，不误报预览UI验收成功，也不改认证规则。
- 验候选后 promote 同一构建。分别 inspect www.ai-job-coach.xin 和 ai-job-coach.xin 均指向 dpl_BXKGjf6dm8kincjGDV7BTnzgwoYn / READY。www健康200，裸域按当前配置307到www后健康200；正式首页含益职，匿名搜岗POST401。新部署最近5分钟error日志0条，仅代表短窗。
- 没有新环境变量、数据库迁移或用户数据写入。没有运行会触发真实模型评审的旧验收脚本，未签收云端逐源或真人收费推荐端到端；本轮来源签收是本机匿名公开请求加已核验正式发布，不扩大这两类证据的含义。
