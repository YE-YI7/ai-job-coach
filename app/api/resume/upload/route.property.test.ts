/**
 * 属性测试：文件验证
 * 使用 fast-check 进行基于属性的测试
 * 
 * Feature: resume-upload-ai-analysis
 */

import * as fc from "fast-check";
import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";

// Mock 认证模块
jest.mock("@/lib/auth");

describe("Resume Upload API - Property-Based Tests", () => {
  const mockUser = { id: "test-user-123", email: "test@example.com" };

  beforeEach(() => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(mockUser);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * 辅助函数：创建模拟的 Request
   */
  function createRequest(filename: string, mimeType: string, size: number): Request {
    const content = size > 0 ? Buffer.alloc(size, "a") : "";
    const file = new File([content], filename, { type: mimeType });

    const formData = new FormData();
    formData.append("file", file);

    return new Request("http://localhost:3000/api/resume/upload", {
      method: "POST",
      body: formData,
    });
  }

  /**
   * Property 1: File Type Validation
   * Validates: Requirements 1.1, 1.2
   * 
   * For any uploaded file, if the file extension is not .pdf, .doc, or .docx,
   * then the system should reject the upload and return an error.
   */
  test("Property 1: File Type Validation - 只接受PDF和Word文件", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机文件名和扩展名
        fc.record({
          basename: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          extension: fc.oneof(
            fc.constant(".pdf"),
            fc.constant(".doc"),
            fc.constant(".docx"),
            fc.constant(".txt"),
            fc.constant(".jpg"),
            fc.constant(".png"),
            fc.constant(".exe"),
            fc.constant(".zip"),
            fc.constant(".html"),
            fc.constant(".js")
          ),
        }),
        fc.integer({ min: 1, max: 5 * 1024 * 1024 }), // 文件大小 1B - 5MB
        async ({ basename, extension }, size) => {
          const filename = basename + extension;
          
          // 根据扩展名确定MIME类型
          const mimeTypeMap: Record<string, string> = {
            ".pdf": "application/pdf",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain",
            ".jpg": "image/jpeg",
            ".png": "image/png",
            ".exe": "application/x-msdownload",
            ".zip": "application/zip",
            ".html": "text/html",
            ".js": "application/javascript",
          };
          
          const mimeType = mimeTypeMap[extension] || "application/octet-stream";
          const request = createRequest(filename, mimeType, size);
          const response = await POST(request);
          const data = await response.json();

          // 验证属性：只有 .pdf, .doc, .docx 应该被接受
          const allowedExtensions = [".pdf", ".doc", ".docx"];
          const shouldBeAccepted = allowedExtensions.includes(extension);

          if (shouldBeAccepted) {
            // 应该接受（返回200）
            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
          } else {
            // 应该拒绝（返回400）
            expect(response.status).toBe(400);
            expect(data.ok).toBe(false);
            expect(data.code).toBe("INVALID_FILE_TYPE");
          }
        }
      ),
      { numRuns: 100 } // 运行100次迭代
    );
  }, 30000); // 30秒超时

  /**
   * Property 2: File Size Validation
   * Validates: Requirements 1.3
   * 
   * For any uploaded file, if the file size exceeds 10MB,
   * then the system should reject the upload and return an error.
   */
  test("Property 2: File Size Validation - 拒绝超过10MB的文件", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机文件大小（0 - 15MB）
        fc.integer({ min: 0, max: 15 * 1024 * 1024 }),
        async (size) => {
          const filename = "test-resume.pdf";
          const mimeType = "application/pdf";
          const request = createRequest(filename, mimeType, size);
          const response = await POST(request);
          const data = await response.json();

          // 验证属性：只有 0 < size <= 10MB 应该被接受
          const MAX_SIZE = 10 * 1024 * 1024;
          const shouldBeAccepted = size > 0 && size <= MAX_SIZE;

          if (shouldBeAccepted) {
            // 应该接受
            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
          } else {
            // 应该拒绝
            expect(response.status).toBe(400);
            expect(data.ok).toBe(false);
            
            if (size === 0) {
              expect(data.code).toBe("EMPTY_FILE");
            } else {
              expect(data.code).toBe("FILE_TOO_LARGE");
            }
          }
        }
      ),
      { numRuns: 100 } // 运行100次迭代
    );
  }, 60000); // 60秒超时（因为可能生成大文件）

  /**
   * Property 3: MIME Type Validation
   * Validates: Requirements 8.2
   * 
   * For any uploaded file, if the MIME type doesn't match the expected types,
   * then the system should reject the upload even if the extension is correct.
   */
  test("Property 3: MIME Type Validation - 验证MIME类型匹配", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机的扩展名和MIME类型组合
        fc.record({
          extension: fc.constantFrom(".pdf", ".doc", ".docx"),
          mimeType: fc.oneof(
            fc.constant("application/pdf"),
            fc.constant("application/msword"),
            fc.constant("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            fc.constant("text/plain"),
            fc.constant("image/jpeg"),
            fc.constant("application/octet-stream")
          ),
        }),
        fc.integer({ min: 1024, max: 1024 * 1024 }), // 1KB - 1MB
        async ({ extension, mimeType }, size) => {
          const filename = "test-resume" + extension;
          const request = createRequest(filename, mimeType, size);
          const response = await POST(request);
          const data = await response.json();

          // 验证属性：扩展名和MIME类型必须都匹配
          const validCombinations = [
            { ext: ".pdf", mime: "application/pdf" },
            { ext: ".doc", mime: "application/msword" },
            { ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          ];

          const isValidCombination = validCombinations.some(
            combo => combo.ext === extension && combo.mime === mimeType
          );

          if (isValidCombination) {
            // 应该接受
            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
          } else {
            // 应该拒绝
            expect(response.status).toBe(400);
            expect(data.ok).toBe(false);
            // 可能是 INVALID_FILE_TYPE 或 INVALID_MIME_TYPE
            expect(["INVALID_FILE_TYPE", "INVALID_MIME_TYPE"]).toContain(data.code);
          }
        }
      ),
      { numRuns: 100 } // 运行100次迭代
    );
  }, 30000); // 30秒超时
});
