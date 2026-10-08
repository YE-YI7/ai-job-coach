# 真实搜岗失败修复

## 证据与根因

用户提供runId=354e7a7e-43bb-4097-a311-f40697e75caa。只读任务与事件证明：公开搜索读取184条、来源0失败，search步骤完成，screen步骤失败；对应生成事件provider=stepfun/model=step-3.7-flash，14.420秒后empty_response。生产日志三次POST均出现Empty response from LLM (finish_reason=length)。恢复接口GET返回200是成功读到失败任务，不是POST评审成功。

前轮恢复了材料整理与导师，但遗漏搜岗评审的1400-token预算：Step的完成预算含推理，最终JSON尚未生成即耗尽。不是来源没岗位，也没有证据表明数据库写入坏了。官方Step3.7文档仅支持low/medium/high推理强度，不能把服务端对none/minimal的宽容接受当成真正关闭推理。

## 本次改动

搜岗一次评审保持最终输出目标1400，Step额外推理allowance至多4096，合计上限5496；TokenPay/DeepSeek预算不扩大，不换用户选择的模型。SDK截止时间遵循声明的timeoutMs，评审45秒、整条路由120秒，避免SDK默认30秒先终止。一轮仍一次模型调用，证据引用/资格冲突/最多5条推荐核验不撤掉；失败退款，不拿未评审的岗位假装个性化成功。评审版本v7隔离旧结果。

任务失败分为assessment_output_limit/assessment_failed及搜索或保存失败，记录screen步骤与runId。失败任务读取返回可重试说明，POST评审失败502，不再误写“结果保存失败”。不修改这次原测试账号的简历、任务或剩余额度。

## 验证门

新增预算隔离与输出耗尽失败回归，verify-hosted-discovery.mjs将用合成仅剩1次免费账号调用真实来源与真实模型：至少8条进入评审、1至5条有引用产物、恢复GET一致、同requestId重放不多扣/不重复模型调用，清理合成数据。真实测试结果与发布ID执行后追加；不凭代码/单元测试宣称修好。

官方参数依据：https://platform.stepfun.com/docs/zh/guides/models/step-3.7-flash
