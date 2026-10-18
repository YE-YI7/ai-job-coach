# +86 手机登录 / 原账号绑定：实现与验收边界

日期：2026-10-17 本机 / 2026-10-18 UTC。当前是等待本人配置密钥的候选实现，不是短信验收或正式发布完成。

## 已实现

- 保留邮箱、邀请码、观猹与现有签名会话；配置完成且 `PHONE_AUTH_ENABLED=1` 才显示手机号首选。没有改旧 `ENABLE_SMS_LOGIN` 或启用内存 Map 的 `/api/sms`、`/api/verify`。
- 官方 `@alicloud/dypnsapi20170525@2.0.0`：号码认证 Dypnsapi，不是普通短信 Dysms。仅 SendSmsVerifyCode / CheckSmsVerifyCode；供应商生成 6 位验证码，5 分钟有效，不返回正文、自动重试关闭。核验仅接受 `Model.VerifyResult=PASS`，HTTP OK 不算验证成功。
- 登录模板 100001、绑定模板 100004，赠送签名默认「恒创联众」。发送与检查使用相同 phone/purpose/OutId；客户端说明署名与阿里云数据去向。
- `/api/auth/phone` 返回服务可用性、当前账号掩码手机号及当前浏览器待验证状态；`/send`、`/verify` 只接受同源 JSON。代理后的真实 Host 用于来源校验，生产要求 HTTPS；拒绝缺 Origin、跨站或非 JSON 请求。
- 短期挑战仅服务端可读：浏览器随机凭证 HttpOnly/SameSite=Strict/生产 `__Host-` Cookie，数据库只存 HMAC。先发浏览器凭证，再允许发送短信，避免首次发送响应丢失后无法恢复。验证码正文不入库、不记日志。
- 共享数据库执行权：60 秒同号冷却、5 次核验、30 秒执行租约、消费后不能重放；IP 10 次/15 分钟发送、号码 5 次/日、全站 100 次/日上限。数据库不可用时关闭，不回退内存。
- 登录只按已验证 phone 查找用户；新手机号原子创建 public.users 与默认额度。不会猜邮箱或按简历信息合并身份。已登录账号不能借登录接口静默切到一个空账号。
- 绑定必须有当前签名会话，目标用户来自会话而非请求 body。原子消费验证码并更新原用户 phone；号码被其他账号占用则 409，不合并、不覆盖、不迁移简历/岗位/额度。已有绑定不在这一入口换号，后续换号需另加身份校验。
- 新增账号菜单「手机号与登录」与 `/account/phone`，不改左栏或旧作答。请求中禁重复提交，错误保留输入，有超时/重读状态、验证码到期与换号入口，刷新可恢复待验证或已绑定状态。

## 数据库与历史数据保护

生产 Supabase `wynjnexofolzusmtjltd` 只新增：

- `20261018061015_phone_auth_challenges`：1 张挑战表与 3 个 service-role-only invoker RPC。
- `20261018061531_phone_auth_user_index`：新增 FK 索引。

迁移先由 Supabase CLI 建立文件；MCP 应用后依据实际迁移列表对齐本地文件版本，不改历史迁移记录。没有回填用户手机号、迁移 Auth 用户、改旧账号身份或重置旧额度。生产列已只读核验并补 schema 合同快照。

修前旧作答 41 条：`md5(string_agg(row_to_json(a)::text, '' order by a.id)) = 0881efbb0a4a159ba1e7b5460c6007d8`。本轮回查同数量同哈希（不要与使用不同序列化/分隔符的历史哈希混比较）。真实账号仍 0 个绑定手机号，挑战记录 0；本人尚未提交正式短信测试。

## 已验证，不冒充短信全链路

