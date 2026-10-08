# 修复版正式发布 · 2026-10-08

用户授权：修复然后上线。发布的是已修复的代码版本，不代表PRD所有内容评测、手机、语音或真人小试点已签收。

## 发布结果

- 正式网址：https://www.ai-job-coach.xin/
- Project：ai-job-coach / prj_fav7gQZKEEE2JO3b8v9S9leeRhkS；Team：team_7qIutahimwnjCje1fOtQEPyT。
- 代码：576f9d3（成果和岗位决定修复）、136445a（收尾守卫）、3d67556678a94e6305b7d40edfbf17bba2ed8f69（站点额度失败分流），已推 GitHub backend 及 codex/agent-distribution。
- Deployment：dpl_BhsiG1YKq8ZRx9ANXU9mCgE9SnAg，production，READY，实际 promote 成功。构建来自干净提交快照，未包含他人的auth/admin工作树改动。
- www域名API核验 deploymentId 与上述ID一致；首页200且实际产品正文成立，非www 307到www。两个私有新增接口未登录均401，不是占位页200。
- 可回滚到上一正式版本 dpl_6fE9qrEqBcxNZSBHJ2q3vX3DZjdn；本轮增量数据库迁移与旧版兼容，无需破坏性撤库。

## 修复与验证

此前F1–F7修复详见 `2026-10-08-qoder-release-acceptance.md` 第六节。本轮补充：

1. 用户明确收尾时，最终回复由已核验状态控制，不再追问“懂了是什么意思”、强制迁移或误报掌握；原模型收尾文本不会在流式阶段闪出。没有改动正常讲解与作答反馈，也不增加额外模型调用。
2. RAG教学加入召回率／精确率的分子分母核算口径，不能把找回的无关条目计入相关条数；该提示不是模型事实正确性的全局保证。
3. 自带模型服务余额不足与用户TokenPay余额不足分开说明，不泄露上游请求ID、不自动重试余额不足请求。

干净快照：174套通过、1套跳过；1771项通过、2项跳过；tsc通过；production build成功；本轮改动lint通过。没有新增UI文件改动，不重复运行UI扫描；上一轮UI已按约定手动检查，自动钩子保持关闭。

## 真实部署HTTP与数据库

使用十分钟有效的合成QA会话和两条新建QA用户记录，仅调用免费持久化接口，不使用真人账号、不改额度、不调用AI：

- 成果首次保存200，修改保存200；两次返回同一笔记ID，version从1升2。
- 重新GET 200，读到version2和第二次修改的原文。
- 旧version1试图覆盖，409，未覆盖已保存稿。
- 岗位决定POST/GET均200，batchRunId和材料指纹保持一致；伪造批次成员400。
- 匿名成果接口401；公开工具页面Ready后200，含实际益职页面文本。

构建未就绪时收到的占位HTML不算验收，以上均在Ready后重测。QA完成后删除本轮两个合成用户并回查用户／turn／成果笔记／决定／run残留均0，临时Cookie头文件已删除；没有删除真实用户数据。

发布后对该deployment最近10分钟的error级日志查询为0条；没有配置log drain。这只是短窗检查，不是长期无故障或增长效果证明。

## 剩余边界

- 新一轮真模型请求被站点自带DeepSeek的Insufficient Balance拒绝，未伪报成功，没有擅自充值或反复消耗请求。未连接TokenPay用户的AI服务需要站点账户所有者补充余额；已连接用户代码仍走其自有凭据，但本轮没有复验该模型账号。
- 浏览器控制连接仍超时，未新签收实际手机／语音／长简历PDF完整流程。25项人工内容校准和8条整套E2E仍未完成，不修改quality baseline为publishable=true。
- 早前模型冒烟有事实解释波动；本轮守卫防止假成果和强迫继续，不声称消除了所有模型幻觉。发布是用户要求下的修复上线，不是把未通过门禁改名为通过。
