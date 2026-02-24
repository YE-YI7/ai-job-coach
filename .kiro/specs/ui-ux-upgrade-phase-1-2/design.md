# Design Document: UI/UX Upgrade & Feature Enhancements

## Design Philosophy

The design philosophy for this upgrade centers on three core principles:

1. **呼吸感 (Breathing Feel)**: Create a sense of space and fluidity through animations, spacing, and glassmorphism effects
2. **专业度 (Professionalism)**: Establish credibility through consistent color usage, typography, and visual hierarchy
3. **易用性 (Usability)**: Ensure intuitive interactions through clear affordances, feedback, and progressive disclosure

## Visual Design System

### Color Palette

#### Primary Colors
```css
--color-primary-orange: #EF6820;  /* Main CTAs, primary actions */
--color-primary-blue: #6366F1;    /* Links, AI labels, secondary actions */
```

#### Gradient Combinations
```css
/* Orange Gradient (Primary Actions) */
from-orange-500 to-amber-500
from-orange-50 to-amber-50 (backgrounds)

/* Blue Gradient (AI Elements) */
from-blue-500 to-indigo-600
from-blue-50 to-indigo-50 (backgrounds)

/* Purple Gradient (Assessment Cards) */
from-purple-500 to-pink-500
from-purple-50 to-pink-50 (backgrounds)
```

#### Semantic Colors
```css
--color-success: #10B981;   /* Green for completed states */
--color-warning: #F59E0B;   /* Amber for warnings */
--color-error: #EF4444;     /* Red for errors */
--color-info: #3B82F6;      /* Blue for information */
```

#### Neutral Colors
```css
--color-gray-50: #F9FAFB;
--color-gray-100: #F3F4F6;
--color-gray-200: #E5E7EB;
--color-gray-300: #D1D5DB;
--color-gray-600: #4B5563;
--color-gray-700: #374151;
--color-gray-800: #1F2937;
--color-gray-900: #111827;
```

### Typography

#### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
  'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

#### Type Scale
```css
/* Headings */
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; }  /* Page titles */
.text-2xl { font-size: 1.5rem; line-height: 2rem; }      /* Section titles */
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }   /* Card titles */
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }  /* Subtitles */

/* Body */
.text-base { font-size: 1rem; line-height: 1.5rem; }     /* Body text */
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }  /* Small text */
.text-xs { font-size: 0.75rem; line-height: 1rem; }      /* Captions */
```

#### Font Weights
```css
.font-bold { font-weight: 700; }      /* Headings, emphasis */
.font-semibold { font-weight: 600; }  /* Subheadings */
.font-medium { font-weight: 500; }    /* Buttons, labels */
.font-normal { font-weight: 400; }    /* Body text */
```

### Spacing System

#### Padding & Margin Scale
```css
.p-2 { padding: 0.5rem; }    /* 8px */
.p-3 { padding: 0.75rem; }   /* 12px */
.p-4 { padding: 1rem; }      /* 16px */
.p-5 { padding: 1.25rem; }   /* 20px */
.p-6 { padding: 1.5rem; }    /* 24px */
.p-8 { padding: 2rem; }      /* 32px */
.p-12 { padding: 3rem; }     /* 48px */
```

#### Gap Scale (Flexbox/Grid)
```css
.gap-1 { gap: 0.25rem; }   /* 4px */
.gap-2 { gap: 0.5rem; }    /* 8px */
.gap-3 { gap: 0.75rem; }   /* 12px */
.gap-4 { gap: 1rem; }      /* 16px */
.gap-6 { gap: 1.5rem; }    /* 24px */
```

### Border Radius

```css
.rounded-lg { border-radius: 0.5rem; }    /* 8px - Small cards */
.rounded-xl { border-radius: 0.75rem; }   /* 12px - Medium cards */
.rounded-2xl { border-radius: 1rem; }     /* 16px - Large cards */
.rounded-full { border-radius: 9999px; }  /* Pills, avatars */
```

### Shadow System

```css
/* Elevation Levels */
.shadow-sm {
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.shadow-md {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.shadow-lg {
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

.shadow-xl {
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
}
```

### Glassmorphism Effects

```css
.glass-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.glass-card-dark {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

## Animation System

### Keyframe Animations

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideLeft {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideRight {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes pop {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
```

### Animation Utilities

```css
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

.animate-slide-in {
  animation: slideIn 0.3s ease-out;
}

.animate-slide-left {
  animation: slideLeft 0.3s ease-out;
}

.animate-slide-right {
  animation: slideRight 0.3s ease-out;
}

.animate-scale-in {
  animation: scaleIn 0.3s ease-out;
}

.animate-pop {
  animation: pop 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.animate-blink {
  animation: blink 1s infinite;
}
```

### Transition Utilities

```css
.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

.hover-lift {
  transition: all 0.2s ease;
}

.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}
```

## Component Design Specifications

### MessageBubble

