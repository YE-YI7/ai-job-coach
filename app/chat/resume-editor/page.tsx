"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import HRReviewTab from "@/components/HRReviewTab";
import { generateResumePDF, isResumeDataEmpty, type ResumeData } from "@/lib/pdf-generator";
import ExportSettingsDialog from "@/components/ExportSettingsDialog";
import { compressResume } from "@/lib/resume-compressor";
import { detectPageCount } from "@/lib/page-detector";
import { getTemplate, getDefaultTemplate } from "@/lib/resume-templates";
import ResumePreviewEditor from "@/components/ResumePreviewEditor";

type ResumeSection = {
  id: string;
  title: string;
  content: string;
  editable: boolean;
  aiEditable: boolean;
  collapsed: boolean;
};

type ResumePreview = {
  personalInfo: string;
  education: string;
  campusExperience: string;
  projects: string;
  workExperience: string;
  selfEvaluation: string;
};

export default function ResumeEditorPage() {
  const router = useRouter();
  const [sections, setSections] = useState<ResumeSection[]>([
    { id: "personal", title: "个人信息", content: "", editable: true, aiEditable: false, collapsed: false },
    { id: "education", title: "教育信息", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "campus", title: "在校经历", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "projects", title: "项目经历", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "work", title: "工作/实习经历", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "self", title: "个人评价", content: "", editable: true, aiEditable: true, collapsed: false },
  ]);

  const [preview, setPreview] = useState<ResumePreview>({
    personalInfo: "",
    education: "",
    campusExperience: "",
    projects: "",
    workExperience: "",
    selfEvaluation: "",
  });

  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [aiOptimizing, setAiOptimizing] = useState<string | null>(null);
  const [optimizedSection, setOptimizedSection] = useState<string | null>(null); // 新增：标记刚优化完成的分区
  
  // PDF导出相关状态
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<string>("");
  
  // Tab切换状态
  const [activeTab, setActiveTab] = useState<"edit" | "hr-review">("edit");
  
  // 文件上传相关状态
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // 头像数据
  const [avatarData, setAvatarData] = useState<{
    src: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // 从 localStorage 或 API 加载简历数据
  useEffect(() => {
    const loadResumeData = async () => {
      try {
        // 1. 先尝试从保存的编辑器数据加载
        const savedEditorData = localStorage.getItem("ajc_resumeEditor");
        if (savedEditorData) {
          const editorData = JSON.parse(savedEditorData);
          if (editorData.sections) {
            setSections(editorData.sections);
          }
          if (editorData.preview) {
            setPreview(editorData.preview);
          }
          if (editorData.avatarData) {
            setAvatarData(editorData.avatarData);
          }
          console.log("从localStorage恢复简历数据");
          return; // 如果有保存的数据，直接使用
        }

        // 2. 尝试从白板数据加载
        const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
        if (whiteboardDataStr) {
          const whiteboardData = JSON.parse(whiteboardDataStr);
          if (whiteboardData.resumeInsights && whiteboardData.resumeInsights.length > 0) {
            // 根据 AI 建议填充内容
            const insights = whiteboardData.resumeInsights;
            setSections((prev) => {
              return prev.map((section) => {
                // 简单映射：根据 section id 匹配对应的 insight
                const matchingInsight = insights.find((insight: any) => 
                  insight.section?.includes(section.title) || 
                  section.title.includes(insight.section || "")
                );
                if (matchingInsight && matchingInsight.optimized) {
                  return { ...section, content: matchingInsight.optimized };
                }
                return section;
              });
            });
          }
        }

        // 3. 尝试从对话历史解析简历信息
        try {
          const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
          const allMessages: any[] = [];
          
          if (chatHistoryStr) {
            const chatHistory = JSON.parse(chatHistoryStr);
            
            // 收集所有阶段的对话，优先使用简历优化阶段的，如果没有则使用所有阶段
            if (chatHistory["resume_optimization"] && Array.isArray(chatHistory["resume_optimization"])) {
              allMessages.push(...chatHistory["resume_optimization"]);
            } else {
              // 如果没有简历优化阶段的对话，收集所有阶段的对话
              Object.keys(chatHistory).forEach((stage) => {
                if (Array.isArray(chatHistory[stage])) {
                  allMessages.push(...chatHistory[stage]);
                }
              });
            }
            
            console.log("收集到的对话消息数量:", allMessages.length);
            
            if (allMessages.length > 0) {
              // 调用 API 解析简历信息
              const messages = allMessages.map((msg: any) => ({
                role: msg.isUser ? "user" : "assistant",
                content: msg.content,
              }));

              console.log("发送到解析 API 的消息:", messages.length, "条");

              const response = await fetch("/api/parse-resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages }),
              });

              if (response.ok) {
                const parsedData = await response.json();
                console.log("解析到的简历数据:", parsedData);
                
                // 填充到各个分区（只有当解析到的内容不为空时才填充）
                setSections((prev) => {
                  return prev.map((section) => {
                    let content = section.content;
                    switch (section.id) {
                      case "personal":
                        content = parsedData.personalInfo || content;
                        break;
                      case "education":
                        content = parsedData.education || content;
                        break;
                      case "campus":
                        content = parsedData.campusExperience || content;
                        break;
                      case "projects":
                        content = parsedData.projects || content;
                        break;
                      case "work":
                        content = parsedData.workExperience || content;
                        break;
                      case "self":
                        content = parsedData.selfEvaluation || content;
                        break;
                    }
                    // 只有当新内容不为空时才更新
                    if (content && content !== section.content) {
                      console.log(`填充 ${section.title}:`, content);
                    }
                    return { ...section, content };
                  });
                });
              } else {
                console.error("解析 API 返回错误:", response.status);
              }
            } else {
              console.log("没有找到对话历史");
            }
          } else {
            console.log("没有找到聊天历史记录");
          }
        } catch (parseError) {
          console.error("解析简历信息失败:", parseError);
        }
      } catch (error) {
        console.error("加载简历数据失败:", error);
      }
    };

    loadResumeData();
  }, []);

  // 自动保存sections和preview到localStorage（当数据变化时）
  useEffect(() => {
    // 防止初始化时立即保存空数据
    const hasContent = sections.some(s => s.content.trim() !== "") || 
                       Object.values(preview).some(v => v.trim() !== "");
    
    if (hasContent) {
      try {
        const resumeData = {
          sections,
          preview,
          avatarData,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem("ajc_resumeEditor", JSON.stringify(resumeData));
        console.log("自动保存简历数据到localStorage");
      } catch (error) {
        console.error("自动保存简历数据失败:", error);
      }
    }
  }, [sections, preview, avatarData]); // 当sections或preview或avatarData变化时自动保存

  const toggleSection = (id: string) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, collapsed: !section.collapsed } : section
      )
    );
  };

  const startEdit = (section: ResumeSection) => {
    setEditingSection(section.id);
    setEditContent(section.content);
  };

  const saveEdit = (id: string) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, content: editContent } : section
      )
    );
    setEditingSection(null);
    setEditContent("");
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setEditContent("");
  };

  const optimizeWithAI = async (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section) return;

    // 检查内容是否为空
    if (!section.content || section.content.trim() === "" || section.content === "（暂无内容）") {
      alert("该分区内容为空，无法优化。请先填充内容或上传简历。");
      return;
    }

    setAiOptimizing(id);
    try {
      // 计算原内容字数
      const originalLength = section.content.length;
      const minLength = Math.floor(originalLength * 0.5);
      const maxLength = Math.floor(originalLength * 2);

      // 构建优化提示词
      const optimizationPrompt = `请优化以下简历中的"${section.title}"部分内容。

【优化要求】
1. 使用STAR法则（情境-任务-行动-结果）重新组织内容
2. 突出量化成果和关键技能
3. 使用专业、简洁的语言
4. 保持原有信息的真实性
5. 使用纯文本格式，不要使用任何markdown标记（如*、**、#、-等）
6. 不要使用项目符号或列表符号
7. 字数控制在${minLength}-${maxLength}字之间
8. 直接返回优化后的内容，不要添加任何解释、前缀或后缀

【原内容】（${originalLength}字）
${section.content}

【输出格式】
纯文本，段落之间用空行分隔，不使用任何markdown或特殊符号。

请直接返回优化后的内容：`;

      // 使用 AbortController 实现前端超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90秒前端超时

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: optimizationPrompt,
            },
          ],
          stage: "resume_optimization",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        console.log("AI优化响应:", data);
        
        // 后端返回的是 { ok: true, result: "..." }
        if (data.ok && data.result) {
          // 清理可能的前缀和后缀
          let optimizedContent = data.result.trim();
          
          // 移除常见的AI回复前缀
          optimizedContent = optimizedContent
            .replace(/^(优化后的内容|优化结果|修改后|以下是优化后的内容)[：:]\s*/i, "")
            .replace(/^```[\s\S]*?\n/, "") // 移除markdown代码块开始
            .replace(/\n```$/, "") // 移除markdown代码块结束
            .trim();
          
          // 移除markdown格式标记
          optimizedContent = optimizedContent
            .replace(/\*\*([^*]+)\*\*/g, "$1") // 移除粗体 **text**
            .replace(/\*([^*]+)\*/g, "$1") // 移除斜体 *text*
            .replace(/^#+\s+/gm, "") // 移除标题 # ## ###
            .replace(/^[-*+]\s+/gm, "") // 移除列表符号
            .replace(/^\d+\.\s+/gm, "") // 移除数字列表
            .trim();
          
          // 更新内容
          setSections((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, content: optimizedContent } : s
            )
          );
          
          // 设置高亮状态，3秒后自动消失
          setOptimizedSection(id);
          setTimeout(() => setOptimizedSection(null), 3000);
        } else {
          console.error("AI返回数据格式错误:", data);
          alert("AI优化失败：返回数据格式错误");
        }
      } else {
        const errorData = await response.json();
        console.error("AI优化请求失败:", errorData);
        
        // 根据错误类型给出更友好的提示
        if (errorData.error?.includes("timeout") || errorData.error?.includes("timed out")) {
          alert(`AI优化超时：内容较长，AI处理时间超过限制。建议：\n1. 缩短内容后重试\n2. 分段优化\n3. 稍后再试`);
        } else if (errorData.error?.includes("quota") || errorData.error?.includes("配额")) {
          alert("AI优化失败：API配额不足，请联系管理员");
        } else {
          alert(`AI优化失败：${errorData.error || "请求失败"}`);
        }
      }
    } catch (error: any) {
      console.error("AI 优化失败:", error);
      
      // 处理前端超时
      if (error.name === "AbortError") {
        alert("AI优化超时：请求时间过长，已自动取消。建议缩短内容后重试。");
      } else {
        alert("AI优化失败：网络错误或服务器异常");
      }
    } finally {
      setAiOptimizing(null);
    }
  };

  const applyToPreview = (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section) return;

    setPreview((prev) => ({
      ...prev,
      [id === "personal" ? "personalInfo" :
        id === "education" ? "education" :
        id === "campus" ? "campusExperience" :
        id === "projects" ? "projects" :
        id === "work" ? "workExperience" :
        "selfEvaluation"]: section.content,
    }));
  };

  const downloadResume = () => {
    const resumeText = `
个人信息
${preview.personalInfo}

教育信息
${preview.education}

在校经历
${preview.campusExperience}

项目经历
${preview.projects}

工作/实习经历
${preview.workExperience}

个人评价
${preview.selfEvaluation}
    `.trim();

    const blob = new Blob([resumeText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "优化后的简历.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToPDF = async () => {
    // 验证内容不为空
    const resumeData: ResumeData = {
      personalInfo: preview.personalInfo,
      education: preview.education,
      campusExperience: preview.campusExperience,
      projects: preview.projects,
      workExperience: preview.workExperience,
      selfEvaluation: preview.selfEvaluation,
    };

    if (isResumeDataEmpty(resumeData)) {
      setExportError('预览内容为空，请先在左侧分区点击"应用"按钮填充内容');
      setTimeout(() => setExportError(null), 5000);
      return;
    }

    // Show export settings dialog
    setShowExportDialog(true);
  };

  const handleExportWithSettings = async (templateId: string, includePhoto: boolean) => {
    setShowExportDialog(false);
    
    try {
      setExportingPDF(true);
      setExportError(null);
      setCompressing(false);
      setCompressionProgress("");

      const resumeData: ResumeData = {
        personalInfo: preview.personalInfo,
        education: preview.education,
        campusExperience: preview.campusExperience,
        projects: preview.projects,
        workExperience: preview.workExperience,
        selfEvaluation: preview.selfEvaluation,
      };

      // Get template
      const template = getTemplate(templateId) || getDefaultTemplate();
      
      // Render initial HTML
      const initialElement = template.render(resumeData, { includePhoto });
      
      // Detect page count
      const detection = await detectPageCount(initialElement);
      console.log(`页面检测: ${detection.pageCount} 页`);

      let finalData = resumeData;

      // If exceeds one page, compress
      if (detection.exceedsOnePage) {
        setCompressing(true);
        setCompressionProgress("检测到内容超过1页，正在压缩...");

        const compressionResult = await compressResume(
          resumeData,
          (data) => template.render(data, { includePhoto }),
          (progress) => {
            setCompressionProgress(
              `正在压缩... 第 ${progress.iteration}/${progress.maxIterations} 次尝试`
            );
          }
        );

        if (compressionResult.success && compressionResult.compressedData) {
          finalData = compressionResult.compressedData;
          setCompressionProgress(`✓ 压缩成功！已压缩至 ${compressionResult.finalPageCount} 页`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // Compression failed, ask user
          const proceed = confirm(
            `无法将简历压缩至1页（当前${compressionResult.finalPageCount}页）。\n\n是否继续导出多页PDF？`
          );
          if (!proceed) {
            setExportingPDF(false);
            setCompressing(false);
            return;
          }
        }
      }

      // Generate PDF
      await generateResumePDF(finalData, {
        templateId,
        includePhoto,
      });

      setExportError(null);
    } catch (error: any) {
      console.error("PDF导出失败:", error);
      const errorMessage = error.message || "PDF导出失败，请重试";
      setExportError(errorMessage);
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingPDF(false);
      setCompressing(false);
      setCompressionProgress("");
    }
  };

  const deleteResume = () => {
    if (confirm("确定要删除当前简历吗？此操作将清空所有编辑内容和预览内容。")) {
      // 清空预览内容
      setPreview({
        personalInfo: "",
        education: "",
        campusExperience: "",
        projects: "",
        workExperience: "",
        selfEvaluation: "",
      });
      
      // 清空所有分区内容
      setSections((prev) =>
        prev.map((section) => ({
          ...section,
          content: "",
        }))
      );
      
      // 清空头像
      setAvatarData(null);
      
      // 清空localStorage中的简历数据
      try {
        localStorage.removeItem("ajc_resumeEditor");
        console.log("已清空localStorage中的简历数据");
      } catch (error) {
        console.error("清空localStorage失败:", error);
      }
      
      // 显示成功提示
      alert("简历已删除");
    }
  };

  const handleBack = () => {
    // 数据已通过useEffect自动保存，这里只需要保存当前阶段和返回标记
    try {
      localStorage.setItem("ajc_userStage", "resume_optimization");
      // 设置标记，让 /chat 页面知道需要显示阶段选择器
      localStorage.setItem("ajc_showStageSelector", "true");
    } catch (error) {
      console.error("保存阶段信息失败:", error);
    }
    
    router.push("/chat");
  };

  // 处理文件上传
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!validTypes.includes(file.type)) {
      setUploadError("仅支持PDF和Word格式文件（.pdf, .doc, .docx）");
      return;
    }

    // 验证文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("文件大小不能超过10MB");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "上传失败");
      }

      // 上传成功，填充数据
      console.log("简历上传成功:", data);
      fillSectionsFromParsedData(data.parsed);
      setUploadSuccess(true);

      // 3秒后清除成功提示
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (error: any) {
      console.error("上传简历失败:", error);
      setUploadError(error.message || "上传失败，请重试");
    } finally {
      setUploading(false);
      // 清空文件输入
      event.target.value = "";
    }
  };

  // 从解析数据填充分区（完全覆盖旧数据）
  const fillSectionsFromParsedData = (parsed: any) => {
    setSections((prev) =>
      prev.map((section) => {
        let content = ""; // 重置为空，完全覆盖旧数据

        switch (section.id) {
          case "self":
            // 个人评价 <- summary
            content = parsed.summary || "";
            break;

          case "education":
            // 教育信息 <- education
            if (parsed.education && parsed.education.length > 0) {
              content = parsed.education
                .map((edu: any) => {
                  const parts = [];
                  if (edu.school) parts.push(edu.school);
                  if (edu.degree) parts.push(edu.degree);
                  if (edu.time) parts.push(edu.time);
                  if (edu.text) parts.push(edu.text);
                  return parts.join("\n");
                })
                .join("\n\n");
            }
            break;

          case "work":
            // 工作/实习经历 <- experiences
            if (parsed.experiences && parsed.experiences.length > 0) {
              content = parsed.experiences
                .map((exp: any) => {
                  const parts = [];
                  if (exp.company) parts.push(`公司：${exp.company}`);
                  if (exp.title) parts.push(`职位：${exp.title}`);
                  if (exp.time) parts.push(`时间：${exp.time}`);
                  if (exp.text) parts.push(exp.text);
                  return parts.join("\n");
                })
                .join("\n\n");
            }
            break;

          case "projects":
            // 项目经历 <- projects
            if (parsed.projects && parsed.projects.length > 0) {
              content = parsed.projects
                .map((proj: any) => {
                  const parts = [];
                  if (proj.title) parts.push(`项目：${proj.title}`);
                  if (proj.role) parts.push(`角色：${proj.role}`);
                  if (proj.start && proj.end) parts.push(`时间：${proj.start} - ${proj.end}`);
                  if (proj.text) parts.push(proj.text);
                  return parts.join("\n");
                })
                .join("\n\n");
            }
            break;

          case "campus":
            // 在校经历 - 可以从skills或其他信息推断
            if (parsed.skills && parsed.skills.length > 0) {
              content = `技能：${parsed.skills.join("、")}`;
            }
            break;
        }

        return { ...section, content };
      })
    );
  };

  return (
    <React.Fragment>
      <div className="h-screen w-full bg-neutral-50 flex flex-col">
        {/* 顶部导航 */}
        <div className="w-full h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 flex-shrink-0 z-10">
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span>←</span>
            <span>返回</span>
          </motion.button>
          <h1 className="text-base font-semibold text-gray-900">简历优化编辑器</h1>
          
          {/* 上传按钮 */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              id="resume-upload"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label
              htmlFor="resume-upload"
              className={`px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                uploading
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {uploading ? "上传中..." : "上传简历"}
            </label>
          </div>
        </div>

        {/* 上传状态提示 */}
        {uploadError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between flex-shrink-0">
            <span className="text-sm text-red-700">{uploadError}</span>
            <button
              onClick={() => setUploadError(null)}
              className="text-red-700 hover:text-red-900"
            >
              ✕
            </button>
          </div>
        )}
        
        {uploadSuccess && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between flex-shrink-0">
            <span className="text-sm text-green-700">✓ 简历上传成功！内容已自动填充到各分区</span>
            <button
              onClick={() => setUploadSuccess(false)}
              className="text-green-700 hover:text-green-900"
            >
              ✕
            </button>
          </div>
        )}

        {/* 主内容区域 */}
        <div className="flex-1 flex min-h-0">{/* 关键：min-h-0 防止flex子元素溢出 */}
          {/* 左侧分区编辑区 */}
          <div className="w-[50%] border-r border-gray-200 bg-white flex flex-col">
            {/* Tab切换栏 */}
            <div className="flex border-b border-gray-200 px-6 pt-4">
              <button
                onClick={() => setActiveTab("edit")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "edit"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                编辑
              </button>
              <button
                onClick={() => setActiveTab("hr-review")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "hr-review"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                HR点评
              </button>
            </div>

            {/* Tab内容区 */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "edit" ? (
                // 编辑页
                <div className="space-y-4">
            {sections.map((section) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`border rounded-lg overflow-hidden transition-all duration-300 ${
                  optimizedSection === section.id
                    ? "border-green-400 shadow-lg shadow-green-100 bg-green-50"
                    : "border-gray-200"
                }`}
              >
                {/* 分区标题栏 */}
                <div
                  className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                    optimizedSection === section.id
                      ? "bg-green-100 hover:bg-green-150"
                      : "bg-gray-50 hover:bg-gray-100"
                  }`}
                  onClick={() => toggleSection(section.id)}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{section.title}</h3>
                    {optimizedSection === section.id && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full"
                      >
                        ✓ 已优化
                      </motion.span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {section.aiEditable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          optimizeWithAI(section.id);
                        }}
                        disabled={aiOptimizing === section.id}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                      >
                        {aiOptimizing === section.id ? "优化中..." : "AI优化"}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        applyToPreview(section.id);
                      }}
                      className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      应用
                    </button>
                    <span className="text-gray-400">
                      {section.collapsed ? "▼" : "▲"}
                    </span>
                  </div>
                </div>

                {/* 分区内容 */}
                {!section.collapsed && (
                  <div className="p-4">
                    {editingSection === section.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y"
                          rows={12}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(section.id)}
                            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
                          >
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700 whitespace-pre-wrap min-h-[180px] max-h-[400px] overflow-y-auto">
                          {section.content || "（暂无内容）"}
                        </div>
                        {section.editable && (
                          <button
                            onClick={() => startEdit(section)}
                            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            编辑
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
                </div>
              ) : (
                // HR点评页
                <HRReviewTab 
                  sections={sections} 
                  appliedContent={Object.values(preview).filter(v => v.trim() !== "").join("\n\n")}
                />
              )}
            </div>
          </div>

          {/* 右侧预览区 */}
          <div className="w-[50%] bg-white overflow-y-auto p-6">
          {/* 错误提示 */}
          {exportError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
              <span className="text-sm text-red-700">{exportError}</span>
              <button
                onClick={() => setExportError(null)}
                className="text-red-700 hover:text-red-900"
              >
                ✕
              </button>
            </div>
          )}
          
          {/* 压缩进度提示 */}
          {compressing && compressionProgress && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span className="text-sm text-blue-700">{compressionProgress}</span>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">简历预览</h2>
            <div className="flex gap-2">
              <button
                onClick={exportToPDF}
                disabled={exportingPDF}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  exportingPDF
                    ? "bg-blue-400 text-white cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {exportingPDF ? (compressing ? "压缩中..." : "导出中...") : "导出PDF"}
              </button>
              <button
                onClick={downloadResume}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                下载TXT
              </button>
              <button
                onClick={deleteResume}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
              >
                删除
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
            <ResumePreviewEditor
              preview={preview}
              onPreviewChange={setPreview}
              avatarData={avatarData}
              onAvatarChange={setAvatarData}
            />
          </div>
          </div>
        </div>
      </div>
      
      {/* Export Settings Dialog */}
      <ExportSettingsDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleExportWithSettings}
      />
    </React.Fragment>
  );
}

