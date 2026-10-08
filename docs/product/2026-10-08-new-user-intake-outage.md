# 新用户材料整理503：定位、降级与恢复边界

## 生产根因

当前发布dpl_EyvEpRCoxuZ79hG6joLwqBcJaRm2的生产日志显示三次POST /api/opportunities/analyze失败，上游DeepSeek均返回402 Insufficient Balance，接口包装为503。站点免费用户走DeepSeek自带密钥，不是用户免费次数不足；已连接TokenPay用户走自己的授权通道，不是同一问题。未发现本轮六源或面试改动涉及此模型配置。生产环境变量名称核查只有DEEPSEEK_API_KEY，无OPENAI_API_KEY或其他站点备用密钥；没有充值或借用个人TokenPay凭据。

## 修复

站点余额耗尽时，已提取的材料可继续被接收：已明确的岗位/简历按原分类保留，未知粘贴材料进入待确认档案的来源备注，不猜公司、岗位、不将JD冒充简历。返回analysis=null、analysisDeferred=true、reasonCode=hosted_provider_quota、retryable=false；退还本次预留免费次数，不伪造模型结论，不提示用户为站点余额充值。用户自己的TokenPay恢复错误仍保留原语义，验证/读取错误不伪装为成功。

## 验收与未恢复项

新增余额错误回归及合成新账号脚本verify-intake-outage.mjs，覆盖原文接收、免费次数保留、云端保存和重新GET。测试账号不代表外部活跃用户，凭据仅在进程内，finally仅删除该合成账号及其级联记录。

这是材料接收降级修复，不是恢复真实AI整理/导师/面试。站点仍须补充DeepSeek余额或配置并验收可用站点备用模型；没有资金授权不能自动充值。新用户只交JD且公司/职位未被识别时，降级成待确认来源档案，不宣称已完整建立该岗位。完整冷启动和真实面试验收继续保持未签收。
