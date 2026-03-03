# 面试复盘页面 TODO（MVP -> V2）

## 0. 产品目标
- 打造一个简洁美观的 `面试复盘` 页面（非 ToB 报表风），支持：
  - 一题一卡片（Q1、Q2...）
  - 整场面试一张汇总卡片
  - 用户自定义标签（不写死）
  - 多角色对话式点评（6个独立角色，非统一HR）
  - 历史记录查询（按公司/轮次/时间/标签）
  - 基于问题弱项的针对性追问出题
  - 隐私合规独立页面

---

## 1. 信息架构与入口
- [x] 面试阶段入口新增双分支：`模拟面试` / `面试复盘` ✅ 双分支选择界面
- [x] 面试复盘首页包含基础信息卡片：
  - [x] 面试公司（可选匿名显示）
  - [x] 面试时间
  - [x] 轮次（一面/二面/HR面/终面 — 用户也可自定义输入）
  - [x] 上传本次面试投递简历（文件）
  - [x] 或从简历阶段历史版本中选择一份简历 ✅ 简历选择器UI + 关联API + 历史简历列表
  - [x] 自定义标签输入（用户自己写，如"字节跳动"、"后端"、"紧张"等）
- [x] 基础信息提交后，弹出"一键粘贴面试内容"卡片
- [x] 底部隐私声明链接 → 跳转独立隐私政策页

---

## 2. 数据输入与解析
- [x] 支持面试内容输入：
  - [x] 一键粘贴文本（MVP 主入口）
  - [ ] OCR 图片/PDF（V2）
- [x] 解析流程（Parser Agent）：
  - [x] 自动切分为 `Q1...Qn`
  - [x] 每题包含：原问题、原回答
  - [x] 解析预览可手动编辑（修正切分错误）
- [x] 标签自动推荐 + 用户自定义：
  - [x] AI 自动推荐标签（如：项目深挖、行为面、系统设计等）
  - [x] 用户可删除推荐标签
  - [x] 用户可自由添加任意标签
  - [x] 标签保存在 session 级别，历史可筛选

---

## 3. 角色体系（6个多元化角色）

### 3.1 设计原则
- **命名风格**：简短 2~4 字母，有记忆点，跨文化友好
- **插画风格**：全身简约矢量，透明底，浅色基底+轻渐变，圆润几何，lucide-react 线性图标风格，符合项目 UI 风格
- **职责清晰**：每个角色在面试复盘中负责明确的具体任务，不重复
- **鲜明个性**：每个角色有独特的说话风格和专业视角

### 3.2 角色列表

| # | 名称 | 人设标签 | 职责 | 性格与风格 | 主色 |
|---|---|---|---|---|---|
| 1 | **Kay** | 大厂技术总监 | 负责诊断技术短板，指出技术深度不足和系统思维缺失，追问架构设计思路 | 犀利直接，15年大厂经验，关注技术深度和系统思维 | 靛蓝 #4f46e5 |
| 2 | **Mia** | 面霸学姐 | 负责给出标准/参考答案，分享面试话术和通关技巧，提供高分回答模板 | 亲切鼓励，拿过8个顶级Offer，善于从面试者角度给建议 | 翠绿 #059669 |
| 3 | **Rex** | 创业公司CTO | 负责评估项目实战能力，追问落地细节和量化数据，考察解决问题的思路 | 务实坦率，创业出身，重视落地能力和成长潜力 | 橙色 #ea580c |
| 4 | **Vivi** | 资深猎头 | 负责点评沟通表达和职业形象，从面试官视角解读问题意图，提供软实力建议 | 温柔但毒舌，10年猎头经验，懂人性懂市场 | 紫色 #7c3aed |
| 5 | **Coco** | 同期求职者 | 负责情绪支持和共情，从面试者视角分享真实感受，缓解面试焦虑 | 共情型选手，刚经历求职季，和用户同频 | 珊瑚粉 #f43f5e |
| 6 | **Prof. Lu** | 高校导师 | 负责检验基础功底，纠正原理性错误和逻辑漏洞，确保技术概念理解准确 | 学术严谨，高校CS教授，关注基础功底和逻辑表达 | 琥珀 #b45309 |

### 3.2 角色使用规则
- 每次多角色讨论随机选 **3~4 个角色**参与（不是每次全上6个）
- 根据面试类型智能加权：
  - 技术面/项目深挖 → Kay、Rex 权重高
  - HR面/行为面 → Vivi、Coco 权重高
  - 综合面 → 随机平衡
