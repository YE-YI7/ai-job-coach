# AI 求职教练 - 设计系统规范

## 🎨 设计理念

**专业 · 温暖 · 高效**

- **专业性**：使用简洁的设计语言，传达可信赖的专业形象
- **温暖感**：通过柔和的色彩和圆润的形状，营造友好的氛围
- **高效性**：清晰的视觉层次，帮助用户快速完成任务

---

## 🎨 色彩系统

### 主色调 (Primary)
```css
--primary-50: #EFF6FF;   /* 最浅蓝 */
--primary-100: #DBEAFE;  /* 浅蓝 */
--primary-200: #BFDBFE;  /* 
--primary-300: #93C5FD;  
--primary-400: #60A5FA;  
--primary-500: #3B82F6;  /* 主蓝色 */
--primary-600: #2563EB;  /* 深蓝 */
--primary-700: #1D4ED8;  
--primary-800: #1E40AF;  
--primary-900: #1E3A8A;  /* 最深蓝 */
```

### 辅助色 (Secondary)
```css
--secondary-50: #FFF7ED;   /* 最浅橙 */
--secondary-100: #FFEDD5;  
--secondary-200: #FED7AA;  
--secondary-300: #FDBA74;  
--secondary-400: #FB923C;  
--secondary-500: #F97316;  /* 主橙色 */
--secondary-600: #EA580C;  
--secondary-700: #C2410C;  
--secondary-800: #9A3412;  
--secondary-900: #7C2D12;  
```

### 成功色 (Success)
```css
--success-50: #F0FDF4;
--success-500: #22C55E;  /* 主绿色 */
--success-700: #15803D;
```

### 警告色 (Warning)
```css
--warning-50: #FFFBEB;
--warning-500: #F59E0B;  /* 主黄色 */
--warning-700: #B45309;
```

### 错误色 (Error)
```css
--error-50: #FEF2F2;
--error-500: #EF4444;  /* 主红色 */
--error-700: #B91C1C;
```

### 中性色 (Neutral)
```css
--gray-50: #F9FAFB;    /* 背景色 */
--gray-100: #F3F4F6;   /* 卡片背景 */
--gray-200: #E5E7EB;   /* 边框 */
--gray-300: #D1D5DB;   
--gray-400: #9CA3AF;   /* 禁用文字 */
--gray-500: #6B7280;   /* 次要文字 */
--gray-600: #4B5563;   
--gray-700: #374151;   /* 主要文字 */
--gray-800: #1F2937;   
--gray-900: #111827;   /* 标题 */
```

---

## 📏 间距系统

基于 4px 网格系统：

```css
--spacing-0: 0px;
--spacing-1: 4px;
--spacing-2: 8px;
--spacing-3: 12px;
--spacing-4: 16px;
--spacing-5: 20px;
--spacing-6: 24px;
--spacing-8: 32px;
--spacing-10: 40px;
--spacing-12: 48px;
--spacing-16: 64px;
--spacing-20: 80px;
--spacing-24: 96px;
```

---

## 🔤 字体系统

### 字体家族
```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;
```

### 字体大小
```css
--text-xs: 12px;      /* 辅助信息 */
--text-sm: 14px;      /* 次要文字 */
--text-base: 16px;    /* 正文 */
--text-lg: 18px;      /* 小标题 */
--text-xl: 20px;      /* 标题 */
--text-2xl: 24px;     /* 大标题 */
--text-3xl: 30px;     /* 页面标题 */
--text-4xl: 36px;     /* 特大标题 */
```

### 字重
```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### 行高
```css
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

---

## 🔲 圆角系统

```css
--radius-sm: 6px;      /* 小元素 */
--radius-md: 8px;      /* 按钮、输入框 */
--radius-lg: 12px;     /* 卡片 */
--radius-xl: 16px;     /* 大卡片 */
--radius-2xl: 20px;    /* 模态框 */
--radius-full: 9999px; /* 圆形 */
```

---

## 🌑 阴影系统

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
```

---

## ⚡ 动画系统

### 过渡时长
```css
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 350ms;
```

### 缓动函数
```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

---

## 🎯 组件规范

### 按钮

#### 主要按钮 (Primary)
- 背景：`primary-500` → `primary-600` (hover)
- 文字：白色
- 圆角：`radius-lg`
- 内边距：`12px 24px`
- 阴影：`shadow-sm` → `shadow-md` (hover)

#### 次要按钮 (Secondary)
- 背景：白色
- 边框：`gray-300`
- 文字：`gray-700`
- 圆角：`radius-lg`
- 内边距：`12px 24px`

#### 文字按钮 (Text)
- 背景：透明
- 文字：`primary-600`
- 无边框
- 内边距：`8px 16px`

### 输入框
- 背景：白色
- 边框：`gray-300` → `primary-500` (focus)
- 圆角：`radius-lg`
- 内边距：`12px 16px`
- 阴影：`shadow-sm`

### 卡片
- 背景：白色
- 边框：`gray-200`
- 圆角：`radius-xl`
- 内边距：`24px`
- 阴影：`shadow-sm` → `shadow-md` (hover)

### 消息气泡

#### 用户消息
- 背景：`primary-500`
- 文字：白色
- 圆角：`radius-lg` (左上、左下、右上)
- 对齐：右侧

#### AI 消息
- 背景：`gray-100`
- 文字：`gray-900`
- 圆角：`radius-lg` (左上、右上、右下)
- 对齐：左侧

---

## 📱 响应式断点

```css
--breakpoint-sm: 640px;   /* 手机 */
--breakpoint-md: 768px;   /* 平板 */
--breakpoint-lg: 1024px;  /* 笔记本 */
--breakpoint-xl: 1280px;  /* 桌面 */
--breakpoint-2xl: 1536px; /* 大屏 */
```

---

## ♿ 无障碍规范

### 对比度
- 正文文字：至少 4.5:1
- 大文字（18px+）：至少 3:1
- UI 组件：至少 3:1

### 焦点状态
- 所有可交互元素必须有清晰的焦点指示
- 焦点环：`2px solid primary-500`，偏移 `2px`

### 键盘导航
- 所有功能必须可通过键盘访问
- Tab 顺序符合逻辑

---

## 🎭 使用场景

### 职业规划阶段
- 主色：蓝色系（专业、信任）
- 强调：目标、规划

### 项目梳理阶段
- 主色：紫色系（创造、成就）
- 强调：经验、亮点

### 简历优化阶段
- 主色：绿色系（成长、优化）
- 强调：改进、提升

### 面试辅导阶段
- 主色：橙色系（活力、自信）
- 强调：准备、表现

### 薪资谈判阶段
- 主色：金色系（价值、回报）
- 强调：策略、谈判

---

## 📋 设计检查清单

- [ ] 色彩对比度符合 WCAG AA 标准
- [ ] 所有交互元素有清晰的悬停和激活状态
- [ ] 间距使用 4px 网格系统
- [ ] 圆角大小一致
- [ ] 阴影层次清晰
- [ ] 动画流畅自然
- [ ] 响应式布局适配各种屏幕
- [ ] 支持键盘导航
- [ ] 加载状态明确
- [ ] 错误提示友好

---

## 🔄 版本历史

- v1.0.0 (2025-01-01) - 初始设计系统建立