1. 单元/路由回归覆盖格式、同源/代理域名、短信授权、关闭开关、缺数据库、号码/全局限流、浏览器凭证、lease、错码、PASS 语义、冲突与用户 ID 保留，原邮箱/邀请码/会话/中间件回归一起测试。最终全量 2361 通过 / 9 跳过 / 4 个已存在的岗位链接导入失败（Manus、Greenhouse、Lever、Ashby）；不是全量绿灯。
2. `supabase/tests/phone_auth.sql` 在真实生产 PostgreSQL 中使用事务回滚的虚构夹具执行：冷却、错用途/浏览器、错 lease、错误核验后重试、单次消费、重复登录同一 ID、付费额度不重置、绑定冲突和成功只改 phone、到期/5 次封顶、匿名和 authenticated 不能调用 RPC/读表，断言全部通过。此处 PASS 是合成测试结果，不是实际短信。
3. 两个真实并发数据库核验请求得到 `ready` / `busy`，仅一个取得执行权；独立测试挑战已清理。
4. Chrome 真实访问本地候选，使用独立 QA 身份，不借正式登录 Cookie：手机号登录桌面/390px 无横溢出；原邀请码登录 → QA 工作区 → 账号菜单 → 手机绑定 → 刷新 → 同一 QA 用户 ID 通过。无真实手机号绑定，未修改正式账号。QA 身份/邀请码/模拟额度按准确 ID 检查无岗位、原文或作答后清理；用户数恢复 56，旧 41 作答仍同哈希。
5. 发现初次渲染的方式切换可能早于 hydration，已禁用事件未接通的方式按钮；发现 Next 内部 Host 导致合法请求 403，已修正并以实际 HTTP 400 格式错误结果确认请求能通过来源检查，另补同源拒绝测试。
6. 曾尝试标签级 CDP Offline，实际仍收到 403；不记为真实断网验收。网络参数已重置，后续需再次实际验证中断恢复，不能把此尝试说成通过。
7. Impeccable 按仓库要求仅一次集中 detect + 一次确认，自动钩子未启用。新增页面颜色统一到既有令牌；最终 0 primary，18 项 incumbent/advisory（原登录背景和账户控件颜色，新增 link 焦点复用邻居原色），不扩大修复旧视觉世界。两个旧 img 性能 lint warning 保留。未声称用户批准审美。
8. 官方 SDK 本地构造与方法解析通过，最终本地构建通过；没有发送短信、购买套餐或产生真实模型调用。npm audit 仍有生产依赖告警，未用 force 更新无关依赖；新增 Aliyun/Darabonba 包未被 audit 列为漏洞包，不代表整站安全无问题。

## 需要本人完成 / 下一步

已交接 `yizhi-sms-prod`「凭证管理」，本人询问 AccessKey 场景时答复选择「其他」（Vercel 自有后端，不是 ECS/ACK）。不由 Agent 生成、读取或转发密钥。

Vercel ai-job-coach → Settings → Environment Variables，仅 Production/Secret：

```
ALIYUN_PNVS_ACCESS_KEY_ID
ALIYUN_PNVS_ACCESS_KEY_SECRET
```

代码中默认签名/模板已与控制台核对。无需把值发聊天、不写本地 .env、Git 或 NEXT_PUBLIC_。截至本轮只检查到这两项尚未配置；不靠猜测继续测试。

密钥配置完成后，设置非敏感 `PHONE_AUTH_ENABLED=1`，先构建 Production `--skip-domain` 候选；正式域名仍留旧版本。需本人在隔离测试页面提供测试号码与输入 OTP，并确认有限次短信费用，再测实际绑定 → 退出 / 手机登录 → 刷新同一 ID、错码/复用、冲突、失败恢复与额度不变。只用新建 QA 账号和虚构材料，不给真实老账号绑测试号码。全部通过后再 promote 同一构建，双正式域名回查；没通过不冒充上线。

## 官方依据

- [个人开发者短信认证](https://help.aliyun.com/zh/pnvs/use-cases/sms-verify-for-individual-developers)
- [发送验证码 API](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode)
- [核验验证码 API](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-checksmsverifycode)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Supabase security advisor 新表的 [RLS enabled/no policy 信息项](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 是有意 deny-all + service role；已核查 grants，而非放开浏览器访问。既有 [password leak protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 未在本轮扩大变更。
- Performance advisor 仅新索引的 [unused-index 信息项](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)：刚建且尚未正式运行，保留 FK 索引，不据此删掉它。
