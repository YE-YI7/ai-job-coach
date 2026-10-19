# yizhioffer.com 接入与主域迁移验收

> 后续终态（2026-10-18 本地 / 10-19 UTC）：新域独立观猹凭据接通，真实 OAuth 回到原账号，刷新与 41 旧作答 / 33 工作区整行校验通过后，已切公开主域至 yizhioffer.com。当前生产 `23a8174` / `dpl_HtoYnGRMFPSp4QcbpnUjps2Vomwp`；旧登录、工作区、OAuth / 支付 API 路径不做全域跳转。见[最终登录与切换验收](2026-10-18-watcha-new-domain-acceptance.md)。下文“未切主域”与白名单失败保留为接入当天的早期历史，不是当前故障。

2026-10-18。用户授权先接新域名、保留旧域，真实登录／刷新／原账号数据通过后再切主域；禁止修改旧作答。

## 当前终态：已接入，未切主域

- `https://yizhioffer.com` 已连接现有 `ai-job-coach` Vercel 项目，HTTPS 正常；不是另建数据库或复制工作区。
- `www.yizhioffer.com` 以 307 跳到裸域，保留路径。
- `www.ai-job-coach.xin` 继续服务，旧裸域到旧 www 的既有配置不变。
- 当前运行构建仍为 `dpl_7tmQ7vsWuiskwstvnuvkg3ctZcgn`，运行提交 `be3dd2fb2989e162be42b6d15bbb77c95dc6d66f`。未新部署、未改环境变量、canonical／站点主地址／支付回调或认证逻辑。
- **未签收新域真实登录与刷新；未切主域。** 真实观猹授权发现下面的供应方白名单阻塞。

### 后续 HTTPS 警告复验（2026-10-18 09:54–09:57 UTC）

用户截图为 Chrome “This site doesn’t support a secure connection”，不是应点击继续忽略的提示。浏览器只读清单定位到本人另一个标签停在 `http://yizhioffer.com/`，而新域 HTTPS 登录标签仍正常。未点击 Continue、修改安全设置或清理全局浏览数据。

- 当前公共 DNS A 为 `216.198.79.1`、AAAA 无记录，Vercel 再验为 configured-correctly，无冲突。
- 直连 Vercel 推荐 IP 且正常验证证书：TLS 1.3、Let’s Encrypt YR1、CN/SAN 均匹配新裸域，`SSL certificate verify ok`；证书有效至 2027-01-16 08:42:59 UTC，平台显示两个新域均自动续期。
- 真实 HTTP 请求返回 308 到 HTTPS；真实 HTTPS 返回 200，www HTTPS 返回 307 到裸域 HTTPS。没有用 `-k` 或跳过证书验证。
- 新 Chrome 标签从 `http://yizhioffer.com/` 正常进入 HTTPS 首页；新 www 在 Chrome 跳裸域 HTTPS 正常。原警告标签显式导航安全的 HTTPS 地址后首页可读，整页刷新仍正常，未绕过浏览器警告。
- 当前未复现持续的证书故障。初次拦截可能与接入时的瞬时 TLS／解析状态有关，但没有当时的握手错误，不能断言唯一根因是缓存或传播。复验截图仅留本机 `/tmp/yizhioffer-https-rechecked.png`。

本节只签收当前传输层与页面访问，不替代新域手机号／观猹真实登录及原账号数据刷新验收。未改生产配置、应用代码、账号或旧作答，仍未切主域。

## 实际基础设施变更

