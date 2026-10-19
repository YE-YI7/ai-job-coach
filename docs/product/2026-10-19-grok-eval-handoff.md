# 交给 Grok：简历候选盲评

只读以下三个目录的README与JSON。它们全是明确虚构的输入与匿名候选，不含原用户简历、联系方式、凭据、策略名称或成本。不要读父目录、答案键、其他报告、产品业务数据或模型配置；不要改代码、调用业务/支付/模型API或部署。

1. `/Users/yi/Documents/Codex/yizhi-resume-block-repair-1016/docs/architecture/evals/workflow-ef89ed0e-4c3f-45a9-85f0-751500124c45/grok-blind/`
2. `/Users/yi/Documents/Codex/yizhi-resume-block-repair-1016/docs/architecture/evals/workflow-330840f5-c387-4c7a-be56-b803795c4566/grok-blind/`
3. `/Users/yi/Documents/Codex/yizhi-resume-block-repair-1016/docs/architecture/evals/workflow-a1216d4e-2567-4fba-b2b3-73a5ec8375be/grok-blind/`

逐包独立判断，不能把不同批次混成排行榜。同一caseKey重复出现时分别评，不先看前次评分。先对匿名候选A/B/C逐项评估，再交换候选顺序重评，保留分歧。请不要读这个文件以外的实施文档来猜方案。

先判事实硬风险：有没有编造、职责拔高、把提案/原型变成落地、错误删掉必要限定；引用原文与候选的具体片段，无法判断用unknown。再分别给0–4分与证据：实际内容改善、具体动作/交付、整稿自洽与取舍、原格式一致、不过度改写、提问的单一性/必要性。没有数字不扣分，硬凑数字要判风险；专业词多、长、短都不能直接加分。未交付稿不编内容分，要记录不可交付。

每个包只新增自己的 `review.json`，结构可用 `{reviews:[{caseKey,tag,groundingVeto,evidence,dimensions:[{name,score,maxScore:4,reason}],unknown,orderSwapConsistent}],notes:[]}`。只交判断和问题，不重写候选，不修改已有JSON和README。交付时给文件清单与整体观察，不能宣称通过保存刷新/PDF或可以上线。这些由Codex联验。
