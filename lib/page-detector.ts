/**
 * Page Detection Utility
 * Detects how many pages an HTML element would occupy when printed
 */

// A4 dimensions in pixels at 96 DPI
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

export interface PageDetectionResult {
  pageCount: number;
  contentHeight: number;
  exceedsOnePage: boolean;
}

/**
 * Detect how many pages the given HTML element would occupy
 * @param element - The HTML element to measure
 * @returns Page detection result
 */
export async function detectPageCount(element: HTMLElement): Promise<PageDetectionResult> {
  try {
    // Create a temporary container off-screen
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${A4_WIDTH_PX}px;
      visibility: hidden;
      pointer-events: none;
    `;
    
    // Clone the element to avoid affecting the original
    const clone = element.cloneNode(true) as HTMLElement;
    container.appendChild(clone);
    document.body.appendChild(container);
    
    // Wait for layout to settle
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Measure the content height
    const contentHeight = clone.offsetHeight;
    
    // Clean up
    document.body.removeChild(container);
    
    // Calculate page count
    const pageCount = Math.ceil(contentHeight / A4_HEIGHT_PX);
    const exceedsOnePage = pageCount > 1;
    
    return {
      pageCount,
      contentHeight,
      exceedsOnePage,
    };
  } catch (error) {
    console.error('Page detection failed:', error);
    // Return safe defaults on error
    return {
      pageCount: 1,
      contentHeight: 0,
      exceedsOnePage: false,
    };
  }
}

/**
 * Estimate if content will fit on one page based on character count
 * This is a fast approximation that doesn't require rendering
 * @param content - The text content to estimate
 * @returns True if content likely fits on one page
 */
export function estimateFitsOnePage(content: string): boolean {
  // Rough estimate: ~3000 characters fit on one page with typical formatting
  const charCount = content.length;
  return charCount <= 3000;
}

/**
 * Calculate compression ratio needed to fit content on one page
 * @param currentPageCount - Current number of pages
 * @returns Suggested compression ratio (0-1)
 */
export function calculateCompressionRatio(currentPageCount: number): number {
  if (currentPageCount <= 1) return 1.0;
  
  // Target is 1 page, add 10% buffer for safety
  const targetRatio = 0.9 / currentPageCount;
  
  // Clamp between 0.5 and 1.0
  return Math.max(0.5, Math.min(1.0, targetRatio));
}
