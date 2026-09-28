# 2026-09-28 建档阻塞与结果埋点

## 范围与证据

只针对周度分析发现的建档422、结果不可观察、统计事件口径不一致。9月27日一个账号7次422是观测事实，不声称已找回当时的模型原始输出。未修改布局、未修改用户数据或数据库结构。

## 实现

- 模型分类缺公司/岗位/JD时，保留已提取原文，返回待确认准备档案、analysis:null、classification_incomplete及缺失字段；退还本次分析额度。不伪造岗位或匹配结论。
- 未知材料放profileText，不擅自当简历；已明确简历/已有岗位补材料按原类型保留。单独传结构化简历不再必须同时带sourceText。模型识别为简历时优先原始文本，不用模型改写覆盖原文。
- 导入开始/失败/待分析/完成带request_id，网络与JSON解析失败也记录；workspace_saved仅在云端返回成功后上报，completed仍带synced区分本地。
- 预览成功与打印请求分开：resume_preview_ready、resume_preview_failed、resume_print_requested。浏览器打印无法确认最终保存，绝不报PDF下载成功。
- coach_response_received/failed记录浏览器消费响应结果、stream_read_ms、服务端已有firstTextMs/generationDoneMs。stream_read_ms不含HTTP响应头之前的等待，也不是完整端到端耗时。未上传对话正文。
- 埋点故障不阻止主业务。服务端根据ANALYTICS_INTERNAL_USER_IDS显式名单添加account_cohort；未配置为unclassified，不猜测账号身份。
- ops:funnel兼容新旧面试完成事件，输出新增结果事件与匿名/内部数量；缺失来源为unknown。保留小样本、非严格顺序漏斗、历史无埋点的边界说明。

## 验证与边界

- 回归包含：不完整模型分类、未知文件原文保留、结构化简历独立建档、简历补充不清空原岗位、模型不能改写简历源、断流不报成功、遥测不含正文、打印预览不冒充下载、内部名单。
- TypeScript、全量Jest及production build通过；ESLint无错误，CockpitApp仍有2条既有未使用函数warning。
- 手动Impeccable detect检查本次两个组件：0主要问题；自动钩子未开启。此次仅业务逻辑及埋点，没有布局改动。
- 未使用真实用户凭据重放历史上传，未运行计费模型实测；不宣称历史输入的唯一根因已还原。
- 内部账号名单待用户确认。遥测依赖浏览器发送，不取代数据库快照核验；无法回补历史PDF保存行为。
- AgentConversation.tsx开工前已有未提交修改，不纳入本次提交或发布。

## 发布

提交后仅部署本次提交的干净源文件；正式部署状态另行核验，不以本地build代表上线。