#### AI Message
```tsx
<div className="flex justify-start mb-4 animate-slide-right">
  <div className="flex items-start gap-3 max-w-[80%]">
    {/* Avatar */}
    <div className="relative flex-shrink-0">
      <div className="w-10 h-10 rounded-xl bg-white border-2 border-gray-200 flex items-center justify-center shadow-md">
        <img src="picture.png" alt="AI" className="w-6 h-6 rounded-lg object-cover" />
      </div>
      {/* Online indicator */}
      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div>
    </div>
    
    {/* Message bubble */}
    <div className="flex flex-col gap-1">
      <div className="glass-card rounded-2xl px-4 py-3 shadow-md hover:shadow-lg transition-all bg-white/90 text-gray-900 border border-neutral-200/60">
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
          {content}
        </div>
      </div>
      
      {/* Timestamp */}
      <div className="text-xs px-2 flex items-center gap-1 justify-start text-gray-400">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{timestamp}</span>
      </div>
    </div>
  </div>
</div>
```

#### User Message
```tsx
<div className="flex justify-end mb-4 animate-slide-left">
  <div className="flex items-start gap-3 max-w-[80%] flex-row-reverse">
    {/* Avatar */}
    <div className="relative flex-shrink-0">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md">
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    </div>
    
    {/* Message bubble */}
    <div className="flex flex-col gap-1">
      <div className="glass-card rounded-2xl px-4 py-3 shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-blue-500 to-indigo-600 border border-blue-400/30">
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-900">
          {content}
        </div>
      </div>
      
      {/* Timestamp */}
      <div className="text-xs px-2 flex items-center gap-1 justify-end text-gray-500">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{timestamp}</span>
      </div>
    </div>
  </div>
</div>
```

### InputBar

```tsx
<div className="fixed bottom-0 left-0 w-full md:w-[70%] px-6 py-4 z-20 glass-card bg-white/95 backdrop-blur-md border-t border-neutral-200/60">
  <div className="max-w-3xl mx-auto">
    {/* Quick replies (if applicable) */}
    {showQuickReplies && (
      <div className="mb-2 flex gap-2 flex-wrap">
        {quickReplies.map((reply, index) => (
          <button
            key={index}
            className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            {reply}
          </button>
        ))}
      </div>
    )}
    
    {/* Input container */}
    <div className="glass-card bg-white border-2 border-neutral-200/60 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-2 flex items-end gap-2">
      {/* Upload button */}
      <button className="w-10 h-10 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all flex items-center justify-center flex-shrink-0 mb-0.5 group">
        <svg className="w-5 h-5 transform group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Textarea */}
      <textarea
        rows={1}
        placeholder="输入你的内容…"
        className="flex-1 bg-transparent outline-none border-none focus:ring-2 focus:ring-blue-400/30 rounded-xl py-3 px-3 text-gray-700 placeholder-gray-400 text-base resize-none max-h-48 overflow-y-auto leading-relaxed transition-all"
      />

      {/* Send button */}
      <button className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-xl flex-shrink-0 mb-0.5 transform hover:scale-[1.02]">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
        <span className="text-sm font-medium">发送</span>
      </button>
    </div>
  </div>
</div>
```

### StageSelector Card

```tsx
<div className="glass-card bg-white/80 backdrop-blur-md rounded-2xl p-4 border-2 border-neutral-200/60 shadow-lg hover:shadow-xl transition-all cursor-pointer hover-lift animate-pop">
  {/* Icon container */}
  <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md">
    <span className="text-3xl">{icon}</span>
  </div>
  
  {/* Title */}
  <h3 className="text-lg font-semibold text-gray-800 text-center mb-2">
    {title}
  </h3>
  
  {/* Description */}
  <p className="text-sm text-gray-600 text-center leading-relaxed">
    {description}
  </p>
  
  {/* Status badge */}
  {status === 'completed' && (
    <div className="mt-3 flex items-center justify-center">
      <span className="px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
        已完成
      </span>
    </div>
  )}
  
  {status === 'current' && (
    <div className="mt-3 flex items-center justify-center">
      <span className="px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full">
        进行中
      </span>
    </div>
  )}
</div>
```

### DraggableNote (Whiteboard)

```tsx
<motion.div
  drag
  dragMomentum={false}
  dragElastic={0}
  initial={{ x: initialPosition.x, y: initialPosition.y }}
  className={`absolute w-64 p-4 rounded-xl shadow-lg cursor-move hover:shadow-xl transition-shadow ${colorClass}`}
>
  {/* Title */}
  <h4 className="text-sm font-semibold text-gray-800 mb-2">
    {title}
  </h4>
  
  {/* Content */}
  <div className="text-xs text-gray-700 leading-relaxed">
    {content}
  </div>
  
  {/* Drag handle indicator */}
  <div className="absolute top-2 right-2 text-gray-400">
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
    </svg>
  </div>
</motion.div>
```

