# Design Document: Resume PDF Export

## Overview

This feature implements client-side PDF generation for the resume editor page, allowing users to export their optimized resume as a professionally formatted PDF document. We will use the `jsPDF` library for PDF generation, which provides excellent browser compatibility and doesn't require server-side processing.

## Architecture

### Component Structure

```
ResumeEditorPage (app/chat/resume-editor/page.tsx)
  └── PDF Export Button (in preview area)
      └── exportToPDF() function
          └── generateResumePDF() utility (lib/pdf-generator.ts)
```

### Technology Stack

- **jsPDF**: Client-side PDF generation library
- **React**: UI framework for button and state management
- **TypeScript**: Type safety for PDF generation logic

### Data Flow

1. User clicks "导出PDF" button
2. Component validates preview content is not empty
3. Component calls `generateResumePDF()` with preview data
4. PDF generator creates formatted PDF document
5. Browser automatically downloads the PDF file

## Components and Interfaces

### 1. PDF Generator Utility (`lib/pdf-generator.ts`)

```typescript
interface ResumeData {
  personalInfo: string;
  education: string;
  campusExperience: string;
  projects: string;
  workExperience: string;
  selfEvaluation: string;
}

interface PDFGenerationOptions {
  fileName?: string;
  pageSize?: 'a4' | 'letter';
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Generate and download a PDF from resume data
 * @param data Resume content data
 * @param options PDF generation options
 * @returns Promise that resolves when PDF is generated
 */
export async function generateResumePDF(
  data: ResumeData,
  options?: PDFGenerationOptions
): Promise<void>
```

### 2. Resume Editor Page Updates

**New State:**
```typescript
const [exportingPDF, setExportingPDF] = useState(false);
const [exportError, setExportError] = useState<string | null>(null);
```

**New Function:**
```typescript
const exportToPDF = async () => {
  // Validate content
  // Set loading state
  // Call PDF generator
  // Handle errors
  // Reset state
}
```

**UI Changes:**
- Replace "下载" button with "导出PDF" button
- Add loading state to button during export
- Show error message if export fails

## Data Models

### ResumeData Interface

```typescript
interface ResumeData {
  personalInfo: string;      // 个人信息
  education: string;          // 教育信息
  campusExperience: string;   // 在校经历
  projects: string;           // 项目经历
  workExperience: string;     // 工作/实习经历
  selfEvaluation: string;     // 个人评价
}
```

### PDF Layout Configuration

```typescript
const PDF_CONFIG = {
  pageSize: 'a4' as const,
  margins: {
    top: 20,      // mm
    right: 20,    // mm
    bottom: 20,   // mm
    left: 20,     // mm
  },
  fonts: {
    heading: {
      size: 16,
      style: 'bold' as const,
    },
    body: {
      size: 11,
      style: 'normal' as const,
    },
  },
  colors: {
    heading: '#000000',
    body: '#333333',
  },
  spacing: {
    sectionGap: 8,      // mm between sections
    paragraphGap: 4,    // mm between paragraphs
    lineHeight: 1.5,    // line height multiplier
  },
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Non-empty Content Validation

*For any* resume data object, if all section fields are empty strings, then PDF generation should be prevented and an error message should be displayed.

**Validates: Requirements 1.2**

### Property 2: File Name Format Consistency

*For any* PDF export operation, the generated file name should match the pattern "简历_YYYY-MM-DD.pdf" where YYYY-MM-DD represents a valid date.

**Validates: Requirements 3.1**

### Property 3: Section Inclusion Completeness

*For any* resume data object, all non-empty sections should appear in the generated PDF in the correct order (personal info, education, campus experience, projects, work experience, self evaluation).

**Validates: Requirements 2.1**

### Property 4: Error State Recovery

*For any* PDF generation failure, the export button should return to its normal (non-loading) state and display an appropriate error message.

**Validates: Requirements 4.4**

### Property 5: Content Preservation

*For any* resume section content, all line breaks and paragraph formatting should be preserved in the generated PDF output.

**Validates: Requirements 2.4**

## Error Handling

### Error Types

1. **Empty Content Error**
   - Trigger: All preview sections are empty
   - Message: "预览内容为空，请先在左侧分区点击"应用"按钮填充内容"
   - Action: Prevent PDF generation

2. **PDF Generation Error**
   - Trigger: jsPDF library throws an error
   - Message: "PDF生成失败，请重试"
   - Action: Log error, reset button state

3. **Browser Compatibility Error**
   - Trigger: Browser lacks required features
   - Message: "您的浏览器不支持PDF导出，请使用最新版Chrome、Firefox或Edge"
   - Action: Disable export button

### Error Handling Flow

```typescript
try {
  // Validate content
  if (isContentEmpty(preview)) {
    throw new Error('EMPTY_CONTENT');
  }
  
  // Generate PDF
  await generateResumePDF(preview, options);
  
} catch (error) {
  if (error.message === 'EMPTY_CONTENT') {
    setExportError('预览内容为空，请先填充内容');
  } else if (error.name === 'BrowserNotSupported') {
    setExportError('浏览器不支持PDF导出');
  } else {
    setExportError('PDF生成失败，请重试');
    console.error('PDF export failed:', error);
  }
} finally {
  setExportingPDF(false);
}
```

## Testing Strategy

### Unit Tests

1. **Content Validation Tests**
   - Test empty content detection
   - Test partial content (some sections empty)
   - Test all sections filled

2. **File Name Generation Tests**
   - Test date formatting
   - Test file name pattern matching

3. **Error Handling Tests**
   - Test empty content error
   - Test PDF generation error
   - Test error state cleanup

### Integration Tests

1. **End-to-End Export Flow**
   - Fill preview content
   - Click export button
   - Verify PDF download triggered
   - Verify button state changes

2. **Error Scenarios**
   - Export with empty content
   - Export with very long content
   - Export with special characters

### Manual Testing Checklist

- [ ] Export PDF with all sections filled
- [ ] Export PDF with some sections empty
- [ ] Verify PDF opens correctly in PDF reader
- [ ] Verify PDF formatting (margins, fonts, spacing)
- [ ] Verify file name includes current date
- [ ] Test in Chrome, Firefox, Safari, Edge
- [ ] Test error message display
- [ ] Test loading state during export

## Implementation Notes

### jsPDF Configuration

```typescript
import jsPDF from 'jspdf';

