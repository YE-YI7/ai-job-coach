# Requirements Document: UI/UX Upgrade & Feature Enhancements

## Introduction

本文档定义了职业规划AI助手应用的UI/UX全面升级和功能增强需求。该升级包括视觉系统重构、交互优化、智能白板功能、面试系统改进等多个方面，旨在提供更专业、更流畅的用户体验。

## Glossary

- **System**: 职业规划AI助手应用
- **User**: 使用系统进行职业规划的用户
- **Stage**: 职业规划的7个阶段（职业规划、项目梳理、简历优化、投递策略、面试辅导、谈薪策略、Offer）
- **StageSelector**: 阶段选择器组件，全屏显示7个阶段卡片
- **ChatFlow**: 聊天流组件，显示AI对话和用户消息
- **Whiteboard**: 智能白板，以便利贴形式展示关键信息
- **WhiteboardCanvas**: 白板画布视图，支持拖拽和自定义便利贴
- **MessageBubble**: 消息气泡组件，显示用户和AI的对话
- **Glassmorphism**: 玻璃拟态设计风格，使用半透明背景和模糊效果
- **Quick_Replies**: 追问建议，基于AI回复内容生成的快速回复按钮
- **Interview_Session**: 面试会话，包含配置、问题、回答、评价和总结

## Requirements

### Requirement 1: 阶段选择器布局优化

**User Story:** 作为用户，我希望阶段选择器的卡片布局更加平衡，左右留白均匀，卡片大小适中，以便我能清晰地看到所有阶段选项。

#### Acceptance Criteria

1. WHEN 显示阶段选择器 THEN THE System SHALL 使用全屏固定布局（fixed inset-0）
2. WHEN 渲染阶段卡片 THEN THE System SHALL 使用统一的左右padding（px-12）确保对称留白
3. WHEN 渲染阶段卡片 THEN THE System SHALL 增大卡片尺寸（padding: p-4, icon: text-3xl, title: text-lg）
4. WHEN 显示阶段选择器 THEN THE System SHALL 确保所有7个阶段卡片在视口内可见，无需滚动
5. WHEN 用户从特殊页面返回 THEN THE System SHALL 通过localStorage标记（ajc_showStageSelector）显示阶段选择器

### Requirement 2: AI对话输出优化

**User Story:** 作为用户，我希望AI的回复既有引导性的提问，也有实质性的建议和分析，避免过度使用苏格拉底式提问。

#### Acceptance Criteria

1. WHEN AI生成回复 THEN THE System SHALL 根据对话轮次平衡提问和建议的比例
2. WHEN 对话处于初期（1-2轮） THEN THE System SHALL 使用30-50字的简短探索性问题
3. WHEN 对话处于中期（3-5轮） THEN THE System SHALL 使用80-200字的分析和引导
4. WHEN 对话超过3轮 THEN THE System SHALL 强制提供实质性分析和建议（150-300字）
5. WHEN AI回复 THEN THE System SHALL 包含阶段聚焦机制，只讨论当前阶段相关内容
6. WHEN 当前阶段目标达成 THEN THE System SHALL 自动推荐下一阶段并提供明确的推荐语

### Requirement 3: 阶段聚焦与推荐机制

**User Story:** 作为用户，我希望AI在每个阶段只讨论该阶段的内容，并在合适的时候推荐我进入下一阶段。

#### Acceptance Criteria

1. WHEN 用户处于某个阶段 THEN THE System SHALL 确保AI只讨论该阶段的内容
2. WHEN 当前阶段目标完成 THEN THE System SHALL 在回复中包含明确的下一阶段推荐
3. WHEN 推荐下一阶段 THEN THE System SHALL 使用特定的推荐短语（如"建议进入下一阶段"）
4. THE System SHALL 维护阶段进度：career_planning → project_review → resume_optimization → application_strategy → interview → salary_talk/offer
5. WHEN 用户选择新阶段 THEN THE System SHALL 发送该阶段的开场白

### Requirement 4: 面试记录持久化

**User Story:** 作为用户，我希望我的面试记录能够永久保存，即使刷新页面或关闭浏览器后也能恢复。

