# 设计系统快速开始指南

## 🚀 快速上手

欢迎使用 AI 求职教练设计系统！本指南将帮助你快速了解如何使用设计系统。

---

## 📦 已包含内容

### 1. CSS 变量
所有设计系统变量已在 `app/globals.css` 中定义，可直接使用：

```css
/* 色彩 */
var(--primary-500)    /* 主蓝色 */
var(--secondary-500)  /* 主橙色 */
var(--gray-700)       /* 主要文字色 */

/* 间距 */
var(--spacing-4)      /* 16px */
var(--spacing-6)      /* 24px */

/* 圆角 */
var(--radius-lg)      /* 12px */
var(--radius-xl)      /* 16px */

/* 阴影 */
var(--shadow-sm)      /* 小阴影 */
var(--shadow-md)      /* 中阴影 */
```

### 2. 实用类
预定义的实用类可直接在组件中使用：

```tsx
// 卡片
<div className="card">...</div>

// 按钮
<button className="btn btn-primary">提交</button>
<button className="btn btn-secondary">取消</button>

// 输入框
<input className="input" />

// 徽章
<span className="badge badge-primary">新</span>

// 悬停效果
<div className="hover-lift">...</div>
```

### 3. 动画类
```tsx
<div className="animate-fade-in">淡入</div>
<div className="animate-slide-in">滑入</div>
<div className="animate-scale-in">缩放</div>
<div className="animate-shimmer">闪烁（骨架屏）</div>
```

---

## 🎨 使用示例

### 创建一个卡片

```tsx
<div className="card hover-lift">
  <h3 className="text-xl font-semibold text-gray-900 mb-4">
    标题
  </h3>
  <p className="text-gray-600 leading-relaxed">
    内容文字...
  </p>
  <button className="btn btn-primary mt-4">
    操作按钮
  </button>
</div>
```

### 创建一个表单

```tsx
<form className="space-y-4">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      用户名
    </label>
    <input 
      type="text" 
      className="input" 
      placeholder="请输入用户名"
    />
  </div>
  
  <div className="flex gap-3">
    <button type="submit" className="btn btn-primary flex-1">
      提交
    </button>
    <button type="button" className="btn btn-secondary">
      取消
    </button>
  </div>
</form>
```

### 创建一个加载状态

```tsx
<div className="card">
  <div className="skeleton h-6 w-32 mb-4"></div>
  <div className="skeleton h-4 w-full mb-2"></div>
  <div className="skeleton h-4 w-3/4"></div>
</div>
```

### 创建一个徽章组

```tsx
<div className="flex gap-2">
  <span className="badge badge-primary">进行中</span>
  <span className="badge badge-success">已完成</span>
  <span className="badge badge-warning">待处理</span>
  <span className="badge badge-error">已取消</span>
</div>
```

---

## 🎯 最佳实践

### 1. 使用设计系统变量

❌ **不推荐**
```tsx
<div style={{ 
  background: '#3B82F6',
  padding: '16px 20px',
  borderRadius: '12px'
}}>
```

✅ **推荐**
```tsx
<div style={{ 
  background: 'var(--primary-500)',
  padding: 'var(--spacing-4) var(--spacing-5)',
  borderRadius: 'var(--radius-lg)'
}}>
```

或使用 Tailwind 类：
```tsx
<div className="bg-blue-500 px-5 py-4 rounded-xl">
```

### 2. 保持一致的间距

使用 4px 网格系统：
```tsx
// 间距：4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
<div className="p-4">  {/* 16px */}
<div className="p-6">  {/* 24px */}
<div className="p-8">  {/* 32px */}
```

### 3. 统一的圆角

```tsx
<button className="rounded-lg">   {/* 12px - 按钮 */}
<div className="rounded-xl">      {/* 16px - 卡片 */}
<div className="rounded-2xl">     {/* 20px - 大卡片 */}
<span className="rounded-full">   {/* 圆形 - 徽章 */}
```

### 4. 合理的阴影层次

