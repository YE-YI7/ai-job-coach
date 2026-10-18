# 国内手机号登录与积分计费切换

## 已确认需求

用户要求国内 +86 手机号绑定/登录；前台只保留观猹购买积分，不再要求最终用户绑定 TokenDance；充值提供多金额档位；前期收益目标为充值额的5%–8%；模型列表按价格从高到低。

实施建议：金额先用 ¥10／30／50／100；内部贡献毛利目标取7%，属于设计目标，不是已实现利润。不能将未核实的支付宝/观猹费用写成确定数字。

## 当前证据（2026-10-18 UTC）

- 生产环境变量名称核验：有 WATCHA_PAY 配置、站点 StepFun/DeepSeek；未发现 ENABLE_SMS_LOGIN、ALIYUN_SMS_*、ALIYUN_ACCESS_KEY_*，也没有站点统一 TokenDance API Key。不读取或输出任何密钥值。
- `/api/sms` 旧实现把验证码存在进程 Map；`/api/verify` 只返回 success，不创建登录身份或会话。不能把它当作可上线短信登录。users.phone列已存在，但安全绑定/身份唯一性与原子验证需要实现和验收。
- Chrome 已进入真实爱猹收正式商品，核实仅1档：求职辅导体验包10积分/¥9.90。后台明确价格与档位由支付宝维护；未更改配置、购买、兑换、扣款或余额。
- 官方 `https://pay.watcha.cn/agent.md`（页面版本2026-10-12）支持同一商品多档位，但档位在渠道托管页由Owner配置。公开接入文档不提供当前商户的实际手续费；当前商品页也未显示两方费率。不能据此宣称固定费率或净盈利。
- 现有积分是每次AI预留1积分，不是金额/token余额。直接撤去用户TokenPay会改计费源和可用模型，且高低价模型均扣1分，不能支持7%的成本目标。

## 安全切换方案（尚未实施/启用）

1. +86验证码：改用阿里云号码认证下的“短信认证”（Dypnsapi，不是普通短信Dysmsapi）。由供应商生成并通过SendSmsVerifyCode / CheckSmsVerifyCode核验，站点持久保存与号码、用途、用户绑定的challenge及一次性核销状态，不存明文验证码。号码规范化、号/IP双限流、发送冷却、尝试次数、有效期和原子核销后再签发原有HttpOnly会话。已登录账号验证后绑定原ID，手机号已属于另一账号时不自动合并；未登录才按已验证手机号查找/注册。验证码及手机号不进入通用日志。个人实名认证账号可使用供应商配对赠送签名/模板，以实际控制台资源为准，不猜模板ID、不做生产固定验证码或Map降级。
2. 新建金额计费权益/账本，与已售10分次数包分开；原权益继续履约，不能把原10次悄悄改成10元或模型余额。充值页面展示法币金额，内部用整数微元记账；不固定“1元能买多少token”，不同模型和缓存命中不同。
3. 支付宝/观猹实际费用和平台收益各自记账。以充值R计，目标平台贡献=0.07R，可用于模型的预算=R−支付宝实际费−观猹实际费−0.07R。R=10时是9.30减两方实际费用，不是默认9.30到账；税费、短信、基础设施、退款/坏账另计，不能称纯利润。
4. 统一站点模型服务凭据，前台不再外跳绑定TokenDance。若后台仍用TokenDance网关，仅作为供应商；不能继续偷用已连接用户的Key再从益职积分重复扣费。站点gateway凭据未配置前不能把12模型全部解锁为可用。
5. 真实用量计量与价格版本：预算预留、按实际cache/input/output结算、释放余量；失败退款、并发、重复编号、未知用量、已扣渠道未入账、已存产物后结算超时需对账恢复。公开“参考价”不能直接充当真实成本账单。充值金额/权益数量须以渠道返回与服务端配置核实，不信客户端amount。
6. 先沙箱真实多档购买/到账/并发/补偿，再Owner实际配置正式档位；新链路通过后才关闭前台TokenPay与后台用户Key优先路径。旧账号和已购余额保留，旧作答不写入。

## 本轮可独立落地