Vercel 项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`，团队 `team_7qIutahimwnjCje1fOtQEPyT`。使用已有正常 CLI 身份；连接器 403 后没有修改权限或重复请求同一连接器。

阿里云原空解析区只增加两条，TTL 均为 600 秒，没有删除任何记录、切换 NS 或购买解析套餐：

| 主机 | 类型 | 值 |
|---|---|---|
| `@` | A | `216.198.79.1` |
| `www` | CNAME | `900c5e20cbcc6511.vercel-dns-017.com` |

这些值来自本项目的 Vercel 推荐配置。权威 NS 保持 `dns25.hichina.com`／`dns26.hichina.com`。

验收：

- Vercel 两域 `domains verify` 都为 `configured-correctly`、`ok=true`、`misconfigured=false`、verified；新域绑定相同生产构建。
- Google 公共 DoH 分别返回上表 A／CNAME。受本机代理影响的 `198.18.*` 结果不作为公网 DNS 证据。
- 自动签发两个新域证书，均显示自动续期；没有跳过证书验证或安全警告。
- 新裸域 `/api/health` 实际返回 `{"ok":true,"database":"ok"}`；新 www `/cockpit` 307 到新裸域同路径；匿名新裸域 `/cockpit` 307 到 `/login?redirect=%2Fcockpit`。
- 真实 Chrome 新域登录页打开正常，手机号入口读取为 enabled。页面能显示并不等于短信登录已经通过。

## 真实观猹授权失败：回调白名单

Chrome 从新域正常点击观猹登录；供应方识别已有观猹用户与“益职 AI”应用，只有既有基础资料权限。点击“继续”后未回跳。

通过当前页面 CDP 网络诊断得到：

```text
POST /api/v2/oauth2-server/authorize
HTTP 400
{"statusCode":400,"code":"ERROR","message":"invalid redirect uri"}
```

没有保存或输出 OAuth code、token、Cookie、手机号、OTP 或密钥。新域回调为：

```text
https://yizhioffer.com/api/auth/watcha/callback
```

官方 [观猹认证接入文档](https://agentuniverse.feishu.cn/wiki/EMYHwT3sIiUYaDkL1ZvcPntGnpb) revision 206 明确当前尚无 OAuth2 前端管理页面，客户端配置须联系官方人员；redirect_uri 必须与注册 domain 匹配。已查看本人已有产品管理／个人设置／推广接入说明，没有修改公开产品资料或提交重复客户端申请。

需要给现有客户端**追加**新回调，并保留所有旧回调。未授权联系第三方前不自动发邮件；已请求用户授权向 `support@watcha.cn` 发送仅含应用名称、新回调与保留旧回调的技术请求，不附用户资料或密钥。不能用复制 Cookie、伪造会话或绕过白名单冒充验收。

## 原账号与旧作答保护

本轮只进行 SELECT 聚合及真实 Chrome 只读核验，没有修改简历、岗位阶段、作答、余额或账号绑定。

| 数据 | 接入前 | 接入后复核 |
|---|---|---|
| 原账号 `coach_opportunities` | 10 条；`2a004763385e0ee84c3dd4a30d6853c2` | 相同 |
| 全部 `interview_answers` | 41 条；`0881efbb0a4a159ba1e7b5460c6007d8` | 相同 |

校验口径为 `md5(string_agg(row_to_json(row)::text,'' order by row.id))`，对整行聚合，不只比较条数。用户资料正文不进入报告。

Chrome 旧 www `/cockpit` 显示原 8 个岗位，整页刷新仍显示 8；正常只读 `/api/auth/session` 确认 authenticated 且为原用户 ID。**这是旧域兼容性验收，不冒充新域登录。**

## 待完成与切换门槛

1. 用户在已留 Chrome 新域页，使用之前已绑定原账号的手机号亲自完成短信登录；不让未绑定的新号码意外建空账号，不代读号码或 OTP。
2. 新域正常会话端点核对原用户 ID；打开工作区，刷新后重复检查，并再次比对资料／旧作答整行哈希。
3. 观猹官方追加白名单后，真实走新域 OAuth 到原账号，再刷新复验。
4. 以上通过，才更新主站地址／canonical／站点发现入口，并部署验收。保留旧域服务和旧认证／支付回调兼容；不做会吞掉旧回调 state Cookie 的全域盲跳转。
5. 既有支付回调没有在本轮重新付款验证，不假称付款迁移已通过。旧域仍需续保，不能因新域 TLS 正常便停用旧域。

若需撤销当前新增入口，仅撤销本轮新增的两条 DNS 记录及两个 Vercel 新域绑定；旧域、构建、数据库和作答无需回滚。未执行撤销。

本轮没有改 UI 文件，因此不运行 Impeccable UI 扫描。配置成功、页面打开、旧域刷新、新域真实登录及主域切换分别记录，不混为已完成。
