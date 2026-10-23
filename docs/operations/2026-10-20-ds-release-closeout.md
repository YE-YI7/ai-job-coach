# DS 短信日限与 TokenPay 前台入口发布收尾

日期：2026-10-20（America/Los_Angeles）/ 10-21 UTC。来源：`a3c29d9`、`4bcad13`、`4524cc1`；远端分支已核对同步。当前状态：生产数据库迁移完成，Production READY，正式域名与桌面/手机及刷新验收通过。

## 接收与范围

- 核对 DS [原报告](2026-10-21-phone-limit-30-and-tokenpay-entry.md)、提交内容及线上旧函数，发布前确实为每号码每日 5 次。
- 原提交仅提高号码日桶 5→30，保留全站每日 100、60 秒冷却、IP 限制、5 次验证尝试和拒绝整体回滚。不重置真实计数。
- 前端只删除账户菜单、TodayCoach 桌面顶栏及移动侧栏的 TokenPayWidget 入口和专用样式；爱猹收积分、手机号入口、退出登录保留。原 TokenPay API、组件与已连接用户链路不删除。
- 干净验收副本 `/tmp/yizhi-ds-closeout.TJ1lDH` 来自 `git archive 4524cc1`；仅复制 Vercel 项目标识，未复制密钥。共享工作树的 9 个 Cursor 在途首页/导师样式/纸面/工具栏/打印文件均未择入本轮构建。

## 数据库实际验收

项目 `wynjnexofolzusmtjltd`。从已审阅提交精确读取迁移和 SQL 测试：

1. 首先事务内替换函数并执行 SQL 断言，最终 ROLLBACK。辅助脚本初次拼接 DO 分隔符出错，整条语法失败；修正脚本后断言通过并回滚，没有把该辅助错误归因到 DS 迁移。
2. 用正式 migration 接口应用相同 SQL，返回 success。记录名 `phone_daily_limit_30`，远端实际版本 `20261021042719`；源文件名仍为 `20261021042719_phone_daily_limit_30.sql`，两者对应关系明确记录，不重命名已推文件或篡改旧迁移记录。
3. 对已生效函数再次事务内运行 DS SQL 断言并回滚：第 30 次放行、第 31 次拒绝、拒绝不继续扣日额度、旧 sent challenge 保留、全站拒绝退还号码计数、冷却不扣额度均通过。
4. 回读函数：号码上限 30、全站上限 100、security definer=false；anon/authenticated 不可执行，service_role 可执行。没有放开浏览器权限。
5. 虚构号码 challenge 和虚构计数桶残留均为 0，没有发送短信，也没有留下测试账户或 OTP。

安全 advisors：62 个既有 RLS 无公开 policy 的 INFO、1 个既有密码泄漏保护 WARN；没有本函数新增告警。服务端专用表不为消除提示新增公开 policy。历史提醒：[RLS 提示口径](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)、[密码保护](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)，均未擅自改配置。

## 代码与界面检查

- 干净副本 9 套 / 85 项定向 Jest 通过：phone-auth、phone recovery、TokenPay 与 LLM 接线。模型/短信相关测试为 mock，不是外部调用。
- TypeScript 与两项 TSX lint 通过。
- 静态检查确认三处旧 Widget 不再引用、专用移动样式删除；积分、手机号与退出保留。
- 本轮 UI 手动 Impeccable detect 一次，发现 TodayCoach 既有样式 advisory。与 diff 核对，本轮无新增颜色、字号或圆角，不扩大修复历史样式；自动钩子未开启。原界面身份、左栏及模型入口位置保持。

## 发布路径与认证边界

正式发布前仍为上一版 `dpl_6urMYdxAoYgEPjqz9uAwXecbRFgZ`。CLI 旧登录凭据失效，Vercel MCP 对指定 team 返回 403；没有换其他团队、读出 token 或扩权限。尝试官方设备登录但按钮不可用，已取消等待并关闭页面，未创建新凭据。

改用本人已有 Chrome Vercel 登录。项目路径、Hobby 团队、源分支和完整 SHA 均通过页面核对。发现 DS 推送后已有 Preview `dpl_4aHayLdWre9r2XZd3ZzBwDw2vDUz` / `4524cc15b4a837dd41147e1b72121ced2ff73c5b`；预览环境手机号配置不同，不拿它冒充正式验收。

