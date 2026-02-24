# Implementation Plan: Resume PDF Export Enhancement

## Overview

Enhance the existing PDF export system with intelligent page control, professional templates, and optional photo placement. This implementation builds on the current HTML-to-PDF approach.

## Tasks

- [ ] 1. Create template system foundation
  - [ ] 1.1 Create base template interface and types
    - Define `ResumeTemplate` interface in `lib/resume-templates/types.ts`
    - Define `ExportOptions` and `RenderOptions` interfaces
    - Define template category types
    - _Requirements: 3.1, 3.2_
  
  - [ ] 1.2 Create base template class
    - Implement `BaseTemplate` abstract class in `lib/resume-templates/base-template.ts`
    - Define common layout calculations
    - Implement photo placeholder logic
    - Create utility functions for spacing and typography
    - _Requirements: 3.1, 4.1, 5.2, 5.3_
  
  - [x] 1.3 Create template registry
    - Implement template registry in `lib/resume-templates/index.ts`
    - Create `getTemplate()` and `getAllTemplates()` functions
    - Add template validation logic
    - _Requirements: 3.1, 3.5_

- [ ] 2. Implement three professional templates
  - [ ] 2.1 Create Product Manager template
    - Implement in `lib/resume-templates/product-template.ts`
    - Design clean, achievement-focused layout
    - Optimize for metrics and impact statements
    - Configure appropriate spacing and typography
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 4.4_
  
  - [x] 2.2 Create Operations template
    - Implement in `lib/resume-templates/operations-template.ts`
    - Design structured, process-focused layout
    - Emphasize efficiency and organization
    - Configure balanced whitespace
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 4.4_
  
  - [ ] 2.3 Create Technical template
    - Implement in `lib/resume-templates/technical-template.ts`
    - Design dense, information-rich layout
    - Emphasize technical skills and projects
    - Optimize for maximum content density
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 3. Implement page detection system
  - [x] 3.1 Create page detector utility
    - Implement `detectPageCount()` in `lib/page-detector.ts`
    - Render HTML element off-screen
    - Calculate page count based on A4 dimensions
    - Handle edge cases (empty content, very long content)
    - _Requirements: 1.1, 1.4_
  
  - [ ] 3.2 Add page detection to export flow
    - Integrate page detector before PDF generation
    - Add detection result to export pipeline
    - Log detection results for debugging
    - _Requirements: 1.1_

- [ ] 4. Implement AI compression service
  - [x] 4.1 Create compression API endpoint
    - Create `/api/resume/compress` route in `app/api/resume/compress/route.ts`
    - Accept resume data and compression level
    - Call LLM with compression prompt
    - Return compressed resume data
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 4.2 Create compression orchestrator
    - Implement `compressResume()` in `lib/resume-compressor.ts`
    - Implement progressive compression logic (3 iterations max)
    - Track compression metrics (original vs compressed length)
    - Handle compression failures gracefully
    - _Requirements: 1.2, 1.3, 2.6, 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 4.3 Design compression prompts
    - Create compression prompt templates for each iteration level
    - Level 1: Light compression (remove verbosity)
    - Level 2: Medium compression (3 bullets max, length limits)
    - Level 3: Aggressive compression (semantic reduction)
    - Test prompts with sample resumes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Create export settings dialog
  - [x] 5.1 Create dialog component
    - Implement `ExportSettingsDialog` in `components/ExportSettingsDialog.tsx`
    - Add template selection dropdown
    - Add "Include Photo" checkbox
    - Add template preview area
    - Add Cancel and Export buttons
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [ ] 5.2 Implement template preview
    - Render miniature version of selected template
    - Update preview when template or photo option changes
    - Show photo placeholder when enabled
    - _Requirements: 3.5, 6.2_
  
  - [ ] 5.3 Add settings persistence
    - Save user's last selected template to localStorage
    - Save photo preference to localStorage
    - Load saved settings on dialog open
    - _Requirements: 6.4_