- 每个角色的发言风格严格遵循人设，不串角色
- 角色间可以互相回应、附和、反驳，增加真实感

### 3.3 生图提示词（项目 UI 风格 · 全身无背景矢量）

> **统一风格要求**：全身人物，无背景（透明底），简约矢量，浅色基底+轻渐变，圆润几何，lucide-react 线性图标风格，圆角设计，轻阴影，中等信息密度，适配现代产品设计风格

#### Kay · 大厂技术总监
**中文**: 全身简约矢量人物，透明底，浅色基底，轻渐变，靛蓝色系(#4f46e5)，男性角色，短发戴黑框眼镜，穿深蓝衬衫，双手抱胸，微蹙眉审视表情，自信严肃，lucide-react线性图标风格，圆角几何，轻阴影，2D vector，no text，no watermark
**EN**: Full-body minimalist vector character, transparent background, light base with soft gradient, indigo palette (#4f46e5), male character, short hair with black-rimmed glasses, dark blue shirt, arms crossed, slightly furrowed brow analytical expression, confident and serious, lucide-react linear icon style, rounded geometric, light shadow, 2D vector, no text, no watermark

#### Mia · 面霸学姐
**中文**: 全身简约矢量人物，透明底，浅色基底，轻渐变，翠绿色系(#059669)，女性角色，齐肩短发，穿浅绿上衣白裤子，单手竖大拇指，灿烂自信微笑，阳光开朗，lucide-react线性图标风格，圆角几何，轻阴影，2D vector，no text，no watermark
**EN**: Full-body minimalist vector character, transparent background, light base with soft gradient, emerald palette (#059669), female character, shoulder-length hair, light green top white pants, thumbs up gesture, bright confident smile, sunny and cheerful, lucide-react linear icon style, rounded geometric, light shadow, 2D vector, no text, no watermark

#### Rex · 创业公司CTO
**中文**: 全身简约矢量人物，透明底，浅色基底，轻渐变，橙色系(#ea580c)，男性角色，微卷发，穿灰色帽衫牛仔裤运动鞋，单手托下巴思考姿态，放松但专注表情，lucide-react线性图标风格，圆角几何，轻阴影，2D vector，no text，no watermark
**EN**: Full-body minimalist vector character, transparent background, light base with soft gradient, orange palette (#ea580c), male character, slightly curly hair, gray hoodie jeans sneakers, hand on chin thinking pose, relaxed but focused expression, lucide-react linear icon style, rounded geometric, light shadow, 2D vector, no text, no watermark

#### Vivi · 资深猎头
**中文**: 全身简约矢量人物，透明底，浅色基底，轻渐变，紫色系(#7c3aed)，女性角色，优雅盘发戴耳饰，穿紫色西装套装高跟鞋，手持小笔记本，优雅侧身微笑，知性温柔，lucide-react线性图标风格，圆角几何，轻阴影，2D vector，no text，no watermark
**EN**: Full-body minimalist vector character, transparent background, light base with soft gradient, violet palette (#7c3aed), female character, elegant updo with earrings, purple blazer suit heels, holding small notebook, elegant side pose with smile, intellectual and warm, lucide-react linear icon style, rounded geometric, light shadow, 2D vector, no text, no watermark

#### Coco · 同期求职者
**中文**: 全身简约矢量人物，透明底，浅色基底，轻渐变，珊瑚粉色系(#f43f5e)，女性角色，扎马尾，穿白T恤牛仔外套背双肩包，挥手打招呼姿态，活泼有点紧张但积极的表情，青春活力，lucide-react线性图标风格，圆角几何，轻阴影，2D vector，no text，no watermark
**EN**: Full-body minimalist vector character, transparent background, light base with soft gradient, coral pink palette (#f43f5e), female character, ponytail hair, white tee denim jacket backpack, waving hello gesture, energetic slightly nervous but eager expression, youthful and vibrant, lucide-react linear icon style, rounded geometric, light shadow, 2D vector, no text, no watermark

#### Prof. Lu · 高校导师
**中文**: 全身简约矢量人物，透明底，浅色基底，轻渐变，琥珀色系(#b45309)，男性角色，花白头发戴圆形金丝眼镜，穿棕色格子西装打领结，一手推眼镜一手拿书本，慈祥但严谨微笑，学者气质，lucide-react线性图标风格，圆角几何，轻阴影，2D vector，no text，no watermark
**EN**: Full-body minimalist vector character, transparent background, light base with soft gradient, amber palette (#b45309), male character, graying hair round gold glasses, brown plaid blazer bow tie, one hand pushing glasses other holding book, kind but rigorous smile, scholarly vibe, lucide-react linear icon style, rounded geometric, light shadow, 2D vector, no text, no watermark

#### 空状态插图（复盘页面）
**中文**: 空状态插图，透明底，6个上述风格的小人围坐在圆桌讨论，桌上有文件和对话气泡元素，简约矢量，浅色基底+轻渐变，多彩配色（靛蓝+翠绿+橙+紫+珊瑚粉+琥珀），轻松活泼氛围，lucide-react线性图标风格，圆角几何，轻阴影，2D vector，no text
**EN**: Empty state illustration, transparent background, 6 characters in above style sitting around round table discussing, documents and chat bubble elements on table, minimalist vector, light base with soft gradient, colorful palette (indigo+emerald+orange+violet+coral+amber), cheerful atmosphere, lucide-react linear icon style, rounded geometric, light shadow, 2D vector, no text

---

## 4. 复盘结果展示（前端）

### 4.1 整场汇总卡片（简洁）
- [x] 总体表现一句话总结
- [x] 最大短板（1条）
- [x] 最优亮点（1条）
- [x] 本场训练建议（3条以内）
- [x] 一键"加入训练任务"按钮 ✅ AI生成训练任务 + 汇总级/题目级任务展示 + 状态切换/删除
- [x] 用户自定义标签 + AI推荐标签 展示

### 4.2 一题一卡片（主视图）
- [x] 卡片头：`Q序号 + 标签(可编辑) + 小分`
- [x] 卡片内容（默认折叠，点击展开）：
  - [x] 原问题
  - [x] 原回答
  - [x] 多角色对话式点评（3~4个角色参与讨论）
  - [x] 参考答题骨架（不是唯一标准答案）
  - [x] 个性化改写（贴合用户经历/简历）
  - [x] 本题训练任务 TODO ✅ 第4个Tab「训练任务」+ 任务列表 + 勾选/删除
  - [x] 追问面试入口

### 4.3 追问面试（针对性出题）
- [x] 基于本题弱项自动出题：
  - [x] 若检测到结构逻辑差 -> 出复杂分点题
  - [x] 若检测到项目讲不清 -> 连续项目深挖追问
  - [x] 若检测到量化不足 -> 出"结果量化"追问
- [x] 支持连续 2~5 题微型追问链
- [x] 每道追问后即时反馈（结构/深度/说服力） ✅ P8 Prompt + followup-answer API + 前端交互UI

---

## 5. 历史查询（轻量、非 ToB）
- [x] 历史列表页（卡片流）
- [x] 支持筛选：
  - [x] 公司
  - [x] 轮次
  - [x] 时间范围
  - [x] 用户自定义标签
- [x] 支持排序：最近优先 / 提升幅度优先 ✅ 排序按钮（最新/评级）
- [x] 每条历史卡片显示：
  - [x] 公司 + 轮次 + 时间
  - [x] 本场标签（含自定义标签）
  - [x] 一句话复盘摘要
- [x] 点击历史卡片可恢复查看全量 Q 卡片 + 汇总卡片

---

## 6. 后端与数据结构
- [x] 新建实体：`interview_review_sessions`
- [x] ~~新建实体：`interview_review_questions`~~（设计调整：使用 sessions 表 JSONB 列存储，无需独立表）
- [x] 新建实体：`interview_review_followups`
- [x] 新建实体：`interview_review_tasks` ✅ 训练任务表 + CRUD + AI生成
- [x] ~~新建实体：`interview_review_tags`~~（设计调整：标签存储在 sessions.tags TEXT[] 中，无需独立表）
- [x] 查询索引：公司、轮次、时间、标签、用户ID
- [x] API 设计：
  - [x] `POST /api/interview-review/session` — 创建复盘会话
  - [x] `POST /api/interview-review/parse` — 解析面试内容 ✅ 已实现
  - [x] `POST /api/interview-review/analyze` — 多角色分析 ✅ 已实现
  - [x] `POST /api/interview-review/followup` — 追问出题 ✅ 已实现
  - [x] `GET /api/interview-review/history` — 历史列表
  - [x] `GET /api/interview-review/session?id=xxx` — 单场详情
  - [x] `POST /api/interview-review/tags` — 标签CRUD ✅ 设计调整：PATCH /session/tags 更新标签 + GET /session/tags 获取历史标签
  - [x] `DELETE /api/interview-review/session?id=xxx` — 删除单场
  - [x] `DELETE /api/interview-review/history` — 清空所有历史
  - [x] `GET /api/interview-review/followup?session_id=xxx` — 获取追问记录
  - [x] `GET /api/interview-review/tasks` — 训练任务列表 ✅
  - [x] `POST /api/interview-review/tasks` — 生成/添加训练任务 ✅
  - [x] `PATCH /api/interview-review/tasks/[id]` — 更新任务状态 ✅
  - [x] `DELETE /api/interview-review/tasks/[id]` — 删除训练任务 ✅

---

## 7. 合规与安全（必须）
- [x] 上传前提示：不得上传受保密协议限制内容
- [x] 勾选确认：用户确认有处理权限
- [x] 自动脱敏（手机号/邮箱/姓名/链接/明显项目代号） ✅ sanitize.ts + parse API 集成
- [x] 默认不用于模型训练
- [x] 原始文本设置保留期（如 7~30 天），支持手动删除 ✅ expires_at 列 + 清理函数 + deleteRawContent
- [x] 一键清空全部复盘历史
- [x] **隐私政策独立页面** `/privacy` ✅ 已实现：
  - [x] 数据收集范围说明
  - [x] 数据使用方式（仅用于面试复盘分析，不用于模型训练）
  - [x] 数据存储与保留期限
  - [x] 用户权利（查看、删除、导出）
  - [x] 第三方服务说明（LLM API 调用说明）
  - [x] 联系方式

---

## 8. 标签系统设计
- [x] 标签不写死，完全由用户自定义
- [x] AI 自动推荐标签（分析面试内容后推荐，用户可接受/拒绝）
- [x] 推荐标签候选池（AI参考用，非写死）：
  - 项目深挖、结构化表达、业务理解、行为面（BQ）、八股基础、系统设计、反问质量
  - 算法题、场景题、压力面、文化匹配、薪资谈判、自我介绍
- [x] 标签用于历史筛选
- [ ] 标签支持自定义颜色（V2）

---

## 9. UI 风格规范（对齐当前项目）
- [x] 浅色基底（灰白）+ 轻渐变卡片
- [x] 图标统一使用 lucide-react 线性图标（避免 emoji）
- [x] 卡片圆角、轻阴影、微动效（framer-motion）
- [x] 保持信息密度中等，不做大报表
- [x] 角色头像用圆形，带角色配色边框
- [x] 角色发言气泡带角色配色背景

---

## 10. Prompt 体系（9个核心 Prompt）✅ 已全部实现

> 代码位置：`lib/interview-review/prompts.ts`

### P1: Parser Prompt（面试内容解析）✅
- 输入：用户粘贴的原始面试内容
- 输出：结构化 JSON `[{question, answer, estimated_tags}]`
- 要求：容错性强，支持各种格式

### P2: Multi-Role Discussion Prompt（多角色讨论点评）✅
- 输入：单题的 question + answer + 简历(可选) + 参与角色列表
- 输出：JSON `[{speaker, role_id, content}]`
- 要求：3~4角色自然对话，互相回应，各有风格

### P3: Answer Rewrite Prompt（答案改写）✅
- 输入：原问题 + 原回答 + 简历/项目经历
- 输出：贴合用户经历的改写参考答案
- 要求：不是标准答案，是"如果你这么说会更好"

### P4: Follow-up Drill Prompt（追问出题）✅
- 输入：原题 + 用户回答 + 弱点标签
- 输出：2~5道追问题 + 每题考察要点
- 要求：精准命中弱点

### P5: Coach Summary Prompt（整场总结）✅
- 输入：所有题目分析结果 + 标签统计
- 输出：汇总卡片 JSON
- 要求：一句话总结，最大短板/亮点，行动建议

### P6: Tag Recommendation Prompt（标签推荐）✅
- 输入：面试内容
- 输出：推荐标签列表
- 要求：从内容中智能识别面试类型和考察点

### P7: Question Score Prompt（单题打分）✅
- 输入：面试题 + 回答 + 专家讨论要点
- 输出：S/A/B/C/D 评级
- 要求：精准打分

### P8: Follow-up Answer Feedback Prompt（追问回答即时反馈）✅
- 输入：追问题 + 训练方向 + 用户回答 + 原始面试题(可选)
- 输出：评级 + 三维评估（结构/深度/说服力）+ 改进建议
- 要求：15字以内的一行评语，30字以内的建议

### P9: Training Task Generation Prompt（训练任务生成）✅
- 输入：逐题分析结果（问题/评分/共识/已有建议）+ 整场短板 + 改进建议
- 输出：逐题训练任务（1~2个/题）+ 整场综合任务（1~2个）
- 要求：具体可操作，title 20字以内，分 practice/review/drill/expression 四种类型

---

## 11. 已完成的代码文件

| 文件 | 状态 | 说明 |
|---|---|---|
| `lib/interview-review/types.ts` | ✅ | 角色定义（Kay/Mia/Rex/Vivi/Coco/Prof.Lu）、类型、智能选角算法 |
| `lib/interview-review/prompts.ts` | ✅ | 9个核心 Prompt（P1~P9） |
| `lib/interview-review/db.ts` | ✅ | 数据库操作层（Session CRUD、Followup、Training Tasks、标签更新、简历关联、历史标签聚合） |
| `lib/interview-review/index.ts` | ✅ | 统一导出 |
| `lib/interview-review/sanitize.ts` | ✅ | 自动脱敏工具（手机号/邮箱/姓名/链接/IP） |
| `sql/006-interview-review.sql` | ✅ | 数据库建表 SQL（sessions + followups + 索引） |
| `sql/007-interview-review-tasks.sql` | ✅ | 训练任务建表 SQL（tasks + 索引 + RLS） |
| `app/api/interview-review/parse/route.ts` | ✅ | 解析 API（并行调用解析+标签推荐，支持持久化） |
| `app/api/interview-review/analyze/route.ts` | ✅ | 分析 API（逐题讨论+打分+改写+汇总，支持持久化） |
| `app/api/interview-review/followup/route.ts` | ✅ | 追问出题 API + 追问记录查询（GET/POST） |
| `app/api/interview-review/followup-answer/route.ts` | ✅ | 追问回答即时反馈 API（P8 Prompt） |
| `app/api/interview-review/session/route.ts` | ✅ | 会话管理 API（创建/查询/删除） |
| `app/api/interview-review/history/route.ts` | ✅ | 历史列表 API（分页+筛选）+ 清空所有历史 |
| `app/api/interview-review/tasks/route.ts` | ✅ | 训练任务 API（AI生成 + 手动添加 + 列表查询） |
| `app/api/interview-review/tasks/[id]/route.ts` | ✅ | 单个训练任务操作（状态更新 + 删除） |
| `app/api/interview-review/session/tags/route.ts` | ✅ | 标签 CRUD API（PATCH 更新 + GET 历史标签聚合） |
| `app/api/interview-review/session/resume/route.ts` | ✅ | 简历关联 API（PATCH 关联简历 + GET 简历列表） |
| `components/interview-review/RoleAvatarSvg.tsx` | ✅ | 6角色 SVG 形象图标组件（卡通可爱风）+ 空状态插图 |
| `app/interview/review/page.tsx` | ✅ | 前端完整页面（5步流程 + DB持久化 + 训练任务 + 简历关联 + 标签编辑 + SVG头像 + URL会话加载） |
| `app/interview/review/history/page.tsx` | ✅ | 历史记录列表页（卡片流+筛选+分页） |
| `app/privacy/page.tsx` | ✅ | 隐私政策独立页面 |

---

## 12. 里程碑建议
- [x] M1（1周）：基础信息卡片 + 粘贴解析 + Q卡片 + 汇总卡片 + 多角色讨论 + 隐私政策页 ✅ 核心已完成
- [x] M2（1~2周）：用户自定义标签持久化 + 历史筛选查询 + 数据库实体 + 会话持久化 ✅ 核心已完成
- [ ] M3（2周）：OCR + ~~简历关联选择~~ + ~~训练任务系统~~
- [x] M3 大部分完成：追问即时反馈 + 自动脱敏 + 数据保留期 + 历史排序 + 面试入口双分支 + 简历关联选择 + 训练任务系统 + 标签CRUD + 角色SVG形象

---

## 13. 验收标准（MVP）
- [x] 用户可在 3 分钟内完成一场复盘输入并拿到结果
- [x] 至少 90% 解析文本可正确切分为 Q/A（可手动修正）
- [x] 多角色讨论有至少 3 个不同角色参与，风格明显不同
- [x] 标签完全由用户控制（可增删改）
- [x] 可按公司/轮次/时间/标签筛选历史记录
- [x] 每题都有"原回答 + 多角色点评 + 可执行训练任务"
- [x] 隐私政策页面完整可访问
- [x] 支持删除单场与全部历史