#### Acceptance Criteria

1. WHEN 面试页面初始化 THEN THE System SHALL 从localStorage恢复历史面试记录
2. WHEN 面试消息更新 THEN THE System SHALL 自动保存到localStorage（interview_messages）
3. WHEN 恢复面试记录 THEN THE System SHALL 正确转换时间戳为Date对象
4. WHEN 添加新面试记录 THEN THE System SHALL 追加到现有记录，而非替换
5. WHEN 用户开始新面试 THEN THE System SHALL 保留历史记录并追加新的配置卡片

### Requirement 5: 面试页面交互优化

**User Story:** 作为用户，我希望面试页面的布局固定，输入栏和白板不会随滚动移动，AI生成过程不会因页面切换而中断。

#### Acceptance Criteria

1. WHEN 显示面试页面 THEN THE System SHALL 使用Flexbox布局（h-screen overflow-hidden）
2. WHEN 渲染消息区域 THEN THE System SHALL 使用flex-1 overflow-y-auto确保独立滚动
3. WHEN 渲染输入栏 THEN THE System SHALL 使用flex-shrink-0固定在底部
4. WHEN AI生成回复中 THEN THE System SHALL 保存生成状态到localStorage（interview_pending_generation）
5. WHEN 页面重新加载 THEN THE System SHALL 恢复未完成的生成状态并继续
6. WHEN 生成完成或失败 THEN THE System SHALL 清除待处理标记
7. WHEN 显示配置卡片 THEN THE System SHALL 只在用户点击"开始面试"时添加一次

### Requirement 6: 视觉系统升级 - 双色系统

**User Story:** 作为用户，我希望应用具有统一的视觉风格，使用专业的配色方案和现代的设计元素。

#### Acceptance Criteria

1. THE System SHALL 使用双色系统：橙色（#EF6820）用于主要操作，蓝色（#6366F1）用于链接和AI标签
2. THE System SHALL 在全局样式中定义CSS变量（--color-primary-orange, --color-primary-blue等）
3. THE System SHALL 使用玻璃拟态效果（glassmorphism）：半透明背景、backdrop-blur、边框
4. THE System SHALL 定义统一的阴影系统（shadow-sm, shadow-md, shadow-lg, shadow-xl）
5. THE System SHALL 使用渐变背景增强视觉层次（gradient-to-br, gradient-to-r）

### Requirement 7: 视觉系统升级 - 动画系统

**User Story:** 作为用户，我希望界面元素有流畅的动画效果，提供"呼吸感"和专业度。

#### Acceptance Criteria

1. THE System SHALL 定义全局动画：fade-in（淡入）、slide-in（滑入）、scale-in（缩放）、pop（弹出）
2. WHEN 消息出现 THEN THE System SHALL 使用slide动画（用户消息从右滑入，AI消息从左滑入）
3. WHEN 卡片出现 THEN THE System SHALL 使用scale-in动画
4. WHEN 按钮悬停 THEN THE System SHALL 使用hover:scale-[1.02]微缩放效果
5. WHEN AI正在生成 THEN THE System SHALL 显示3个跳动的圆点（animate-bounce with staggered delay）
6. THE System SHALL 使用transition-all确保所有状态变化平滑过渡

### Requirement 8: 组件升级 - MessageBubble

**User Story:** 作为用户，我希望消息气泡具有现代化的设计，AI和用户消息有明确的视觉区分。

#### Acceptance Criteria

1. WHEN 显示AI消息 THEN THE System SHALL 使用白色背景和灰色边框的头像（bg-white border-2 border-gray-200）
2. WHEN AI头像加载失败 THEN THE System SHALL 显示灰色"AI"文字（text-gray-700）
3. WHEN 显示AI消息 THEN THE System SHALL 在头像上显示绿色在线指示器
4. WHEN 显示用户消息 THEN THE System SHALL 使用蓝色渐变背景（from-blue-500 to-indigo-600）
5. WHEN 显示用户消息 THEN THE System SHALL 使用黑色文字（text-gray-900）提高可读性
6. WHEN 显示消息 THEN THE System SHALL 包含时间戳和时钟图标
7. WHEN AI消息流式生成 THEN THE System SHALL 使用StreamingText组件显示打字机效果

