# 短信日限 30 次/号码 + 移除前台 TokenPay 入口

DS 原记录日期：2026-10-21 UTC（本地为 10-20）。最新状态：**三提交已推远端；Codex 于 10-20 本地完成生产迁移、重建与正式验收。** 下方为 DS 原实施记录，旧“未运行/未应用”状态由本段收尾结果覆盖，保留其历史执行边界。

## Codex 收尾结果（2026-10-20 本地 / 10-21 UTC）

- 生产迁移 `phone_daily_limit_30` / `20261021042719` 已应用，函数回读 30/号码/UTC 日；原计数不重置。事务回滚夹具两轮通过，确认第 30 放行/第 31 拒绝及拒绝不影响旧 OTP，残留为 0；未发短信。
- 85 项相关 mock 回归、TypeScript、TSX lint 通过；本次前端手动 detect 无新增改动归因项，历史 TodayCoach 样式告警未扩修。
- Chrome 现有 Vercel 登录完成同源提交 `4524cc1` 的 Production 重建：`dpl_53XTR3HY3JhJty6EZK8KGbo5sSpU` / READY / 4m13s / 136 页，`yizhioffer.com` 已分配。CLI 凭据失效、MCP team 403 不绕过，未另建凭据；本次为网页正常 Production 重建，不冒称 staged + promote。
- 正式桌面/390 手机、账户展开/Escape/刷新通过；旧 TokenPay 前台入口已撤，积分/手机号/退出保留，8 岗位恢复。health 200/database ok；手机配置匿名 enabled=true，Eval/TokenPay 匿名401；新部署短窗 Console Error/Fatal/Warning 0。没有重新发码实登、支付、兑换或模型实测。
- 41 旧作答、7 简历任务、用户、钱包/转入/预留、真实 OTP 与计数桶 8 组 hash 均同；旧 Widget 的正常账户读取刷新了 TokenPay 余额缓存时间，不能声称该表整行 hash 不变。连接仍 active、未重授权/改密钥或断连，详[完整收尾证据](2026-10-20-ds-release-closeout.md)。Cursor 在途 9 文件未混发，旧域不续/兑换暂缓等未决项保留。

## 本轮决定（本人 2026-10-21）

- 手机验证码日限：从 5 次/号码/日改为 **30 次/号码/日**。
- 「TokenPay 旧入口」指**前台界面入口**，本次只移除前端的 TokenPay 展示与充值入口。

## 改动

### 1. 短信日限 30 次/号码/日

- 新增迁移 `supabase/migrations/20261021042719_phone_daily_limit_30.sql`：以 `create or replace` 重写 `reserve_phone_auth_send`，仅把 `phone-send-number` 的日窗口上限 5 → 30。
- 保持不变的防护：全站 100 次/日（`phone-send-global` 86400,100）、同一号码 60 秒重发冷却、发送 IP 10 次/15 分钟、验证 IP 30 次/15 分钟、每个验证码 5 次尝试上限、拒绝请求整体回滚（不消耗日额度、不使旧 OTP 失效）。
- 设计判断：不重置已有计数桶；提高上限后当前 UTC 日立即按新上限生效。30 与全站 100 的关系是「单号码先到 30，全站合计先到 100」，两者都保留。
- 更新 `supabase/tests/phone_send_reservation.sql`：拒绝场景的计数基线改为 30；新增边界断言「第 30 次放行、计数为 30，第 31 次拒绝且计数保持 30」。
- `lib/phone-auth/handlers.ts` 与前端提示文案无需改动：日限拒绝仍由数据库返回 `limit_scope=number`，页面继续提示「今日验证码次数已用完」。

### 2. 移除前台 TokenPay 入口

- `components/cockpit/WorkspaceAccount.tsx`：账户菜单不再渲染 TokenPayWidget，保留 `WatchaPayWidget`（爱猹收积分）与手机号入口。
- `components/cockpit/TodayCoach.tsx`：桌面顶栏与移动端侧栏的 TokenPayWidget 入口移除。
- `components/cockpit/TodayCoach.module.css`：删除仅服务该入口的 `.mobileTokenPay` 规则。
- 未改动：`components/tokenpay/TokenPayWidget.tsx`、`/api/tokenpay/*` 路由、TokenPay 凭据/余额/历史数据。已连接用户的后台链路与计费语义保持原样，仅前台不再展示；需要回滚时还原上述两个组件即可。
- 已知取舍：已连接 TokenPay 的用户暂时看不到前台余额/重新授权/充值入口；这是本人明确选择的「先收前台入口」，待金额账本与新充值链路落地后再决定是否删除整条旧链路。

## 验证

- `npx jest lib/phone-auth --runInBand`：5 套 57 项通过。
- `npx tsc --noEmit`：通过。
- `grep -rn "TokenPayWidget" components app lib`：除组件自身定义外无引用。
- 未运行：`supabase/tests/phone_send_reservation.sql`（本机无 Supabase CLI、无数据库连接；需在可执行 SQL 的环境应用迁移后运行）、生产数据库迁移、构建、部署、真实短信。
- 结论边界：以上只证明代码层与类型层通过，**不证明线上日限已变为 30**；迁移未应用前线上仍是 5 次/号码/日。

## 数据与用户影响

- 本轮无数据库写入、无模型调用、无短信发送、无支付/积分动作、无部署。
- 不触碰旧作答、简历任务、积分钱包、兑换与已连接 TokenPay 凭据。

## 下一步（需授权）

1. 应用数据库迁移（建议事务内应用并在同一事务跑 `supabase/tests/phone_send_reservation.sql` 的断言，或先备份后应用）。
2. 发布前端改动（干净构建，不混入工作树里 Cursor 在途的首页/纸面/工具栏样式）。
3. 验收：生产匿名手机登录入口可打开；用虚构号码夹具验证第 30 次放行、第 31 次拒绝且旧 OTP 保留；不发送真实短信、不重置生产计数。
4. 推送本轮提交到既有分支（当前分支此前 2 个提交已补推，远端同步）。
