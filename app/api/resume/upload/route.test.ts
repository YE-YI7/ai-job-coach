/**
 * 单元测试：文件验证
 * 测试文件类型、大小和基本验证逻辑
 */

import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { saveResumeUpload } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { extractPdfText } from "@/lib/pdf-text";
import mammoth from "mammoth";

// Mock 认证模块
jest.mock("@/lib/auth");

// Mock 数据库模块
jest.mock("@/lib/db");

// Mock LLM调用
jest.mock("@/lib/llm");

// Mock 文件解析库
jest.mock("@/lib/pdf-text");
jest.mock("mammoth");

describe("Resume Upload API - File Validation", () => {
  const mockUser = { id: "test-user-123", email: "test@example.com" };

  beforeEach(() => {
    // 默认模拟已认证用户
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(mockUser);
    
    // Mock PDF解析
    (extractPdfText as jest.Mock).mockResolvedValue(
      "这是一份测试简历\n姓名：张三\n教育：某某大学\n工作经验：某某公司"
    );
    
    // Mock Word解析
    (mammoth.extractRawText as jest.Mock).mockResolvedValue({
      value: "这是一份测试简历\n姓名：李四\n教育：某某大学\n工作经验：某某公司",
      messages: [],
    });
    
    // Mock AI解析
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      summary: "经验丰富的软件工程师",
      skills: ["JavaScript", "TypeScript", "React"],
      education: [{
        school: "某某大学",
        degree: "本科",
        time: "2018-2022",
        text: "计算机科学专业"
      }],
      experiences: [{
        company: "某某公司",
        title: "软件工程师",
        time: "2022-2024",
        text: "负责前端开发"
      }],
      projects: []
    }));
    
    // Mock 数据库保存
    (saveResumeUpload as jest.Mock).mockResolvedValue("resume-test-id-123");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * 辅助函数：创建模拟的 FormData 和 Request
   */
  function createMockRequest(fileOptions: {
    name: string;
    type: string;
    size: number;
    content?: string;
  }): Request {
    // 创建指定大小的内容
    let content: string | Buffer;
    if (fileOptions.size === 0) {
      content = "";
    } else if (fileOptions.content) {
      content = fileOptions.content;
    } else {
      // 创建指定大小的Buffer
      content = "a".repeat(fileOptions.size);
    }

    const file = new File(
      [content],
      fileOptions.name,
      { type: fileOptions.type }
    );

    const formData = new FormData();
    formData.append("file", file);

    return new Request("http://localhost:3000/api/resume/upload", {
      method: "POST",
      body: formData,
    });
  }

  describe("有效文件类型测试", () => {
    test("应该接受 .pdf 文件", async () => {
      const request = createMockRequest({
        name: "resume.pdf",
        type: "application/pdf",
        size: 1024 * 1024, // 1MB
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.filename).toBe("resume.pdf");
    });

    test("应该接受 .docx 文件", async () => {
      const request = createMockRequest({
        name: "resume.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 2 * 1024 * 1024, // 2MB
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.filename).toBe("resume.docx");
    });

    test("应该接受 .doc 文件", async () => {
      const request = createMockRequest({
        name: "resume.doc",
        type: "application/msword",
        size: 1.5 * 1024 * 1024, // 1.5MB
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.filename).toBe("resume.doc");
    });
  });

  describe("无效文件类型测试", () => {
    test("应该拒绝 .txt 文件", async () => {
      const request = createMockRequest({
        name: "resume.txt",
        type: "text/plain",
        size: 1024,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("INVALID_FILE_TYPE");
      expect(data.error).toContain("仅支持PDF和Word格式");
    });

    test("应该拒绝 .jpg 图片文件", async () => {
      const request = createMockRequest({
        name: "resume.jpg",
        type: "image/jpeg",
        size: 1024 * 1024,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("INVALID_FILE_TYPE");
    });

    test("应该拒绝 .exe 可执行文件", async () => {
      const request = createMockRequest({
        name: "malware.exe",
        type: "application/x-msdownload",
        size: 1024,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("INVALID_FILE_TYPE");
    });
  });

  describe("文件大小边界测试", () => {
    test("应该接受恰好 10MB 的文件", async () => {
      const request = createMockRequest({
        name: "resume.pdf",
        type: "application/pdf",
        size: 10 * 1024 * 1024, // 恰好 10MB
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    test("应该拒绝超过 10MB 的文件", async () => {
      const request = createMockRequest({
        name: "resume.pdf",
        type: "application/pdf",
        size: 10 * 1024 * 1024 + 1, // 10MB + 1 byte
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("FILE_TOO_LARGE");
      expect(data.error).toContain("不能超过10MB");
    });

    test("应该接受小文件（1KB）", async () => {
      const request = createMockRequest({
        name: "resume.pdf",
        type: "application/pdf",
        size: 1024, // 1KB
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });
  });

  describe("缺少文件测试", () => {
    test("应该拒绝没有文件的请求", async () => {
      const formData = new FormData();
      // 不添加文件

      const request = new Request("http://localhost:3000/api/resume/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("MISSING_FILE");
      expect(data.error).toContain("缺少文件字段");
    });

    test("应该拒绝空文件（0字节）", async () => {
      const request = createMockRequest({
        name: "empty.pdf",
        type: "application/pdf",
        size: 0, // 空文件
        content: "",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("EMPTY_FILE");
      expect(data.error).toContain("文件为空");
    });
  });

  describe("MIME类型验证测试", () => {
    test("应该拒绝扩展名正确但MIME类型错误的文件", async () => {
      const request = createMockRequest({
        name: "fake-resume.pdf",
        type: "text/plain", // 错误的MIME类型
        size: 1024,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("INVALID_MIME_TYPE");
      expect(data.error).toContain("文件类型不匹配");
    });
  });

  describe("认证测试", () => {
    test("应该拒绝未认证的请求", async () => {
      // Mock 未认证用户
      (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);

      const request = createMockRequest({
        name: "resume.pdf",
        type: "application/pdf",
        size: 1024,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("UNAUTHORIZED");
      expect(data.error).toContain("未授权");
    });

    test("应该拒绝包含API密钥的请求", async () => {
      const formData = new FormData();
      const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
      formData.append("file", file);
      formData.append("apiKey", "sk-test-key"); // 尝试提交密钥

      const request = new Request("http://localhost:3000/api/resume/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("FORBIDDEN_KEY");
    });
  });
});