### Requirement 9: 组件升级 - StageSelector

**User Story:** 作为用户，我希望阶段选择器具有进度指示和视觉反馈，清晰展示我的学习路径。

#### Acceptance Criteria

1. WHEN 显示阶段卡片 THEN THE System SHALL 使用玻璃拟态效果和渐变背景
2. WHEN 显示阶段之间的连接 THEN THE System SHALL 使用实线表示已完成，虚线表示待完成
3. WHEN 显示阶段图标 THEN THE System SHALL 使用渐变背景容器（gradient-to-br）
4. WHEN 阶段已完成 THEN THE System SHALL 显示绿色徽章（bg-green-500）
5. WHEN 阶段进行中 THEN THE System SHALL 显示蓝色徽章（bg-blue-500）
6. WHEN 卡片出现 THEN THE System SHALL 使用pop动画（animate-pop）
7. WHEN 鼠标悬停 THEN THE System SHALL 使用hover-lift效果（transform scale和shadow增强）

### Requirement 10: 组件升级 - InputBar

**User Story:** 作为用户，我希望输入栏具有现代化的设计，提供清晰的视觉反馈和便捷的操作。

#### Acceptance Criteria

1. WHEN 显示输入栏 THEN THE System SHALL 使用玻璃拟态效果（glass-card bg-white/95 backdrop-blur-md）
2. WHEN 显示上传按钮 THEN THE System SHALL 使用SVG图标和hover效果（hover:text-orange-500 hover:bg-orange-50）
3. WHEN 显示输入框 THEN THE System SHALL 支持自动高度调整（max-h-48）
4. WHEN 显示发送按钮 THEN THE System SHALL 使用橙色渐变背景（from-orange-500 to-amber-500）
5. WHEN 正在加载 THEN THE System SHALL 显示旋转的加载图标（animate-spin）
6. WHEN 输入框聚焦 THEN THE System SHALL 显示蓝色聚焦环（focus:ring-2 focus:ring-blue-400/30）

### Requirement 11: 智能白板画布功能

**User Story:** 作为用户，我希望白板以画布形式展示关键信息，支持拖拽定位和创建自定义便利贴。

#### Acceptance Criteria

1. WHEN 显示白板 THEN THE System SHALL 默认使用画布视图（WhiteboardCanvas），不提供列表/画布切换
2. WHEN 显示白板工具栏 THEN THE System SHALL 提供"新建便利贴"按钮（+图标）
3. WHEN 用户点击"新建便利贴" THEN THE System SHALL 创建可编辑的自定义便利贴
4. WHEN 创建便利贴 THEN THE System SHALL 使用默认标题"新便利贴"和内容"点击编辑内容..."
5. WHEN 显示便利贴 THEN THE System SHALL 支持拖拽定位（使用Framer Motion）
6. WHEN 便利贴位置改变 THEN THE System SHALL 自动保存到localStorage（whiteboard_positions_{stage}）
7. WHEN 显示白板工具栏 THEN THE System SHALL 提供"重置布局"按钮，使用瀑布流算法重新排列
8. WHEN 白板无数据 THEN THE System SHALL 显示空状态提示

### Requirement 12: 智能追问建议

**User Story:** 作为用户，我希望在AI回复后看到简洁的追问建议，帮助我快速继续对话。

#### Acceptance Criteria