```tsx
<div className="shadow-sm">   {/* 小阴影 - 输入框 */}
<div className="shadow-md">   {/* 中阴影 - 卡片 */}
<div className="shadow-lg">   {/* 大阴影 - 悬停卡片 */}
<div className="shadow-xl">   {/* 超大阴影 - 模态框 */}
```

### 5. 流畅的动画

```tsx
// 明确指定时长和缓动函数
<div className="transition-all duration-200 ease-out">
  {/* 内容 */}
</div>

// 或使用预定义动画
<div className="animate-fade-in">
  {/* 内容 */}
</div>
```

---

## 🎨 色彩使用指南

### 主色调（蓝色）
用于：主要操作、链接、选中状态
```tsx
<button className="bg-blue-500 hover:bg-blue-600">
<a className="text-blue-600 hover:text-blue-700">
```

### 辅助色（橙色）
用于：次要操作、强调、警示
```tsx
<button className="bg-orange-500 hover:bg-orange-600">
<span className="text-orange-600">
```

### 成功色（绿色）
用于：成功状态、完成标记
```tsx
<div className="bg-green-50 text-green-700 border-green-200">
```

### 警告色（黄色）
用于：警告信息、待处理状态
```tsx
<div className="bg-yellow-50 text-yellow-700 border-yellow-200">
```

### 错误色（红色）
用于：错误信息、删除操作
```tsx
<div className="bg-red-50 text-red-700 border-red-200">
```

### 中性色（灰色）
用于：文字、边框、背景
```tsx
<p className="text-gray-900">  {/* 标题 */}
<p className="text-gray-700">  {/* 正文 */}
<p className="text-gray-500">  {/* 次要文字 */}
<div className="border-gray-200">  {/* 边框 */}
<div className="bg-gray-50">   {/* 背景 */}
```

---

## 📱 响应式设计

使用 Tailwind 的响应式前缀：

```tsx
<div className="
  p-4 md:p-6 lg:p-8
  text-sm md:text-base lg:text-lg
  grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
">
  {/* 内容 */}
</div>
```

断点：
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

---

## ♿ 无障碍

### 1. 焦点状态
```tsx
<button className="
  focus:outline-none 
  focus:ring-2 
  focus:ring-blue-500 
  focus:ring-offset-2
">
  按钮
</button>
```

### 2. 颜色对比度
确保文字与背景的对比度至少为 4.5:1

✅ 推荐组合：
- `text-gray-900` on `bg-white`
- `text-white` on `bg-blue-500`
- `text-gray-700` on `bg-gray-50`

### 3. 语义化 HTML
```tsx
<button>操作</button>  {/* 而不是 <div onClick> */}
<a href="#">链接</a>   {/* 而不是 <span onClick> */}
```

---

## 🔍 调试技巧

### 1. 查看设计系统变量
在浏览器控制台：
```javascript
getComputedStyle(document.documentElement).getPropertyValue('--primary-500')
```

### 2. 临时修改变量
```javascript
document.documentElement.style.setProperty('--primary-500', '#FF0000')
```

### 3. 查看所有 CSS 变量
```javascript
const styles = getComputedStyle(document.documentElement);
const cssVars = Array.from(document.styleSheets)
  .flatMap(sheet => Array.from(sheet.cssRules))
  .filter(rule => rule.type === 1)
  .flatMap(rule => Array.from(rule.style))
  .filter(prop => prop.startsWith('--'));
console.log(cssVars);
```

---

## 📚 更多资源

- [完整设计规范](./design-tokens.md)
- [组件优化计划](./component-optimization-plan.md)
- [升级总结](../../前端设计系统升级总结.md)

---

## 💡 提示

1. **保持一致性**：始终使用设计系统变量和实用类
2. **遵循规范**：参考设计规范文档
3. **测试响应式**：在不同屏幕尺寸下测试
4. **关注无障碍**：确保所有用户都能使用
5. **性能优化**：避免不必要的重渲染

---

## 🤝 贡献

发现问题或有改进建议？欢迎反馈！

Happy Coding! 🎉
