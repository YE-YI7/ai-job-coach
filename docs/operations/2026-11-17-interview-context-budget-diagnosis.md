# 正式模拟面试启动上下文溢出：只读诊断

用户问线上启动模拟面试为何报“关键内容装不进12000 token预算”，本轮仅排查解释，未授权自动实现/发布新修复。原报错在附件，内部fact ID不复制到报告。

## 已确认

- 当前正式域名重新检查仍`dpl_4z6eVnahAfFPsWvDp1Rb93ztavWe` READY，与已发布独立source对应。
- 该部署最近30分钟有界日志里，UTC2026-11-17T15:30:10.630Z的`POST /api/interview/start`返回422，error消息包含附件第一条fact ID，确认是本次线上同类错误，不是本地预览或语音故障。日志查询path字符串并未严格过滤结果，返回20条其他路由日志；只对匹配错误那一条作结论，不冒全时段统计。
- 附件列的是100条不同的未装入confirmed_fact，估算cost合计9145 token；不是总事实数、总输入token数，也不能据此认为每条事实重复或无关。
- `app/api/interview/start/route.ts`使用`getConfirmedInterviewClaims(userId, opportunityId)`，查询限定当前用户、当前岗位或global事实（最多300，超过另报错）。compile还按mock_interview的entityType过滤，因此不是跨账号/所有岗位无条件取数。
- 但该路由显式`claimSelection: "all_required"`，已确认且符合任务类型的事实全部变为必装；JD和存在的简历也required，共用12000估算token预算。`lib/coach-harness/context.ts`中任一required条目装不下即truncated，`assertContextFits`拒绝运行。这里12000是应用自身输入选择预算，不是模型窗口上限或账户订阅额度。
- route将`ContextBudgetExceededError.message`及blocked原样回给前端，UI通过apiResponseError直接显示，导致内部fact ID和长清单暴露给用户。这是错误呈现缺口，不能只把它当合理的用户删材料提醒。
- assert在创建interview_sessions和generateInterviewQuestions之前；这个失败分支未进入题目生成。quota先预占，catch调用finalizeQuota(false)释放；本轮没查账本，不保证实际返还已核对。无该失败分支的新题目模型调用，不扩大到用户此前其他请求/调用。
- 本次递进设置发布只改展示，start路由/VoiceControls未改。开发demo分支本来不调用该API，所以本地点击走通不覆盖真实档案量的出题启动。此前未作真人付费生成验收，应明确保留这一覆盖缺口。

## 修复方向（未执行）

面试上下文需围绕当前岗位/出题任务选材，完整保留真实材料与来源，处理超预算时的分批读取/有界选择和可恢复路径；不能删除档案、静默截断关键原句或只放大数字掩盖。用户报错需短且可操作，内部ID和逐条预算留后台。是否采用相关工作集、分批检索或提高有依据的预算，需对比质量/完整性后定，不把已有tutoring的12条/1400规则直接迁给面试。

本轮0新模型调用/生产业务写入/代码修改/提交push/部署。证据：上级`interview-budget-diagnostic-logs.jsonl`及status.log（私有，不入Git）；本地source的start route、repository、context、prompt和quota调用顺序。未额外读取真实事实内容、答案或修改钱包。
