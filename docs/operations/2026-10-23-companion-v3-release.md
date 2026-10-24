# 2026-10-23 求职陪伴 v3：修后真实验收与发布

状态：已正式上线同一已测构建CgN3，运行代码32ba8d4（7746592+32ba8d4），GitHub 40063445573两项作业均success。
[正式发布补充记录](https://yizhioffer.com/admin/evals/records?record=2e68f64c-7116-479d-9ac4-55b8c2a1fb21)。下文候选段是发布前原记录，不能当成最新状态。
## 范围
本人本轮授权最多再跑2次虚构模型。实际恰好2次、0重试，不使用真人简历或TokenDance，不发短信。
从当前正式0e8b85e的生产代码（e768cb7仅多3份已提交文档）择取陪伴功能，不从旧9a7共享工作树整树发布。
保留OCR/实质内容/超时/收费修复、62条历史迁移、成本缓存埋点、原模型选择/Markdown/真实渐进聊天及正式打印；不夹带共享首页/工具栏/打印在途。

## 真实模型与可直接查看的后台
[Eval：输入输出、原因、关联和实际PDF](https://yizhioffer.com/admin/evals/records?record=db21dc7b-c805-45ac-a4c6-7201ddb6dfbe)。
实际落库并语义回读相同，共7块、1份实际PDF，192014字节；不是只存在本地报告。
本轮是导师陪伴，不伪造简历Trace ID。以userId/requestId定位私有learning_trace，实际turn/plan/submission与手动简历修改ID均在归档。

| 场景 | request ID | 模型耗时/请求墙钟 | 输入/输出tokens | 结果 |
| --- | --- | --- | --- | --- |
| 修后首次安排 | 273ebcaa-3b6a-42d2-9ad4-216127f0951e | 28.085s / 48.423s | 2571 / 3096 | v3合法结构；保留AI PM目标、6小时/周、8周；路线与一项当前产物保存，虚构数字不再当用户事实 |
| 单问接续 | 8a1a26aa-1f01-4ee2-8db2-a5b6463f70aa | 27.725s / 44.745s | 5151 / 2635 | 先给固定字段可用普通表格规则的条件判断，仅一个关键问题；不重复问时间、不假定联系人 |

QA user 8c2736e2-397d-4a71-aabb-67c1c470bb94，session 7191daf1-3c73-47c6-a34a-e88157299f1a，plan f606c1c9-67b2-4083-a96a-4102320a2ffe。
两轮最终回复GET回读逐字相同；11/11次渐进文本更新。实际供应商台账2条success、0其他调用与重试。
缓存命中576tokens；成本埋点合计约USD0.00780885（按参考汇率7.2约CNY0.05622），有日期价格参考，不是供应商实扣账单。不同输入不据此宣称提速比例或P95。
此前v1/v2失败归档不覆盖；本轮只代表两项针对性验收，不宣称所有背景均通过。

## 保存、刷新、PDF与恢复
虚构简历走save_only免费保存，不调用改稿；局部手改bullet后保存、刷新、Chrome再次正常邀请码登录都恢复。
手动修改ID manual-9319b6d8-6cdc-4346-b313-f15a8a33be3a，机会4a2a7e8b-09ca-4a64-89a7-ec5a0a90fdcc。
实际Chrome打印窗口保存PDF：A4一页、55875字节、Skia/PDF m155、2026-10-23 21:33:43 PDT。
SHA256 758778e761892429cba5b63b6f9c02140072f1a84b7a477cf0080bfc4fc68997。
文字提取与逐页渲染检查通过，四条bullet保留，无裁切/重叠/乱码/编辑控件；不是程序另造PDF或历史PDF替代。
Chrome恢复后Logo/紧凑价格菜单在输入区左下；选实惠档后刷新保留，不自动发消息；真实对话Markdown已渲染，协议头/review不外露。
相同请求恢复、相同提交幂等、不同内容同ID冲突、recover不增版本、另一工作区拒绝，正常HTTP验证，0模型增量。
浏览器中夹入的语音文字只出现在本次虚构材料编辑里，已按预定夹具重新保存并核对实际PDF；没有操作真人材料。

## 保护核对：不掩盖正常在线变化
旧interview_answers 41、resumes 16、user_resumes 16及积分wallet/transfer/reservation 1/1/6全量前后排序摘要一致。
原user_quotas 141行整表摘要不同：Chrome启动恢复正式标签后，正式5N3于04:31:38Z等收到/api/quota/check，
同时间一位原观猹账号发生UTC跨日免费聊天重置（last_free_reset=2026-10-24）。既有lib/quota.ts只更新
free_chat_daily/last_free_reset/updated_at，不写付费额度。没有为凑相同摘要覆盖旧行，也不声称整个配额表没变化。
本轮模型调用与额度仅落在新QA用户；无真人积分兑换/余额/旧作答/凭据/DDL写入。

## 门禁与候选
全量288套2840项通过、10原有跳过、0失败；局部93项与全量重叠，不相加。类型通过，lint 0错误/2个未改函数的历史警告。
手动Impeccable detect一次：1条历史字体warning、4条历史颜色advisory；均不在本次新行，无新增发现，不开自动hook、不扩修。
云构建通过，候选dpl_CgN3UhExdc6ELWPAz7CyDnUnfgho，唯一运行时覆盖COMPANION_LOOP=1；无QA管理员授权覆盖。
候选错误日志扫描无error。原正式yizhioffer.com/www仍5N3，未promote。
提交/推送、CI、同构建切流、正式只读复核与清理结果在后续发布补充中登记，不能把本节候选当已上线。

## 正式切流与最终清理
已提交推送codex/companion-v3-acceptance-1023，仅31个本任务文件（含两次提交）；没有夹带既有未跟踪打印截图。
GitHub运行40063445573真实completed/success，类型/全量测试、isolated-schema-rebuild两项作业通过；没有关闭提醒或放宽收费。
`vercel promote`已将验收同一份dpl_CgN3UhExdc6ELWPAz7CyDnUnfgho切到yizhioffer.com和www；未重建另一份冒充同构建。
正式health为ok/database ok；正式管理员按QA userId/requestId读到真实input/output/system/prompt/rawOutput，普通QA无管理员权限。
旧稳5N3保留。正式错误日志最后10分钟无error；真实Chrome1450px无横向溢出，390px手机无横向溢出，原模型偏好刷新已验。
实际PDF从正式Eval后台下载后SHA256与Chrome原文件相同；前序验收与发布补充分别不可变留存，不改写此前失败。
本轮QA 24个事件标内部、邀请码精确移除1个；对应隔离域IAB/Chrome Cookie清除，Chrome刷新已回登录页，两个QA页与打印页关闭。
仅删除本轮3份临时登录/请求文件，虚构turn/材料与Eval证据保留；不撤销原账号、不轮换站点密钥、不修改旧作答/积分。
原配额表的正常跨日免费额度重置已单列，不为得到相同hash回写旧值；最终旧作答、两类简历及积分三表摘要仍一致。
本地共享旧9a树仍有他人在途，不可整树覆盖正式32ba/CgN3。Claude首页未纳入本次发布。
