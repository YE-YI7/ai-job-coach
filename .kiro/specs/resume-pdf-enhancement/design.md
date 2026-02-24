# Design Document: Resume PDF Export Enhancement

## Overview

This design enhances the existing PDF export system with three major features:
1. **Intelligent Page Control**: Automatic detection and AI-powered compression to ensure one-page output
2. **Template System**: Professional, role-specific templates with content-style separation
3. **Optional Photo Placement**: Configurable photo placeholder in top-right corner

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                   Resume Editor Page                     │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Export Settings│  │   Template   │  │   Preview   │ │
│  │     Dialog     │  │   Selector   │  │    Panel    │ │
│  └────────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              PDF Generation Pipeline                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  Page    │→ │   AI     │→ │ Template │→ │  PDF   │ │
│  │ Detector │  │Compressor│  │ Renderer │  │ Output │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Supporting Services                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Template   │  │  Compression │  │    Photo     │ │
│  │   Registry   │  │     API      │  │  Placeholder │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Data Models

### Template Interface

```typescript
interface ResumeTemplate {
  id: string;
  name: string;
  category: 'product' | 'operations' | 'technical';
  description: string;
  
  // Layout configuration
  layout: {
    pageWidth: number;
    pageHeight: number;
    margins: { top: number; right: number; bottom: number; left: number };
    photoArea?: { width: number; height: number; position: 'top-right' };
  };
  
  // Typography
  typography: {
    headingFont: string;
    bodyFont: string;
    headingSize: number;
    subheadingSize: number;
    bodySize: number;
    lineHeight: number;
  };
  
  // Styling
  styling: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    sectionSpacing: number;
    bulletStyle: 'disc' | 'square' | 'dash';
  };
  
  // Render function
  render: (data: ResumeData, options: RenderOptions) => HTMLElement;
}
```

### Export Options

```typescript
interface ExportOptions {
  templateId: string;
  includePhoto: boolean;
  autoCompress: boolean;
  maxCompressionAttempts: number;
}
```

### Compression Result

```typescript
interface CompressionResult {
  success: boolean;
  iterations: number;
  originalLength: number;
  compressedLength: number;
  compressedData: ResumeData;
  fitsOnePage: boolean;
}
```

## Component Design

### 1. Export Settings Dialog

**Location**: `components/ExportSettingsDialog.tsx`

**Props**:
```typescript
interface ExportSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  resumeData: ResumeData;
}
```

**Features**:
- Template selection with preview
- Photo inclusion toggle
- Real-time preview of selected template
- Remember last used settings

### 2. Page Detector

**Location**: `lib/page-detector.ts`

**Function**:
```typescript
async function detectPageCount(
  htmlElement: HTMLElement
): Promise<number> {
  // Render element off-screen
  // Calculate total height
  // Divide by A4 page height (297mm)
  // Return page count
}
```

**Algorithm**:
1. Clone HTML element
2. Render off-screen with exact template styling
3. Measure scrollHeight
4. Calculate pages: `Math.ceil(scrollHeight / pageHeight)`

### 3. AI Compression Service

**Location**: `lib/resume-compressor.ts`

**Main Function**:
```typescript
async function compressResume(
  data: ResumeData,
  template: ResumeTemplate,
  maxAttempts: number = 3
): Promise<CompressionResult> {
  let currentData = data;
  let iteration = 0;
  
  while (iteration < maxAttempts) {
    // Render with current data
    const html = template.render(currentData, {});
    const pageCount = await detectPageCount(html);
    
    if (pageCount <= 1) {
      return { success: true, iterations: iteration, ... };
    }
    
    // Compress using AI
    currentData = await compressWithAI(currentData, iteration);
    iteration++;
  }
  
  return { success: false, iterations: maxAttempts, ... };
}
```

**Compression Strategy**:
```typescript
async function compressWithAI(
  data: ResumeData,
  iteration: number
): Promise<ResumeData> {
  const compressionLevel = iteration + 1; // 1, 2, 3
  
  const prompt = `