模型目录按输出起价降序，同价比较输入起价，自动模式仍置顶；没有捏造输入/输出/缓存混合价。排序只影响显示，不改自动选模、可用性、模型选中值或扣费。

运行提交9ba6007602b70e77be9809c399e0eb438f9b8dac，生产dpl_DM5J874JcaKg7zBjDAtLcAH5nQpY；候选云构建与健康通过后promote，裸域/www均核实相同SHA、READY，正式健康database ok，匿名模型API401。45项定向测试通过；全量2320通过/9跳过/4失败，失败为原有四个岗位链接导入route测试503，不称全绿。TypeScript、云构建通过；lint0错误，2条原有img提示；本次唯一UI文件手动detect一次返回[]，钩子未开启。

正式Chrome真实登录菜单核实顺序：自动、Kimi K3、Qwen3.8 Max、GLM5.3、DeepSeekV4Pro、Step5、HY4、GLM5.3FlashX、Step3.7、DeepSeekV4.1Flash、Qwen3.8Flash、GLM5.3Flash、MiMoV2.6Flash。原选中DeepSeekV4.1Flash不变；无模型请求、余额变更或旧作答写入。桌面截图`/tmp/yizhi-model-price-order.png`。390px实际截图`/tmp/yizhi-model-price-mobile.png`发现菜单被祖先容器裁左侧，非本次排序/说明修改引入，记录历史问题，不签收手机完全通过；临时viewport覆盖已恢复。

## 短信开通核对与当前阻塞

用户确认尚未开通，已打开官方号码认证控制台`https://dypns.console.aliyun.com/functions`。2026-10-18 UTC用户回复登录好了后，原登录页提交仍停在转圈；独立直接打开控制台仍跳回登录，不能声称已有有效登录态或服务已开通。保留干净扫码页交用户处理；未代签协议、实名、创建密钥、购买套餐或发送测试短信。

采用短信认证的官方依据：