### Loading States

#### AI Thinking
```tsx
<div className="flex justify-start mb-4 animate-slide-in">
  <div className="glass-card bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-md rounded-2xl px-5 py-4 shadow-md border border-blue-200/60">
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
      </div>
      <span className="text-sm text-gray-600">AI 正在思考...</span>
    </div>
  </div>
</div>
```

#### Button Loading
```tsx
<button className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl" disabled>
  <span className="flex items-center justify-center gap-2">
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
    </svg>
    加载中...
  </span>
</button>
```

## Layout Patterns

### Two-Column Layout (Desktop)
```tsx
<div className="flex h-screen overflow-hidden">
  {/* Left: Chat (70%) */}
  <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
    {/* Header */}
    <div className="flex-shrink-0 glass-card bg-white/80 border-b border-neutral-200/60 px-6 py-4">
      {/* Navigation */}
    </div>
    
    {/* Messages */}
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {/* Message list */}
    </div>
    
    {/* Input bar */}
    <div className="flex-shrink-0">
      {/* InputBar component */}
    </div>
  </div>
  
  {/* Right: Whiteboard (30%) */}
  <div className="w-[30%] border-l border-neutral-200/60 overflow-hidden">
    {/* WhiteboardCanvas component */}
  </div>
</div>
```

### Full-Screen Modal (Stage Selector)
```tsx
<div className="fixed inset-0 z-50 bg-gradient-to-br from-white to-neutral-50 overflow-hidden">
  {/* Header */}
  <div className="px-12 py-8">
    <h1 className="text-3xl font-bold text-gray-800 text-center">
      选择你的职业规划阶段
    </h1>
  </div>
  
  {/* Stage grid */}
  <div className="px-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {/* Stage cards */}
  </div>
</div>
```

## Responsive Breakpoints

```css
/* Mobile First */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

### Mobile Adaptations
- Hide whiteboard by default
- Single column layout
- Larger touch targets (min 44x44px)
- Simplified navigation
- Bottom sheet for stage selector

## Accessibility Considerations

### Color Contrast
- All text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- Interactive elements have clear focus states
- Error messages use both color and text

### Keyboard Navigation
- Tab order follows visual flow
- All interactive elements are keyboard accessible
- Escape key closes modals
- Enter key submits forms

### Screen Readers
- Semantic HTML elements
- ARIA labels for icon buttons
- ARIA live regions for dynamic content
- Alt text for images

### Motion
- Respect prefers-reduced-motion
- Provide option to disable animations
- Ensure animations don't cause seizures (no rapid flashing)

## Design Tokens (CSS Variables)

```css
:root {
  /* Colors */
  --color-primary-orange: #EF6820;
  --color-primary-blue: #6366F1;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  
  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  
  /* Border Radius */
  --radius-sm: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  
  /* Transitions */
  --transition-fast: 150ms;
  --transition-base: 200ms;
  --transition-slow: 300ms;
  
  /* Z-index */
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-fixed: 30;
  --z-modal-backdrop: 40;
  --z-modal: 50;
  --z-popover: 60;
  --z-tooltip: 70;
}
```

## Implementation Guidelines

### Component Structure
1. Use functional components with hooks
2. Separate concerns (presentation vs logic)
3. Use TypeScript for type safety
4. Follow single responsibility principle

### Styling Approach
1. Use Tailwind CSS utility classes
2. Avoid custom CSS when possible
3. Use CSS variables for theming
4. Keep styles co-located with components

### Animation Best Practices
1. Use CSS transforms for performance
2. Avoid animating layout properties
3. Use will-change sparingly
4. Provide reduced motion alternatives

### Performance Optimization
1. Lazy load heavy components
2. Debounce expensive operations
3. Use React.memo for pure components
4. Optimize images and assets

## Testing Checklist

### Visual Testing
- [ ] All colors match design tokens
- [ ] Spacing is consistent
- [ ] Typography is legible
- [ ] Animations are smooth
- [ ] Glassmorphism effects render correctly

### Interaction Testing
- [ ] All buttons are clickable
- [ ] Hover states work correctly
- [ ] Focus states are visible
- [ ] Loading states display properly
- [ ] Error states are clear

### Responsive Testing
- [ ] Mobile layout works (320px - 767px)
- [ ] Tablet layout works (768px - 1023px)
- [ ] Desktop layout works (1024px+)
- [ ] Touch targets are adequate
- [ ] Text is readable at all sizes

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Screen reader announces correctly
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators are visible
- [ ] ARIA labels are present

### Performance Testing
- [ ] Page load time < 2s
- [ ] Animations run at 60fps
- [ ] No layout shifts
- [ ] Images are optimized
- [ ] Bundle size is reasonable

## Conclusion

This design system provides a comprehensive foundation for building a modern, professional, and accessible career coaching application. By following these guidelines, we ensure consistency, maintainability, and an excellent user experience across all features and platforms.