1. WHEN AI回复完成 THEN THE System SHALL 在输入框上方显示追问建议按钮
2. WHEN 生成追问建议 THEN THE System SHALL 基于AI回复内容的关键词匹配生成
3. WHEN AI回复包含"项目"或"经历" THEN THE System SHALL 生成"能详细说说吗？"、"有具体的例子吗？"
4. WHEN AI回复包含"简历"或"优化" THEN THE System SHALL 生成"还有其他建议吗？"、"如何具体实施？"
5. WHEN AI回复包含"面试"或"准备" THEN THE System SHALL 生成"需要注意什么？"、"如何更好地表达？"
6. WHEN AI回复包含"公司"或"岗位" THEN THE System SHALL 生成"还有其他推荐吗？"、"如何提高匹配度？"
7. WHEN 无特定关键词 THEN THE System SHALL 生成通用追问："能展开讲讲吗？"、"有什么建议？"、"下一步该怎么做？"
8. THE System SHALL 最多显示3个追问建议
9. WHEN 用户点击追问建议 THEN THE System SHALL 自动填充并发送该内容
10. WHEN 用户正在输入或AI正在生成 THEN THE System SHALL 隐藏追问建议

### Requirement 13: StreamingText组件

**User Story:** 作为用户，我希望AI的回复以打字机效果逐字显示，提供更自然的对话体验。

#### Acceptance Criteria

1. WHEN AI消息流式生成 THEN THE System SHALL 使用StreamingText组件
2. WHEN 显示流式文本 THEN THE System SHALL 以30ms/字符的速度逐字显示
3. WHEN 显示流式文本 THEN THE System SHALL 在末尾显示闪烁的光标（animate-blink）
4. WHEN 流式文本完成 THEN THE System SHALL 触发onComplete回调
5. WHEN 流式文本完成 THEN THE System SHALL 移除光标

### Requirement 14: NextActionChips组件（已废弃）

**User Story:** 作为开发者，我需要了解NextActionChips组件已被简化的追问建议替代。

#### Acceptance Criteria

1. THE System SHALL NOT 使用NextActionChips组件显示大卡片式建议
2. THE System SHALL 使用简洁的追问建议按钮替代NextActionChips
3. THE System SHALL 保留NextActionChips组件代码以备将来使用

### Requirement 15: 面试配置卡片优化

**User Story:** 作为用户，我希望面试配置卡片只在我点击"开始面试"时出现一次，不会重复显示。

#### Acceptance Criteria

1. WHEN 用户点击"开始面试" THEN THE System SHALL 添加一次配置卡片到消息列表
2. WHEN 面试总结生成完成 THEN THE System SHALL NOT 自动添加新的配置卡片
3. WHEN 用户想开始新一轮面试 THEN THE System SHALL 要求用户手动滚动到配置区域并点击"开始面试"
4. WHEN 页面初始化且无历史记录 THEN THE System SHALL 显示空白配置表单，不自动添加配置卡片

### Requirement 16: 跨页面导航优化

**User Story:** 作为用户，我希望从特殊页面（面试、简历编辑器）返回时能看到阶段选择器，而不是直接进入聊天页面。

#### Acceptance Criteria

1. WHEN 用户从面试页面点击返回 THEN THE System SHALL 设置localStorage标记（ajc_showStageSelector=true）
2. WHEN 用户从简历编辑器点击返回 THEN THE System SHALL 设置localStorage标记（ajc_showStageSelector=true）
3. WHEN 聊天页面加载 THEN THE System SHALL 检查localStorage标记
4. WHEN localStorage标记存在 THEN THE System SHALL 显示阶段选择器并清除标记
5. WHEN 用户选择阶段 THEN THE System SHALL 隐藏阶段选择器并进入该阶段的聊天

### Requirement 17: 便利贴颜色系统

**User Story:** 作为用户，我希望不同类型的信息使用不同颜色的便利贴，便于快速识别。

#### Acceptance Criteria

1. WHEN 显示求职岗位 THEN THE System SHALL 使用青色便利贴（cyan）
2. WHEN 显示核心技能 THEN THE System SHALL 使用蓝色便利贴（blue）
3. WHEN 显示STAR项目 THEN THE System SHALL 使用紫色便利贴（purple）
4. WHEN 显示简历优化建议 THEN THE System SHALL 使用绿色便利贴（green）
5. WHEN 显示面试报告 THEN THE System SHALL 使用橙色便利贴（orange）
6. WHEN 显示目标公司 THEN THE System SHALL 使用黄色便利贴（yellow）
7. WHEN 显示薪资策略 THEN THE System SHALL 使用靛蓝色便利贴（indigo）
8. WHEN 显示Offer THEN THE System SHALL 使用翠绿色便利贴（emerald）
9. WHEN 显示自定义便利贴 THEN THE System SHALL 使用黄色便利贴（yellow）