- [个人开发者短信认证](https://help.aliyun.com/zh/pnvs/use-cases/sms-verify-for-individual-developers)：个人实名认证可用，提供配对赠送签名/模板，支持Web/H5/App及中国内地号码。不可将普通短信服务企业资质要求混用到这条链路。
- [短信认证新手指南](https://help.aliyun.com/zh/pnvs/getting-started/sms-authentication-service-novice-guide)：实际开通与最小权限RAM配置需控制台确认；无套餐按量计费，真实测试短信也收费。

下一步先确认有效登录、个人实名、服务协议/开通状态、可用签名模板及最小权限RAM；新密钥仅写服务端Secret，不发聊天。不把短信平台核验成功等同于益职会话已实现。

### 登录恢复后的实际核对（本机2026-10-17晚）

用户再次回复登录后，发现原先保留的控制台标签已经进入有效登录；第二个登录标签未跳转不能当作全浏览器未登录。已使用原标签核实功能页“短信认证：已开启”，未代点开通或接受服务协议。签名配置有6个系统赠送、审核通过的签名，包括恒创联众；模板配置实际列出登录/注册100001、修改绑定100002、绑定新号100004、验证绑定100005。它们是模板编码，不是验证码；未发送测试短信。当前赠送签名不是“益职”，正式登录交互需明确短信发送方，避免用户误认。

RAM用户列表只有既有power-application-user，没有益职专用短信用户；未复用其权限或读取AccessKey。下一步拟建立独立yizhi-sms-prod、禁止控制台登录，仅授权`dypns:SendSmsVerifyCode`与`dypns:CheckSmsVerifyCode`，资源级约束不受该服务支持，因此Resource为`*`，但不授予全云或完整号码认证权限。新建/授权需用户明确确认；密钥生成及Secret填入由本人完成，不进入聊天或日志。当前仍未创建用户、策略或凭据。

- [发送接口的授权定义](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode)
- [核验接口的授权定义](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-checksmsverifycode)：请求OK不等于核验成功，必须检查Model.VerifyResult=PASS。
- [自定义最小权限策略](https://help.aliyun.com/zh/pnvs/security-and-compliance/custom-permission-policy-reference)：RAM权限前缀为`dypns`，不能误写成API端点名`dypnsapi`。

已登录模板页证据`/tmp/yizhi-sms-template-confirmed.png`；仅本人可见的本地截图，不纳入Git。上一段“待登录”是此前真实状态，本次已解除；新阻塞为专用权限/安全服务端凭据，非套餐购买或签名审核。

### 用户已授权后的RAM创建尝试（本机2026-10-17晚）

用户明确“允许”创建并授权短信专用子账号。已填写yizhi-sms-prod / 益职生产短信认证，控制台访问与永久AccessKey两项均未勾选；提交创建触发阿里云安全验证。核身方式先持续加载，随后显示“安全验证服务发生未知错误，请重试”；关闭错误面板后创建行显示执行错误，详情FetcherErrorRiskCancelled。通过该行自带重试入口重试仍未成功。未显示用户创建成功，不能提前声称已授权或已有凭据；更未修改旧用户、授予广泛权限或尝试绕过核身。

保留原创建结果页右侧“重试”交本人继续安全验证。若本人完成后继续，必须先核对是否已创建同名用户，避免重复创建；再建立并绑定以下唯一权限，不添加FullAccess。策略列表额外标签未完成加载且未创建任何策略，已关闭。

```json
{
  "Version": "1",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dypns:SendSmsVerifyCode", "dypns:CheckSmsVerifyCode"],
    "Resource": "*"
  }]
}
```

错误与交接证据：`/tmp/yizhi-ram-verification-error.png`、`/tmp/yizhi-sms-ram-retry-handoff.png`。不把浏览器扩展控制台报错直接归因为阿里云失败；已确认的阻塞仅为实际页面核身错误。未生成/读取/下载AccessKey，未发短信或购买/变更套餐。权限授权不需用户重复确认，但密钥生成仍交本人操作。

### 本人验证后，专用用户与最小权限已配置（客户端日期2026-10-17）

- 用户完成核身后，原创建结果显示yizhi-sms-prod / 益职生产短信认证“已完成”；没有重复创建同名用户，控制台访问与AccessKey均未设置。
- 新建自定义策略YizhiSmsVerifyOnly v1。保存后切换源代码逐项回读，内容与上面的唯一JSON一致：Version 1、一个Allow语句、两个精确dypns验证码Action、Resource `*`，不含其他Action或FullAccess。
- 仅将该策略绑定到新建短信用户；授权表单选中RAM用户1个且ID与目标详情一致，旧power-application-user及所有角色未选中。账号级资源范围与两API服务级授权一致，不是全云Action。
- Chrome确认“已执行1/1，其中1成功、0失败”。重新导航用户权限页回读，个人权限只有YizhiSmsVerifyOnly一项；用户组继承权限表“没有数据”。未编辑旧用户或其他策略。
- 授权组件加载缓慢，改用同一Chrome的原生CUA界面完成；未更改网络、Cookie、扩展安全配置或绕过核身。一次只读CDP加载诊断被“正在解析暂停文档响应”拒绝，不据此宣称已定位全部加载根因。
- 未创建、读取、下载或传送AccessKey；未发送短信、购买套餐、改正式环境Secret、启用旧SMS路由、调用付费模型或写旧作答。这里只完成了云端专用身份与授权，不等于手机号登录已实现或上线。

本机私有证据：`/tmp/yizhi-sms-minimal-policy.png`（保存后的完整两API源代码），`/tmp/yizhi-sms-ram-bound.png`（1/1绑定成功），`/tmp/yizhi-sms-user-permission.png`（重新导航后唯一直接权限），`/tmp/yizhi-sms-no-inherited-permissions.png`（继承为空）。截图不纳入Git。后续复用此用户/策略，不再另建；密钥由本人生成并安全填服务端，短信认证适配、原子challenge/限流/安全绑定和会话仍需实现与真实验收后才开放。

## 需补条件

短信认证控制台有效登录/实名认证、开通协议与实际配对签名模板；最小权限服务端配置；支付宝与观猹当前商户实际费率/结算依据；统一站点模型供应账户。密钥不要求发聊天。没有这些不把现有支付先切断，也不推出没有对应真实订单的金额选项。手机号登录、金额钱包、新充值档位及移除用户TokenPay均尚未实现/切换。