网页 Redeploy 选择同一来源、Production、不使用旧 build cache。网页没有提供 skip-domain 开关，因此本次是正常 Production 重建和域名分配，**不是** CLI staged-build + promote。新构建 `dpl_53XTR3HY3JhJty6EZK8KGbo5sSpU`，部署地址 `ai-job-coach-13y2gibpr-velmavalienteqejimu22-jpgs-projects.vercel.app`。只构建已推提交，未上传脏工作树或测试页。

最终状态 READY / Production，构建耗时 4m13s，TypeScript 与 136 页生成完成；网页回读来源仍为完整 SHA `4524cc15b4a837dd41147e1b72121ced2ff73c5b`，正式域名 `yizhioffer.com` 分配到上述新部署。没有把 Preview 的成功当生产构建成功。

Chrome 原账号只读验收：

- 发布前账户菜单实际仍有 TokenPay；发布后刷新，账户菜单只保留积分、手机号和退出，不再有旧入口；8 个原岗位恢复。
- 桌面和 390×844 手机均无横向溢出，菜单 320px 且在视口内；Escape 关闭并将焦点还给账户入口。没有点击充值、兑换、重新授权或退出。
- 正式登录页正确显示已登录保护态及手机号登录方式，不替用户退出再发码。匿名 `GET /api/auth/phone` 返回 200 / enabled=true / authenticated=false，供应商配置保持；未将它宣称为本轮新短信实登验收。
- 正式 health 200 / database ok；Eval 与保留的 TokenPay account API 匿名均返回 401，未放宽鉴权。
- 新部署运行日志在最近 30 分钟筛选、绑定本部署的视图中，Console Warning/Error/Fatal 均为 0；这是新部署短窗，不是长期监控保证。长期 Drains 缺口本轮未配置或重新核定，不宣称已补齐。
- 证据：`/tmp/yizhi-ds-closeout.TJ1lDH/production-account-desktop.png`、`production-account-mobile.png`，仅保存菜单，不包含原简历联系方式。手机模拟已清除，未留下浏览器环境改动。

## 数据基线与禁止动作

发布前整行排序聚合 MD5：

| 数据 | 行数 | 基线 |
| --- | ---: | --- |
| interview_answers | 41 | `4e13749d834d65ba1213c5da9faedd54` |
| watcha_point_wallets | 1 | `911203ce80ef77ab10df3a333e393dab` |
| watcha_point_transfers | 1 | `772e13a5cd6cb3bc100c6caf337f56da` |
| watcha_point_reservations | 6 | `d9074173be468ca74a52a9f975befdfd` |
| coach_resume_tasks | 7 | `bcf4ec1a5b4d92432ffd478adafdccdf` |
| tokenpay_connections | 6 | `7b41c99ab282b48959a7f252a695dcd8` |
| phone_auth_challenges | 2 | `08c82eaedecbae022dd7c96afa4eea99` |
| users | 60 | `27f247281c98d25f5b8f74ad32fe677a` |
| public_action_rate_limits | 171 | `ec0a82d2d23be34325a9665fc27b04e0` |

发布后复核：除 TokenPay 正常余额缓存刷新外，表内所列其余 8 组 count/hash 与基线完全一致，包含 41 条旧作答、7 个简历任务、真实 OTP 和真实计数桶；60 个原用户没有新增或合并。此轮开始后的 ai_generation_events=0。

TokenPay 特别说明：旧组件挂载时会自动读取账户，`getTokenPayAccount → updateStoredBalance` 会保存余额缓存及 `last_checked_at/updated_at`。发布前只读界面对比因此使一条连接在 04:31:43 UTC 正常刷新，TokenPay 全表 hash 由 `7b41c99ab282b48959a7f252a695dcd8` 变为 `69df154086089ac9b843fef83a158762`；不能虚称所有表整行完全不变。该连接仍 active、connected_at 仍为 2026-09-01；已核对自动读取路径不写 encrypted_api_key/key_fingerprint/connected_at，没有执行重授权、断连、支付或模型请求。没有为了恢复旧 hash 回写余额或凭据。

本轮不发送真实短信、不调用收费模型、不做支付/积分兑换、不改旧作答、原稿或已连接凭据。旧域到期不续和其他历史待办不变。DS 三个运行/报告提交原本均已在远端，本轮仅补验收文档，不为文档再次部署。
