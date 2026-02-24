/**
 * Resume Template Registry
 * Central registry for all available resume templates
 */

import { ResumeTemplate, TemplateCategory } from './types';
import { technicalTemplate } from './technical-template';
import { productTemplate } from './product-template';
import { operationsTemplate } from './operations-template';

// Template registry
const templates: Map<string, ResumeTemplate> = new Map([
  [technicalTemplate.id, technicalTemplate],
  [productTemplate.id, productTemplate],
  [operationsTemplate.id, operationsTemplate],
]);

/**
 * Get a template by ID
 * @param templateId - The template ID
 * @returns The template or undefined if not found
 */
export function getTemplate(templateId: string): ResumeTemplate | undefined {
  return templates.get(templateId);
}

/**
 * Get all available templates
 * @returns Array of all templates
 */
export function getAllTemplates(): ResumeTemplate[] {
  return Array.from(templates.values());
}

/**
 * Get templates by category
 * @param category - The template category
 * @returns Array of templates in the category
 */
export function getTemplatesByCategory(category: TemplateCategory): ResumeTemplate[] {
  return getAllTemplates().filter(t => t.category === category);
}

/**
 * Get the default template (technical)
 * @returns The default template
 */
export function getDefaultTemplate(): ResumeTemplate {
  return technicalTemplate;
}

/**
 * Validate template ID
 * @param templateId - The template ID to validate
 * @returns True if the template exists
 */
export function isValidTemplateId(templateId: string): boolean {
  return templates.has(templateId);
}

// Export templates for direct access
export { technicalTemplate, productTemplate, operationsTemplate };
export type { ResumeTemplate, TemplateCategory } from './types';