### Requirement 18: 响应式设计

**User Story:** 作为用户，我希望应用在不同设备上都能正常使用，提供良好的移动端体验。

#### Acceptance Criteria

1. WHEN 在桌面端显示 THEN THE System SHALL 使用两栏布局（聊天70% + 白板30%）
2. WHEN 在移动端显示 THEN THE System SHALL 隐藏白板，只显示聊天区域
3. WHEN 在移动端显示 THEN THE System SHALL 提供白板切换按钮
4. WHEN 消息气泡宽度 THEN THE System SHALL 限制最大宽度为80%
5. WHEN 阶段选择器在移动端 THEN THE System SHALL 使用单列布局

### Requirement 19: 性能优化

**User Story:** 作为用户，我希望应用响应迅速，动画流畅，不会出现卡顿。

#### Acceptance Criteria

1. WHEN 渲染大量消息 THEN THE System SHALL 使用虚拟滚动或分页加载
2. WHEN 保存数据到localStorage THEN THE System SHALL 使用debounce避免频繁写入
3. WHEN 分析对话 THEN THE System SHALL 使用1秒debounce避免频繁API调用
4. WHEN 使用动画 THEN THE System SHALL 使用CSS transform和opacity确保GPU加速
5. WHEN 加载图片 THEN THE System SHALL 提供fallback和错误处理

### Requirement 20: 可访问性

**User Story:** 作为有特殊需求的用户，我希望应用具有良好的可访问性，支持键盘导航和屏幕阅读器。

#### Acceptance Criteria

1. WHEN 使用键盘 THEN THE System SHALL 支持Tab键在交互元素间导航
2. WHEN 使用键盘 THEN THE System SHALL 支持Enter键发送消息
3. WHEN 使用键盘 THEN THE System SHALL 支持Shift+Enter换行
4. WHEN 使用屏幕阅读器 THEN THE System SHALL 为图标按钮提供aria-label
5. WHEN 显示加载状态 THEN THE System SHALL 提供aria-live区域通知用户
6. WHEN 显示错误 THEN THE System SHALL 使用role="alert"确保屏幕阅读器读取

## Non-Functional Requirements

### Performance

1. 页面首次加载时间应小于2秒
2. 消息发送到AI回复显示应小于3秒（不含AI生成时间）
3. 动画帧率应保持在60fps
4. localStorage读写操作应小于100ms

### Scalability

1. 支持单个会话最多1000条消息
2. 支持白板最多100个便利贴
3. 支持面试记录最多50轮对话

### Maintainability

1. 所有组件应使用TypeScript编写，提供完整的类型定义
2. 所有样式应使用Tailwind CSS，避免自定义CSS
3. 所有动画应使用CSS或Framer Motion，避免JavaScript动画
4. 所有状态管理应使用React Hooks，避免全局状态库

### Security

1. 所有用户数据应存储在localStorage，不发送到第三方服务
2. 所有API调用应包含用户认证信息
3. 所有用户输入应进行XSS防护

### Compatibility

1. 支持Chrome、Firefox、Safari、Edge最新版本
2. 支持iOS Safari 14+和Android Chrome 90+
3. 支持屏幕分辨率1280x720及以上

## Success Metrics

1. 用户完成阶段选择的成功率 > 95%
2. 用户使用追问建议的比例 > 30%
3. 用户创建自定义便利贴的比例 > 20%
4. 面试记录恢复成功率 > 99%
5. 页面加载性能评分（Lighthouse） > 90
6. 用户满意度评分 > 4.5/5

## Future Enhancements

1. 支持语音输入和语音回复
2. 支持多语言（英文、日文）
3. 支持导出白板为PDF或图片
4. 支持团队协作和分享
5. 支持AI模型选择（GPT-4、Claude等）
6. 支持主题切换（浅色/深色模式）
7. 支持便利贴模板库
8. 支持面试录音和回放
