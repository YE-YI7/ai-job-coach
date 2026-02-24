/**
 * Resume Template System Types
 */

import { ResumeData } from '../pdf-generator';

export type TemplateCategory = 'product' | 'operations' | 'technical';

export interface TemplateLayout {
  pageWidth: number;
  pageHeight: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  photoArea?: {
    width: number;
    height: number;
  };
}

export interface TemplateTypography {
  headingFont: string;
  bodyFont: string;
  headingSize: number;
  subheadingSize: number;
  bodySize: number;
  lineHeight: number;
}

export interface TemplateStyling {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  sectionSpacing: number;
  bulletStyle: 'disc' | 'square' | 'dash';
}

export interface RenderOptions {
  includePhoto: boolean;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  layout: TemplateLayout;
  typography: TemplateTypography;
  styling: TemplateStyling;
  render: (data: ResumeData, options: RenderOptions) => HTMLElement;
}

export interface ExportOptions {
  templateId: string;
  includePhoto: boolean;
  autoCompress: boolean;
}
