/**
 * Operations Resume Template
 * Structured, process-focused layout emphasizing efficiency and organization
 */

import { ResumeData } from '../pdf-generator';
import { ResumeTemplate, RenderOptions } from './types';

export const operationsTemplate: ResumeTemplate = {
  id: 'operations',
  name: '运营模板',
  category: 'operations',
  description: '适合运营岗位，强调流程和组织能力',
  
  layout: {
    pageWidth: 794,
    pageHeight: 1123,
    margins: { top: 32, right: 32, bottom: 32, left: 32 },
    photoArea: { width: 100, height: 130 },
  },
  
  typography: {
    headingFont: "'Microsoft YaHei', sans-serif",
    bodyFont: "'Microsoft YaHei', sans-serif",
    headingSize: 17,
    subheadingSize: 13,
    bodySize: 11,
    lineHeight: 1.45,
  },
  
  styling: {
    primaryColor: '#1f2937',
    secondaryColor: '#4b5563',
    accentColor: '#059669',
    sectionSpacing: 14,
    bulletStyle: 'disc',
  },
  
  render(data: ResumeData, options: RenderOptions): HTMLElement {
    const container = document.createElement('div');
    const { layout, typography, styling } = this;
    
    const contentWidth = options.includePhoto 
      ? layout.pageWidth - layout.margins.left - layout.margins.right - (layout.photoArea?.width || 0) - 18
      : layout.pageWidth - layout.margins.left - layout.margins.right;
    
    container.style.cssText = `
      width: ${layout.pageWidth}px;
      min-height: ${layout.pageHeight}px;
      padding: ${layout.margins.top}px ${layout.margins.right}px ${layout.margins.bottom}px ${layout.margins.left}px;
      background: white;
      font-family: ${typography.bodyFont};
      font-size: ${typography.bodySize}px;
      line-height: ${typography.lineHeight};
      color: ${styling.secondaryColor};
      box-sizing: border-box;
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: ${styling.sectionSpacing + 2}px;
      padding-bottom: 10px;
      border-bottom: 2px solid ${styling.accentColor};
    `;
    
    const headerContent = document.createElement('div');
    headerContent.style.cssText = `width: ${contentWidth}px;`;
    
    // Name
    const name = document.createElement('h1');
    name.style.cssText = `
      font-size: ${typography.headingSize}px;
      font-weight: 600;
      color: ${styling.primaryColor};
      margin: 0 0 5px 0;
    `;
    // Extract name from first line of personal info
    const firstLine = data.personalInfo ? data.personalInfo.split('\n')[0] : '姓名';
    name.textContent = firstLine || '姓名';
    headerContent.appendChild(name);
    
    // Contact
    if (data.personalInfo) {
      const lines = data.personalInfo.split('\n');
      if (lines.length > 1) {
        const contact = document.createElement('div');
        contact.style.cssText = `
          font-size: ${typography.bodySize}px;
          color: ${styling.secondaryColor};
          line-height: 1.4;
        `;
        contact.textContent = lines.slice(1, 3).join(' | ');
        headerContent.appendChild(contact);
      }
    }
    
    header.appendChild(headerContent);
    
    // Photo
    if (options.includePhoto && layout.photoArea) {
      if (options.avatarSrc) {
        const photoImg = document.createElement('img');
        photoImg.src = options.avatarSrc;
        photoImg.style.cssText = `
          width: ${layout.photoArea.width}px;
          height: ${layout.photoArea.height}px;
          object-fit: cover;
          border-radius: 2px;
        `;
        header.appendChild(photoImg);
      } else {
        const photoPlaceholder = document.createElement('div');
        photoPlaceholder.style.cssText = `
          width: ${layout.photoArea.width}px;
          height: ${layout.photoArea.height}px;
          border: 2px dashed #d1d5db;
          background: #fafafa;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          font-size: 11px;
          border-radius: 2px;
        `;
        photoPlaceholder.textContent = '照片';
        header.appendChild(photoPlaceholder);
      }
    }
    if (data.selfEvaluation) {
      const summary = document.createElement('div');
      summary.style.cssText = `
        margin-bottom: ${styling.sectionSpacing}px;
        padding: 10px 12px;
        background: #f0fdf4;
        border-left: 4px solid ${styling.accentColor};
        border-radius: 2px;
      `;
      
      const summaryText = document.createElement('div');
      summaryText.style.cssText = `
        font-size: ${typography.bodySize}px;
        line-height: 1.5;
        color: ${styling.secondaryColor};
      `;
      summaryText.textContent = data.selfEvaluation.split('\n').slice(0, 3).join(' ');
      summary.appendChild(summaryText);
      
      container.appendChild(summary);
    }
    
    // Helper function
    const addSection = (title: string, content: string) => {
      if (!content || content.trim() === '') return;
      
      const section = document.createElement('div');
      section.style.cssText = `margin-bottom: ${styling.sectionSpacing}px;`;
      
      const sectionTitle = document.createElement('h2');
      sectionTitle.style.cssText = `
        font-size: ${typography.subheadingSize}px;
        font-weight: 600;
        color: ${styling.primaryColor};
        margin: 0 0 7px 0;
        padding-left: 8px;
        border-left: 3px solid ${styling.accentColor};
      `;
      sectionTitle.textContent = title;
      section.appendChild(sectionTitle);
      
      const sectionContent = document.createElement('div');
      sectionContent.style.cssText = `
        font-size: ${typography.bodySize}px;
        white-space: pre-wrap;
        word-wrap: break-word;
        padding-left: 4px;
      `;
      sectionContent.textContent = content;
      section.appendChild(sectionContent);
      
      container.appendChild(section);
    };
    
    // Add sections in the same order as web preview
    addSection('教育背景', data.education);
    addSection('在校经历', data.campusExperience);
    addSection('项目经历', data.projects);
    addSection('工作经历', data.workExperience);
    
    return container;
  },
};