// Initialize with A4 size and portrait orientation
const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
});

// Configure fonts (use built-in fonts for compatibility)
doc.setFont('helvetica');
```

### Text Wrapping Strategy

jsPDF doesn't automatically wrap text, so we need to implement text wrapping:

```typescript
function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + (lines.length * lineHeight);
}
```

### Page Break Handling

Monitor Y position and add new page when approaching bottom margin:

```typescript
function checkPageBreak(
  doc: jsPDF,
  currentY: number,
  requiredSpace: number,
  pageHeight: number,
  bottomMargin: number
): number {
  if (currentY + requiredSpace > pageHeight - bottomMargin) {
    doc.addPage();
    return topMargin; // Reset to top of new page
  }
  return currentY;
}
```

### Chinese Font Support

jsPDF's built-in fonts don't support Chinese characters well. We have two options:

**Option 1: Use Unicode-compatible fonts (Recommended)**
- Use system fonts that support Chinese
- May have rendering differences across systems

**Option 2: Embed custom font**
- Requires converting TTF to base64
- Increases bundle size significantly
- Better consistency across systems

For this implementation, we'll use **Option 1** with fallback to ensure compatibility.

## Performance Considerations

1. **Client-side Generation**: All PDF generation happens in the browser, no server load
2. **Memory Usage**: Large resumes may consume significant memory during generation
3. **Generation Time**: Typically < 1 second for standard resume length
4. **Bundle Size**: jsPDF adds ~150KB to bundle (gzipped)

## Security Considerations

1. **No Server Upload**: Resume data never leaves the client
2. **XSS Prevention**: Sanitize any user input before PDF generation
3. **Content Validation**: Validate data structure before processing

## Accessibility

1. **Keyboard Navigation**: Export button is keyboard accessible
2. **Screen Reader Support**: Button has descriptive aria-label
3. **Loading State**: Clear visual and programmatic indication of loading state
4. **Error Messages**: Error messages are announced to screen readers

## Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome  | 90+     | ✅ Full |
| Firefox | 88+     | ✅ Full |
| Safari  | 14+     | ✅ Full |
| Edge    | 90+     | ✅ Full |
| IE 11   | -       | ❌ Not Supported |

## Future Enhancements

1. **Template Selection**: Allow users to choose from multiple PDF templates
2. **Custom Styling**: Let users customize fonts, colors, and layout
3. **Multi-language Support**: Support for different language layouts
4. **Cloud Storage**: Option to save PDF to cloud storage services
5. **Email Integration**: Direct email sending of PDF
