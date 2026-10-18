# +86 手机登录 / 原账号绑定：实现与验收边界

## 密钥到位后的真实验收续接（2026-10-18 UTC）

- 本人已确认保存两项密钥。Vercel CLI 只查到 `ALIYUN_PNVS_ACCESS_KEY_ID` / `ALIYUN_PNVS_ACCESS_KEY_SECRET` 为 Production 加密变量；未读取值、拉取环境文件或写入 Git。
- 当前候选代码 `1ecd4c4`，Production 构建 `dpl_Uypxsd1p43cqNyK4BE7m1ZAnphbr`，URL `https://ai-job-coach-32s1sco04-velmavalienteqejimu22-jpgs-projects.vercel.app`，已 READY。仅本构建的 build/runtime 显式 `PHONE_AUTH_ENABLED=1`，`--skip-domain`，本轮未 promote。
- 验收中发现正式双域切到 `dpl_HV2fFRX3Ta8SCsqw6MD6a9hsh9ii`；API 元数据确认是 `dpl_DM5J874JcaKg7zBjDAtLcAH5nQpY` 的 redeploy，代码仍 `9ba6007602b70e77be9809c399e0eb438f9b8dac`，不是另一份新增代码。以后发布前仍要重新核对，不能据旧报告覆盖新部署。
- 续接基线：旧用户 56，整行 MD5 `095d94e2d3c26aee5615a955cad085dd`；旧额度 MD5 `facb25f917190aa600a1033754607b1b`；旧作答 41，MD5 `0881efbb0a4a159ba1e7b5460c6007d8`。无已绑定手机号或挑战记录。
- 新建隔离 QA 用户 `2268402f-9c7c-427b-be64-f5b1175551c7`，仅此用户的模拟 paid chat/resume/interview 额度为 11/7/5；不复制旧账号、简历、岗位或作答。临时邀请码不写报告，避免泄露可登录凭证。需在整个真实验收结束后按精确 ID 检查并处理测试夹具。
- 本轮定向回归 9 套 / 58 项通过。生产云构建通过；受保护候选通过正常 Vercel 身份访问，未关闭保护：匿名状态 HTTP 200 / enabled=true；非法号码发送 HTTP 400，未发短信。挑战表 RLS deny-all、匿名/普通角色不可读；三个 invoker RPC 仅服务端可调用。
- Chrome 走真实原邀请码登录隔离 QA，API 只读核对会话用户 ID。本人填写号码并确认获取短信后，页面显示真实待验证状态；刷新后同一掩码号码与倒计时、验证码输入框恢复。本人亲自输入 OTP/提交绑定，刷新仍已绑定。真实挑战 `f90ab573-9af0-4acb-b502-8c6263fa591d` 为 consumed/attempts=1；QA 原用户 ID/provider 和模拟额度 11/7/5 保留。未读取、转发 OTP，报告不留完整手机号。
- 绑定后复查旧 56 用户、旧额度、旧 41 作答的整行 MD5 均与续接基线相同。已仅从候选 QA 账号正常菜单退出，交本人用同一手机号完成登录；登录、登录后刷新/同 ID 和最终发布仍未签收。真实错误/重放/并发的阿里云端验收尚未执行，不能拿此前 SQL 合成 PASS 代替。
- 本人第一次手机号登录发送返回通用 503。DB 只读确认相同 QA 号码的登录挑战 `27243e5d-74e8-4a3d-9193-31a22161a798` 为 failed/attempts=0，已成功绑定挑战仍 consumed，失败发生在 provider 发送而非 OTP/账号解析。阿里云发送记录只有绑定成功回执，没有登录投递记录；原服务端吞掉供应商错误，不能猜定是模板/额度/网络或频控。
- 修复 `1d8afd0`：补文档状态白名单诊断，仅 operation/purpose/code 与格式限定 RequestId，未知码记 UNRECOGNIZED，不输出 SDK message/请求/响应正文/手机号/OTP/密钥；识别 `biz.FREQUENCY`、`isv.BUSINESS_LIMIT_CONTROL` 等官方限流码，并明确 429 而非通用 503。真实失败是否属于该类型仍待复测，不冒称根因已确认。新增回归共 9 套 / 65 项与 tsc 通过，4 个代码/测试文件已推独立分支；本报告续记不代表正式发布。
- 修复版 Production `--skip-domain` 构建 `dpl_EVJAo1mQE4McWCWDrbHtXtjopfnb` / `https://ai-job-coach-18yxto37d-velmavalienteqejimu22-jpgs-projects.vercel.app` 已 READY；不关闭部署保护，不放宽短信限流，不自动重复发送。后续只作一次本人确认的登录重试，查明确失败码，再修正并完成验收。
- 一次尝试将用户已填写的测试号码从旧测试页带到新构建时，浏览器只返回 `<redacted>` 遮蔽占位符；新版前端拒绝为非法手机号，未产生挑战或供应商请求。已清除该占位符并交还本人输入，不尝试用 Cookie、数据库或隐藏状态绕过浏览器遮蔽。不要把这次客户端格式错误计为真实短信失败或重试成功。
- 全量回归完成：2368 通过 / 9 跳过 / 4 个原有 JD 链接导入失败（Manus、Greenhouse、Lever、Ashby，仍为预期 200 实际 503）；不称全量通过，不在短信任务顺手扩大修复。控制台重新回读登录 100001 与绑定 100004 为赠送可用模板，参数均 code/min，未修改短信配置或购买套餐。

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
- [官方状态码与号码流控](https://help.aliyun.com/zh/pnvs/developer-reference/api-return-code)
- [核验验证码 API](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-checksmsverifycode)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Supabase security advisor 新表的 [RLS enabled/no policy 信息项](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 是有意 deny-all + service role；已核查 grants，而非放开浏览器访问。既有 [password leak protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 未在本轮扩大变更。
- Performance advisor 仅新索引的 [unused-index 信息项](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)：刚建且尚未正式运行，保留 FK 索引，不据此删掉它。
