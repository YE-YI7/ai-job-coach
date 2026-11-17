# 递进面试设置发布与语音排查

本人明确认可并要求上线：「可以，挺不错的，上线了。」同轮问开始模拟后点语音立即报“语音识别未完成”的原因；后续明确允许一次短暂麦克风测试，已告知可能由浏览器语音服务处理，不提交回答/点评。

## 发布范围和基线

仅获准的轮次→视角/题数→摘要/原开始交互。默认开启，保留原状态所有权、确认不启动、回改不清选择、当前设置捷径；两侧/其他tab/模型/数据/额度/收费不变。开发对照路由仍production404。首次出题未接几面强度的旧问题不在本次修改范围。

发布前正式已重新查为`dpl_BQXc7sCoqPaoEBJKArDqhVGry3cp`，代码`4f0c2ea`。独立checkout HEAD175106e仅比它多上轮发布文档；不从共享脏树或远端main（1639fa3旧的首页版本）覆盖正式。项目`prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`，team`team_7qIutahimwnjCje1fOtQEPyT`已由CLI项目检查核同。

## 语音现场和边界

- 本人当前页面是本地3422示例面试，不是正式域名。
- 读取真实报错现场后，经本人允许短测：在VoiceControls真实onerror回调断点读得`e.error === "network"`，message空。随后立即移除断点、恢复并关闭Debugger；无代码注入、无语音转写/回答提交、无新增点评/模型调用。
- 按钮点击确实调用浏览器SpeechRecognition.start；本地和当前正式使用同一VoiceControls，非demo假错误或本轮设置交互引入。现有处理仅单独说明not-allowed和no-speech，其余统称“语音识别未完成”。因此该文案不能区分网络、采音、取消和服务不可用。
- network证明本次识别服务连接失败，不证明整机断网，也不能区分代理、上游语音服务或内嵌浏览器集成原因。没有证据指向答题模型或益职服务器故障；不声称正式语音已通过或全体用户都会失败。
- 官方接口说明：<https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition>（部分浏览器默认使用服务器识别）；错误类型：<https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error>。
- 本轮用户只要求排查语音，未更换语音服务、环境、网络或权限，也未混入语音修复发布。
- 对照普通Chrome，同机本地3430的同组件确实进入“正在听写”、按钮变停止；短暂后主动停止回空闲，无通用错误。没有有效转写文本，不冒完整语音识别验收。这支持当前内嵌浏览器链路问题，而非localhost天然不能录音；尚不能定位上游或代理的具体根因。两次识别启动均在本人明确允许的短暂本地排查范围，无正式麦克风调用。

## 验证与待发状态

本轮正式默认开启后全仓410套3729条、类型、局部ESLint及diff检查通过；9套31条既有条件跳过。原本地状态/390截图证据见根design-qa与preview交接；不会拿测试通过代替正式页面核验。将从限定提交导出干净包、核对归档、production skip-domain→校验→重新确认别名未变→同包promote。完成后追加实际回执。当前段落不是已上线声明。

## 实际正式回执

- 代码`b33da910eb4b35de3fdb741ed5a3c457b4611e3b`，仅本任务13个文件，已push同分支并ls-remote核同。共2144 Gitblob导出到干净临时目录逐一核同；两段出题/复盘业务回调与4f0c2ea字节相同，VoiceControls全文也相同。没有私有环境文件进归档。
- 同项目cloud production构建通过：Next编译、TypeScript、146页生成；保留既有middleware/preferredRegion弃用警告，不扩大修复。待发`dpl_4z6eVnahAfFPsWvDp1Rb93ztavWe` READY，URL`https://ai-job-coach-6wd9kyobc-velmavalienteqejimu22-jpgs-projects.vercel.app`。完整resumeRuntime与原基线逐字段核同、3页面/5静态资源/4匿名401及开发入口匿名重定向核过。
- promote前分别确认apex/www仍BQXc7，才提升同一个production包，不重建。UTC2026-11-17T15:21:50/52两域检查均指向4z6eV；各自重复健康/runtime、页面/资源/匿名权限检查通过。
- 普通Chrome现有登录态新开正式页，实际走二面→项目深挖/5→确认摘要→回改，选择仍保留。没有点击正式开始、提交答案/导师草稿或生成报告，无新模型费；14岗位、既有未发导师草稿与所选模型恢复可见。左右x/width/font/background与发布前逐值相同（192/386.265625）。真实账号开发preview入口404核过。原有页面访问埋点可能写入，不冒全环境零写入。
- 新部署短窗error与5xx查询均0行（回溯参数10m，不代表新部署已有10m流量，更非长期稳定保证）。未新增drain/告警。
- 回滚点：`dpl_BQXc7sCoqPaoEBJKArDqhVGry3cp` / `ai-job-coach-ppq0zrnim-velmavalienteqejimu22-jpgs-projects.vercel.app`。回滚前须重查当前域名，避免覆盖别人的后续发布。

正式入口：<https://yizhioffer.com/cockpit?tab=interview>。私证同release上级：progressive-source-parity.json、progressive-staged-check.json、progressive-live-{apex,www}-check.json、progressive-{apex,www}-deployment.json、progressive-promote.log、progressive-live-focus.jpg、progressive-live-ready.jpg、progressive-rails-{before,after}.json、voice-diagnostic.json及voice-local-error.jpg。真实截图/声音/私有环境不入Git；未保存声音。ME共享状态局部追加，不整文件提交其他窗口内容。
