/**
 * PDF Generator Utility
 * Generates professionally formatted PDF resumes using jsPDF and html2canvas
 * 
 * This version uses HTML rendering to properly support Chinese characters
 * and supports multiple professional templates
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { getTemplate, getDefaultTemplate } from './resume-templates';

export interface ResumeData {
  personalInfo: string;
  education: string;
  campusExperience: string;
  projects: string;
  workExperience: string;
  selfEvaluation: string;
}

export interface PDFGenerationOptions {
  fileName?: string;
  pageSize?: 'a4' | 'letter';
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  templateId?: string;
  includePhoto?: boolean;
  avatarSrc?: string; // base64 头像图片数据
}

// PDF Configuration (kept for reference, but not used in HTML rendering approach)
const PDF_CONFIG = {
  pageSize: 'a4' as const,
  pageWidth: 210, // mm (A4 width)
  pageHeight: 297, // mm (A4 height)
  margins: {
    top: 20,
    right: 20,
    bottom: 20,
    left: 20,
  },
  fonts: {
    heading: {
      size: 14,
      style: 'bold' as const,
    },
    body: {
      size: 10,
      style: 'normal' as const,
    },
  },
  spacing: {
    sectionGap: 6, // mm between sections
    paragraphGap: 3, // mm between paragraphs
    lineHeight: 5, // mm per line
  },
};

/**
 * Generate current date string in YYYY-MM-DD format
 */
function getCurrentDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Create HTML element for resume content
 */
function createResumeHTML(data: ResumeData): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = `
    width: 794px;
    padding: 40px;
    background: white;
    font-family: 'Microsoft YaHei', 'SimSun', sans-serif;
    font-size: 12px;
    line-height: 1.6;
    color: #333;
  `;

  const sections = [
    { title: '个人信息', content: data.personalInfo },
    { title: '教育信息', content: data.education },
    { title: '在校经历', content: data.campusExperience },
    { title: '项目经历', content: data.projects },
    { title: '工作/实习经历', content: data.workExperience },
    { title: '个人评价', content: data.selfEvaluation },
  ];

  sections.forEach(section => {
    if (!section.content || section.content.trim() === '') {
      return; // Skip empty sections
    }

    // Section heading
    const heading = document.createElement('h2');
    heading.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      margin: 20px 0 10px 0;
      color: #000;
    `;
    heading.textContent = section.title;
    container.appendChild(heading);

    // Section content
    const content = document.createElement('div');
    content.style.cssText = `
      margin-bottom: 15px;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    content.textContent = section.content;
    container.appendChild(content);
  });

  return container;
}

/**
 * Generate and download a PDF from resume data using HTML rendering
 * @param data Resume content data
 * @param options PDF generation options
 */
export async function generateResumePDF(
  data: ResumeData,
  options?: PDFGenerationOptions
): Promise<void> {
  try {
    // Get template
    const template = options?.templateId 
      ? getTemplate(options.templateId) || getDefaultTemplate()
      : getDefaultTemplate();
    
    // Create HTML element using template
    const htmlElement = template.render(data, {
      includePhoto: options?.includePhoto || false,
      avatarSrc: options?.avatarSrc,
    });
    
    // Temporarily add to document (hidden)
    htmlElement.style.position = 'absolute';
    htmlElement.style.left = '-9999px';
    document.body.appendChild(htmlElement);

    // Convert HTML to canvas
    const canvas = await html2canvas(htmlElement, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Remove temporary element
    document.body.removeChild(htmlElement);

    // Calculate PDF dimensions
    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    // Create PDF
    const pdf = new jsPDF({
      orientation: imgHeight > imgWidth ? 'portrait' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Set metadata
    pdf.setProperties({
      title: '个人简历',
      subject: '个人简历',
      author: '',
      keywords: 'resume, 简历',
      creator: 'AI Job Coach',
    });

    // Add image to PDF
    const imgData = canvas.toDataURL('image/png');
    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= 297; // A4 height

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;
    }

    // Generate file name
    const dateString = getCurrentDateString();
    const fileName = options?.fileName || `简历_${dateString}.pdf`;

    // Save PDF
    pdf.save(fileName);

  } catch (error) {
    console.error('PDF generation failed:', error);
    throw new Error('PDF生成失败');
  }
}

/**
 * Check if resume data is empty (all sections are empty)
 */
export function isResumeDataEmpty(data: ResumeData): boolean {
  return (
    (!data.personalInfo || data.personalInfo.trim() === '') &&
    (!data.education || data.education.trim() === '') &&
    (!data.campusExperience || data.campusExperience.trim() === '') &&
    (!data.projects || data.projects.trim() === '') &&
    (!data.workExperience || data.workExperience.trim() === '') &&
    (!data.selfEvaluation || data.selfEvaluation.trim() === '')
  );
}
