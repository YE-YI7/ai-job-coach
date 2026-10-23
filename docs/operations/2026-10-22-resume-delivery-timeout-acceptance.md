# 简历空响应、返修超时与最终交付验收

2026-10-22 America/Los_Angeles · Codex · 已正式发布。

## 交付结论

- 正式运行源码：`39c37f039614acaec86bbe18933dcc942af86e98`，分支 `codex/analytics-business-repair-1022`。
- 同一 Production 候选验收后 promote：`dpl_BmipCLKNe9GM4mAZVtWtL9TaLRVC` / `ai-job-coach-ewrnv60jb-velmavalienteqejimu22-jpgs-projects.vercel.app`。正式 `yizhioffer.com` inspect 回读同 ID、Ready；health 200/database ok，简历 Agent/Eval 匿名 401。
- [后台按块查看本次记录](https://yizhioffer.com/admin/evals/records?record=3ca9d426-ec58-4a0a-b628-36ba68e31cb9)：9 块、5 条真实运行、2 份实际 PDF，SQL 读回记录和摘要一致。管理员权限未扩大；未制作模拟管理员登录。
- 全量 280 套、2,771 项通过，0 失败，原有 10 项跳过不变；类型、Production 云构建通过。运行源码 GitHub [39902840488](https://github.com/YE-YI7/ai-job-coach/actions/runs/39902840488) 实际 success。

## 查出的原因与边界

1. 流式调用把只有推理、无最终正文与输出中断混为同类错误，恢复条件漏接。现分别记录 empty/incomplete/timeout、finish_reason、正文长度、是否收到推理与真实已知用量，不记录私有推理正文。
2. 返修可能花完余量，使本来已通过逐条检查的候选也随失败丢弃。现按同一 230 秒工作流预算预留最终整稿检查和提交时间；返修最多 55 秒，实际还受剩余预算约束。返修超时不自动重试。
3. 可恢复的是已通过事实和逐条价值判断、且没有对应整稿 error 的候选。恢复后仍必须重新整稿检查；全局 error、质检失败或没有可靠候选时不能保存，不能为了成功降级到只查格式。
4. 真模验收又复现格式保留与通用拆 bullet 指令冲突，以及无价值字段分隔符被当作改稿。统一最终格式约束；明确的确定性格式冲突直接退回原编辑一次，避免多花一次模型重新发现同一问题；仅改空白/字段分隔符不能交付为内容改稿。
5. 质检明确判 useful=false 的 none/format 诊断仍为拒绝，不因诊断标签触发一次昂贵协议补全；useful=true 的这些非法类别仍拒绝，未放松事实/格式/收费门槛。
6. 过滤候选后的部分交付写入任务 result，刷新不冒充完整交付。快速点采纳时不再依赖任务 GET 抢先完成：使用已保存文档的 generation，服务端仍校验本账号交付及 change ID。

历史 `48e0c423-84ca-4137-ac2d-6e3cd7d57786` 的空响应当时没有 finish_reason，不能声称其全部由 token 上限造成。`badb837e-7d1d-442d-ab19-ddaca716f757` 有 useful 候选后返修 timeout；这些是旧证据，不用新捕获内容倒填历史 I/O。原有 75 秒 draft、55 秒 review、230 秒总时限不是本轮新加的时限。

## 真实调用与验收

均为新建虚构 QA，正常邀请码登录、正式配置的站点 StepFun / step-3.7-flash；没有读取/使用本人 TokenDance 或真人积分。两个夹具为列表稿和纯文本/OCR 式提取稿，后者不是一次新的图片 OCR 上传验收。

| 样本与版本 | Trace | API 端到端 | 结论 |
| --- | --- | ---: | --- |
| A / 1f7108b | bcb1e8c3-4d21-4791-ac53-5192056ca0a6 | 75.230 秒 | 3 处列表经历修改，保存并实际采纳刷新、PDF通过 |
| B / 1f7108b | 15c0a01d-3c04-4165-a8f5-98980239d9a1 | 180.679 秒 | 编辑与格式质检冲突；协议补全后返修仅余约23秒，超时；未交付，虚构预留退回 |
| B / e2e9816 | 475ded16-320e-4f89-a719-ef6acf71c826 | 116.459 秒 | 技术上部分保存，但只有教育分隔符；未通过产品验收，保留负样本后继续修复 |
| B / 39c37f0 | 6e8d384c-7f20-49b5-bbf2-20535e9e84bd | 182.184 秒 | 3 处真实经历内容修改；过滤技能措辞，标为部分交付；保存、刷新、实际 PDF通过 |

最终修改 ID：`ai-change-1792731482884-0`、`ai-change-1792731482886-1`、`ai-change-1792731482888-2`；generation `67960ca2-3535-49ae-86a0-9473644b1e0c:11`；[完整 Agent I/O](https://yizhioffer.com/admin/evals?run=d7c7b84c-cc9b-4a93-a8ab-b1535d69e8ea)。保持协助/参与、260/105/103、实训性质和日期，不把店铺结果转为个人独立业绩。

导师真实讨论 18.300 秒，返回 discuss；NDJSON 有多段 replace，未增加 draft/review、未改代次及建议。输入区左下“其他辅导”的紧凑 Logo 模型菜单可用，选择实惠档后刷新保留。未改菜单、聊天气泡、Markdown 渲染或打印样式。

本批 14 次供应商调用（5 draft、8 review、1 conversation），含1次失败的有界返修；供应商重试为0。已知输入75,282 token、输出52,702 token，供应商实扣及美元报价未知，不按0元。最终长样本仍约3分钟，质检协议曾补全一次；小样本通过不证明所有简历/供应商都不会再超时。

## 最终交付观测

- v2 独立记录 task_started、task_outcome、result_presented、change_decided、document_persisted。
- 先 CAS 提交，再按同一所有者/代次回读；未保存、阻断、结果未确认、部分交付、完整交付分开。服务端结果不能由前端伪造，历史无记录保持未知。
- 最终浏览器真实采纳首条后，`resume_change_decided` HTTP200并读回同一 generation/change ID；保存及刷新一致。结果展示也读回同代次。
- 后台基础数据可自行选“改稿尝试、完整交付、部分交付、改稿失败、质检/保存受阻、结果未确认”；默认指标和历史结果不强改、不回填。

## 实际 PDF 与界面

使用应用原导出窗口，实际点击“保存为 PDF”，观测 beforeprint 后由同一 Chrome 打印引擎落盘；不是另做模板生成。两份均1页A4，无加密、无JavaScript；PDF文字层及Poppler逐页图检查，无裁切、重叠、空页、Markdown星号、修改标记或浏览器页眉页脚。按坐标提取确认教育→实习→项目→技能顺序，保留责任限定；不承诺所有 ATS 提取器的顺序一致。

- A：51,999 bytes，SHA256 `49951c70fb81b02f4f89c04c442616bd3dfc509bc2904205ddcb8a0781ea04c6`。
- B：69,144 bytes，SHA256 `49f9165866091ccb2469da287963644bd0a647da0409bfdef95acadb77a1c1be`。
- 本地证据在 `.impeccable/review/resume-delivery-20261022/`，PDF原件也已存后台附件；1512px和390px浏览器验证无页面错误/横向溢出。
- Impeccable按规则仅扫本次3个UI文件一次、必要变更后复核一次，0 primary；4个原有颜色advisory未扩大修复。未开启自动钩子。React局部复核无新增CSS/依赖或模型菜单变更。

## 数据保护、清理与交接

清理后与测试前排序 JSONB MD5 逐组一致：旧作答41、原机会33、原简历任务8（answers/conversation/result）、钱包1、转入1、积分预留6。没有充值、兑换、短信、用户模型或旧作答写入。

仅删除本批虚构 QA、虚构额度和邀请码；5条新测试运行已归档给现有管理员，并显式标记 synthetic。元数据观测保留为 internal，不污染真人看数。邀请码回测400，临时会话/邀请码及部署访问Cookie文件已清理；未声称删除身份会撤销所有无状态JWT。旧正式 `dpl_CRrvdA96TQ3N5wT9irwFD2Z3WuD2` 与此前稳定 `dpl_gipZwu6CowZrdJQAo5BTVGjucF9B` 保留。

主开发树14个协作者改动未触碰，diff SHA256仍为 `931b338c2579b3d5072e7d519de6f143850f73eb1190110a8a22368c72439eb5`。本轮从正式运行版本独立修复，未把Cursor未验收首页、工具栏、打印或四门入口一起上线。后续发布应沿正式源码39c37f0续接，不能用旧主开发树直接覆盖正式热修；本报告/验收脚本之后的提交不代表新的运行构建。

浏览器扩展当前不可连接，未声称已用本人 Chrome 管理员会话打开新记录；后台记录已经按真实解析器校验并数据库回读，正式匿名权限边界也实际验证。无须本人重复登录即可完成本轮修复及发布。