You are a professional resume editor. Compress the following resume content to fit on one page.

Compression Level: ${compressionLevel}/3
${compressionLevel === 1 ? 'Light compression - reduce verbosity' : ''}
${compressionLevel === 2 ? 'Medium compression - limit to 3 bullets per experience' : ''}
${compressionLevel === 3 ? 'Aggressive compression - semantic reduction' : ''}

Rules:
1. Limit each experience to maximum 3 bullet points
2. Keep each bullet to 1-2 lines (max 100 characters)
3. Preserve quantifiable achievements (numbers, percentages)
4. Keep technical skills and tools
5. Maintain chronological order
6. Prioritize recent and relevant experiences

Original Content:
${JSON.stringify(data, null, 2)}

Return compressed content in the same JSON format.
`;

  const response = await callLLM([
    { role: 'system', content: 'You are a professional resume editor.' },
    { role: 'user', content: prompt }
  ], {
    temperature: 0.3,
    maxTokens: 2000,
  });
  
  // Parse and return compressed data
  return parseCompressedResume(response);
}
```

### 4. Template Registry

**Location**: `lib/resume-templates/index.ts`

**Structure**:
```
lib/resume-templates/
  ├── index.ts              # Registry and exports
  ├── base-template.ts      # Base template class
  ├── product-template.ts   # Product Manager template
  ├── operations-template.ts # Operations template
  └── technical-template.ts  # Technical template
```

**Registry**:
```typescript
const TEMPLATES: Record<string, ResumeTemplate> = {
  'product': productTemplate,
  'operations': operationsTemplate,
  'technical': technicalTemplate,
};

export function getTemplate(id: string): ResumeTemplate {
  return TEMPLATES[id] || TEMPLATES['technical'];
}

export function getAllTemplates(): ResumeTemplate[] {
  return Object.values(TEMPLATES);
}
```

## Template Designs

### Product Manager Template

**Characteristics**:
- Clean, modern layout
- Emphasis on achievements and impact
- Metrics-focused bullet points
- Moderate whitespace

**Layout**:
```
┌─────────────────────────────────────────────┐
│ NAME                          [Photo Area]  │
│ Title | Contact Info                        │
├─────────────────────────────────────────────┤
│ PROFESSIONAL SUMMARY                        │
│ Brief 2-3 line summary...                   │
├─────────────────────────────────────────────┤
│ EXPERIENCE                                  │
│ Company | Role | Date                       │
│ • Achievement with metrics                  │
│ • Impact-focused bullet                     │
│ • Cross-functional collaboration            │
├─────────────────────────────────────────────┤
│ EDUCATION | SKILLS                          │
└─────────────────────────────────────────────┘
```

### Operations Template

**Characteristics**:
- Structured, organized layout
- Process and efficiency focus
- Clear section divisions
- Balanced whitespace

**Layout**:
```
┌─────────────────────────────────────────────┐
│ NAME                          [Photo Area]  │
│ Contact Information                         │
├─────────────────────────────────────────────┤
│ CORE COMPETENCIES                           │
│ Skill 1 | Skill 2 | Skill 3 | Skill 4      │
├─────────────────────────────────────────────┤
│ PROFESSIONAL EXPERIENCE                     │
│ Role @ Company (Date)                       │
│ • Process improvement result                │
│ • Operational efficiency gain               │
├─────────────────────────────────────────────┤
│ EDUCATION & CERTIFICATIONS                  │
└─────────────────────────────────────────────┘
```

### Technical Template

**Characteristics**:
- Dense information layout
- Technical skills prominent
- Project-focused
- Minimal whitespace