- [ ] 6. Integrate compression into export flow
  - [x] 6.1 Update export function in resume editor page
    - Modify `exportToPDF()` in `app/chat/resume-editor/page.tsx`
    - Show export settings dialog first
    - Detect page count after initial render
    - Trigger compression if needed
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 6.2 Add compression progress UI
    - Create `CompressionProgress` component
    - Show current iteration (e.g., "Compressing... Attempt 1/3")
    - Display estimated time remaining
    - Allow user to cancel compression
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ] 6.3 Add compression review step
    - Show "Review Compressed Content" dialog after compression
    - Display original vs compressed content side-by-side
    - Allow user to accept or reject compression
    - Provide option to manually edit instead
    - _Requirements: 8.5, 10.1_

- [ ] 7. Update PDF generator for templates
  - [x] 7.1 Modify PDF generator to use templates
    - Update `generateResumePDF()` in `lib/pdf-generator.ts`
    - Accept template parameter
    - Use template's render function instead of hardcoded HTML
    - Handle photo placeholder rendering
    - _Requirements: 3.1, 3.3, 5.1, 5.2, 5.3, 5.4_
  
  - [ ] 7.2 Add photo placeholder support
    - Render photo placeholder when enabled
    - Adjust content area width when photo is included
    - Style placeholder with dashed border and label
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 8. Implement error handling
  - [ ] 8.1 Handle compression failures
    - Show user-friendly error dialog after 3 failed attempts
    - Offer options: manual edit, force export, or cancel
    - Log compression failures for debugging
    - _Requirements: 10.1, 10.4, 10.5_
  
  - [ ] 8.2 Handle template rendering failures
    - Catch template rendering errors
    - Fall back to default (technical) template
    - Log errors with template details
    - _Requirements: 10.2, 10.4_
  
  - [ ] 8.3 Handle page detection failures
    - Catch page detection errors
    - Warn user but proceed with export
    - Log detection failures
    - _Requirements: 10.3, 10.4_

- [ ] 9. Add template selection UI to editor
  - [ ] 9.1 Add template selector to preview area
    - Add dropdown above preview area
    - Show template name and description
    - Update preview when template changes
    - _Requirements: 3.5, 6.2_
  
  - [ ] 9.2 Add photo toggle to preview area
    - Add checkbox for "Include Photo"
    - Update preview when toggled
    - Show/hide photo placeholder in preview
    - _Requirements: 5.1, 6.2_

- [ ] 10. Testing and optimization
  - [ ] 10.1 Test compression quality
    - Test with various resume lengths
    - Verify 3-bullet limit is enforced
    - Verify metrics and achievements are preserved
    - Test all 3 compression levels
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 8.4_
  
  - [ ] 10.2 Test template rendering
    - Test all 3 templates with sample data
    - Verify one-page constraint
    - Test with/without photo placeholder
    - Test with varying content lengths
    - _Requirements: 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 9.1, 9.2, 9.3, 9.4_
  
  - [ ] 10.3 Test page detection accuracy
    - Test with content that's exactly one page
    - Test with content slightly over one page
    - Test with very long content (3+ pages)
    - Verify detection is consistent
    - _Requirements: 1.1, 1.4_
  
  - [ ] 10.4 Performance testing
    - Measure page detection time (target: < 500ms)
    - Measure compression time per iteration (target: < 10s)
    - Measure template switching time (target: < 100ms)
    - Measure total export time (target: < 5s)
    - _Requirements: Performance NFRs_

- [ ] 11. Documentation and polish
  - [ ] 11.1 Create user guide
    - Document how to select templates
    - Explain compression process
    - Provide tips for optimal one-page resumes
    - _Requirements: Usability NFRs_
  
  - [ ] 11.2 Add tooltips and help text
    - Add tooltip to template selector
    - Add help text for photo option
    - Explain compression in progress dialog
    - _Requirements: Usability NFRs_
  
  - [ ] 11.3 Create technical documentation
    - Document template creation process
    - Document compression algorithm
    - Document page detection logic
    - _Requirements: All_

## Notes

- Build on existing HTML-to-Canvas-to-PDF approach
- Compression is optional - only triggered if content exceeds one page
- Templates should be tested with real resume data
- Photo placeholder is visual only - no actual photo upload in this phase
- Maximum 3 compression attempts to avoid infinite loops
- All AI calls should have proper timeout and error handling
- Consider caching compression results to avoid redundant API calls
