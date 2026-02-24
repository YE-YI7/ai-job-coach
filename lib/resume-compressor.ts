/**
 * Resume Compression Orchestrator
 * Manages progressive compression to fit resume within one page
 */

import { ResumeData } from './pdf-generator';
import { detectPageCount } from './page-detector';

export interface CompressionResult {
  success: boolean;
  compressedData?: ResumeData;
  iterations: number;
  finalPageCount: number;
  error?: string;
}

export interface CompressionProgress {
  iteration: number;
  maxIterations: number;
  currentLevel: 1 | 2 | 3;
  message: string;
}

type ProgressCallback = (progress: CompressionProgress) => void;

const MAX_ITERATIONS = 3;

/**
 * Calculate target compression ratio based on current page count
 */
function calculateTargetRatio(pageCount: number): number {
  // Target 90% of one page to have buffer
  return 0.9 / pageCount;
}

/**
 * Call the compression API
 */
async function callCompressionAPI(
  resumeData: ResumeData,
  level: 1 | 2 | 3,
  targetRatio: number
): Promise<ResumeData | null> {
  try {
    const response = await fetch('/api/resume/compress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeData,
        compressionLevel: level,
        targetRatio,
      }),
    });

    if (!response.ok) {
      throw new Error(`Compression API failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success || !result.compressedData) {
      throw new Error(result.error || 'Compression failed');
    }

    return result.compressedData as ResumeData;
  } catch (error) {
    console.error('Compression API call failed:', error);
    return null;
  }
}

/**
 * Compress resume content progressively until it fits on one page
 * @param resumeData - The original resume data
 * @param renderFunction - Function to render resume data to HTML element
 * @param onProgress - Optional callback for progress updates
 * @returns Compression result
 */
export async function compressResume(
  resumeData: ResumeData,
  renderFunction: (data: ResumeData) => HTMLElement,
  onProgress?: ProgressCallback
): Promise<CompressionResult> {
  let currentData = resumeData;
  let iteration = 0;
  
  // Compression levels: 1 (light) -> 2 (medium) -> 3 (aggressive)
  const compressionLevels: Array<1 | 2 | 3> = [1, 2, 3];
  
  try {
    // Initial page count check
    const initialElement = renderFunction(currentData);
    const initialDetection = await detectPageCount(initialElement);
    
    if (!initialDetection.exceedsOnePage) {
      // Already fits on one page
      return {
        success: true,
        compressedData: currentData,
        iterations: 0,
        finalPageCount: initialDetection.pageCount,
      };
    }
    
    let currentPageCount = initialDetection.pageCount;
    
    // Progressive compression
    for (iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const level = compressionLevels[iteration];
      const targetRatio = calculateTargetRatio(currentPageCount);
      
      // Report progress
      if (onProgress) {
        onProgress({
          iteration: iteration + 1,
          maxIterations: MAX_ITERATIONS,
          currentLevel: level,
          message: `正在压缩... 第 ${iteration + 1}/${MAX_ITERATIONS} 次尝试`,
        });
      }
      
      // Call compression API
      const compressedData = await callCompressionAPI(currentData, level, targetRatio);
      
      if (!compressedData) {
        // Compression failed, try next level if available
        continue;
      }
      
      // Update current data
      currentData = compressedData;
      
      // Check if it fits now
      const element = renderFunction(currentData);
      const detection = await detectPageCount(element);
      currentPageCount = detection.pageCount;
      
      if (!detection.exceedsOnePage) {
        // Success! Fits on one page
        return {
          success: true,
          compressedData: currentData,
          iterations: iteration + 1,
          finalPageCount: detection.pageCount,
        };
      }
      
      // Still doesn't fit, continue to next iteration
    }
    
    // Reached max iterations without success
    return {
      success: false,
      compressedData: currentData,
      iterations: MAX_ITERATIONS,
      finalPageCount: currentPageCount,
      error: `无法在 ${MAX_ITERATIONS} 次尝试内将简历压缩至一页。当前页数: ${currentPageCount}`,
    };
  } catch (error) {
    console.error('Compression orchestration failed:', error);
    return {
      success: false,
      iterations: iteration,
      finalPageCount: 0,
      error: error instanceof Error ? error.message : '压缩过程出错',
    };
  }
}

/**
 * Estimate if compression is needed based on content length
 * This is a fast check before rendering
 */
export function shouldCompress(resumeData: ResumeData): boolean {
  const totalLength = Object.values(resumeData)
    .filter(v => typeof v === 'string')
    .join('').length;
  
  // Rough estimate: > 3000 characters likely needs compression
  return totalLength > 3000;
}
