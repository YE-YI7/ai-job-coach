"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import ResumeDiffView from "@/components/ResumeDiffView";
import { useAuth } from "@/lib/useAuth";

// 模拟简历数据（实际应该从 API 或状态管理获取）
const MOCK_RESUME_DATA: Record<string, { original: string; optimized: string }> = {
  "1": {
    original: `张三
前端开发工程师
电话：138-0000-0000 | 邮箱：zhangsan@example.com

工作经历：
2020.01 - 至今  ABC公司  前端开发
- 负责前端页面开发
- 使用React开发组件
- 参与项目开发

项目经验：
项目A：电商平台
- 负责前端开发
- 使用React和TypeScript
- 完成了一些功能`,
    optimized: `张三
资深前端开发工程师 | 3年+经验
📞 138-0000-0000 | ✉️ zhangsan@example.com

💼 工作经历
2020.01 - 至今  ABC公司  前端开发工程师
• 负责核心业务模块的前端架构设计与开发，提升用户体验和页面性能
• 使用React + TypeScript构建可复用组件库，提高开发效率30%
• 参与敏捷开发流程，与产品、设计团队紧密协作，按时交付高质量项目

🚀 项目经验
项目A：大型电商平台（2021.03 - 2022.06）
• 负责前端核心功能开发，使用React + TypeScript + Redux技术栈
• 优化页面加载性能，首屏渲染时间从3s降至1.2s，提升用户体验
• 实现响应式设计，支持PC、移动端多端适配，用户满意度提升25%`,
  },
};

export default function ResumeDiffPage() {
  // 客户端认证检查（作为 middleware 的兜底）
  useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [resumeData, setResumeData] = useState<{ original: string; optimized: string } | null>(null);

  useEffect(() => {
    // 尝试从 localStorage 获取简历数据
    try {
      const saved = localStorage.getItem(`resume_${id}`);
      if (saved) {
        const data = JSON.parse(saved);
        setResumeData(data);
        return;
      }
    } catch (error) {
      console.error("读取简历数据失败:", error);
    }

    // 如果没有保存的数据，使用模拟数据
    if (MOCK_RESUME_DATA[id]) {
      setResumeData(MOCK_RESUME_DATA[id]);
    } else {
      // 如果没有找到数据，使用默认示例
      setResumeData({
        original: "这是原始简历文本...\n\n请从 DynamicBoard 点击进入以查看实际对比。",
        optimized: "这是优化后的简历文本...\n\n高亮部分表示新增或修改的内容。",
      });
    }
  }, [id]);

  const handleAccept = () => {
    console.log("接受优化版本");
    // 可以在这里保存到 localStorage 或调用 API
  };

  const handleEdit = (edited: string) => {
    console.log("保存编辑:", edited);
    // 保存编辑后的版本
    if (resumeData) {
      const updated = { ...resumeData, optimized: edited };
      localStorage.setItem(`resume_${id}`, JSON.stringify(updated));
      setResumeData(updated);
    }
  };

  if (!resumeData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <ResumeDiffView
      id={id}
      original={resumeData.original}
      optimized={resumeData.optimized}
      onAccept={handleAccept}
      onEdit={handleEdit}
    />
  );
}