**Layout**:
```
┌─────────────────────────────────────────────┐
│ NAME                          [Photo Area]  │
│ Email | Phone | GitHub | LinkedIn           │
├─────────────────────────────────────────────┤
│ TECHNICAL SKILLS                            │
│ Languages: Java, Python, JavaScript         │
│ Frameworks: Spring, React, Node.js          │
├─────────────────────────────────────────────┤
│ EXPERIENCE                                  │
│ Company | Role | Date                       │
│ • Technical achievement                     │
│ • System design/architecture                │
├─────────────────────────────────────────────┤
│ PROJECTS                                    │
│ Project Name | Tech Stack                   │
│ • Implementation details                    │
├─────────────────────────────────────────────┤
│ EDUCATION                                   │
└─────────────────────────────────────────────┘
```

## Implementation Flow

### Export Process

```
1. User clicks "Export PDF"
   ↓
2. Show Export Settings Dialog
   - Select template
   - Toggle photo option
   - Preview template
   ↓
3. User clicks "Export" in dialog
   ↓
4. Render content with selected template
   ↓
5. Detect page count
   ↓
6. IF > 1 page:
   a. Show compression progress
   b. Call AI compression (iteration 1)
   c. Re-render and detect
   d. IF still > 1 page, repeat (max 3 times)
   e. IF still > 1 page after 3 attempts, warn user
   ↓
7. Generate final PDF
   ↓
8. Download PDF
```

### Compression Iterations

**Iteration 1 - Light Compression**:
- Remove redundant phrases
- Shorten verbose descriptions
- Combine similar bullet points
- Target: 10-15% reduction

**Iteration 2 - Medium Compression**:
- Limit to 3 bullets per experience
- Reduce bullet length to 1-2 lines
- Remove less impactful achievements
- Target: 20-30% reduction

**Iteration 3 - Aggressive Compression**:
- Semantic compression (rephrase for brevity)
- Remove older/less relevant experiences
- Combine education and skills sections
- Target: 30-40% reduction

## Photo Placeholder Design

### Dimensions
- Width: 35mm (132px at 96 DPI)
- Height: 45mm (170px at 96 DPI)
- Position: Top-right corner, 10mm from edges

### Visual Treatment
```html
<div class="photo-placeholder" style="
  width: 132px;
  height: 170px;
  border: 2px dashed #ccc;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 12px;
">
  照片位置
</div>
```

### Layout Adjustment
- **With Photo**: Content area width reduced by 45mm
- **Without Photo**: Full width content area

## Error Handling

### Compression Failures

```typescript
if (!compressionResult.success) {
  showDialog({
    title: '无法压缩到一页',
    message: '经过3次尝试，简历内容仍超过一页。您可以：',
    options: [
      {
        label: '手动编辑内容',
        action: () => navigateToEditor()
      },
      {
        label: '强制导出（多页）',
        action: () => exportMultiPage()
      },
      {
        label: '取消',
        action: () => closeDialog()
      }
    ]
  });
}
```

### Template Rendering Failures

```typescript
try {
  const html = template.render(data, options);
} catch (error) {
  console.error('Template rendering failed:', error);
  // Fallback to default template
  const html = defaultTemplate.render(data, options);
}
```

## Performance Optimization

### Caching
- Cache rendered templates for preview
- Cache compression results
- Cache page detection results

### Lazy Loading
- Load templates on-demand
- Defer compression until user confirms export

### Progress Feedback
```typescript
interface CompressionProgress {
  stage: 'detecting' | 'compressing' | 'rendering' | 'complete';
  iteration: number;
  maxIterations: number;
  estimatedTimeRemaining: number;
}
```

## Testing Strategy

### Unit Tests
1. Page detection accuracy
2. Compression logic
3. Template rendering
4. Photo placeholder positioning

### Integration Tests
1. End-to-end export flow
2. Compression iterations
3. Template switching
4. Error handling

### Manual Tests
1. Visual template comparison
2. One-page constraint validation
3. Content quality after compression
4. Cross-browser compatibility

## Future Enhancements

1. **Custom Templates**: Allow users to create and save custom templates
2. **Photo Upload**: Support actual photo upload and cropping
3. **Multi-language**: Support templates in different languages
4. **Collaborative Editing**: Share and collaborate on resumes
5. **Version History**: Track changes and compression history
6. **Export Analytics**: Track which templates are most popular
