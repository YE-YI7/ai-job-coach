"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import StageController from "@/components/StageController";
import ChatFlow, { Message } from "@/components/ChatFlow";
import Whiteboard, { WhiteboardData } from "@/components/Whiteboard";
import WhiteboardCanvas from "@/components/WhiteboardCanvas";
import StageTransitionModal from "@/components/StageTransitionModal";
import StageSelector from "@/components/StageSelector";
import { Confetti, CelebrationModal, type EncouragementType } from "@/components/CelebrationSystem";
import { useStageFSM, STAGE_ORDER, STAGE_NAMES } from "@/lib/fsm";
import { UserStage, StageNames, getNextStage, isValidStage } from "@/lib/stage";

export default function ChatPage() {
  const router = useRouter();
  const fsm = useStageFSM("career");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 添加日志追踪 isLoading 的变化
  useEffect(() => {
    console.log("[DEBUG] isLoading changed:", isLoading);
  }, [isLoading]);
  const [whiteboardData, setWhiteboardData] = useState<WhiteboardData>({});
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [pendingNextStage, setPendingNextStage] = useState<string | null>(null);
  const analyzeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 白板显示/隐藏状态
  const [isWhiteboardVisible, setIsWhiteboardVisible] = useState(true);
  
  // 庆祝系统状态
  const [showConfetti, setShowConfetti] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationType, setCelebrationType] = useState<EncouragementType>("milestone_complete");
  const [celebrationTitle, setCelebrationTitle] = useState<string>("");

  // 里程碑回调
  const handleMilestone = useCallback((completedCount: number, totalCount: number) => {
    if (completedCount === totalCount && totalCount > 0) {
      // 全部完成
      setCelebrationType("milestone_complete");
      setCelebrationTitle("阶段任务全部完成！");
      setShowConfetti(true);
      setShowCelebration(true);
      setTimeout(() => setShowConfetti(false), 3000);
    } else if (completedCount >= Math.ceil(totalCount / 2) && totalCount > 2) {
      // 过半
      setCelebrationType("milestone_half");
      setCelebrationTitle("进度过半！");
      setShowCelebration(true);
    }
  }, []);
  
  // 维护 userStage 状态
  const [userStage, setUserStage] = useState<UserStage>("career_planning");
  
  // 维护 userId 和 sessionId
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // 简历优化阶段状态管理
  const [resumeData, setResumeData] = useState<any>(null);
  const [isResumeProcessing, setIsResumeProcessing] = useState(false);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);

  // 旧面试逻辑已移除 - 现在使用 /app/interview/start/page.tsx

  // 从数据库加载会话数据（优先于 localStorage）
  useEffect(() => {
    const loadSession = async () => {
      try {
        // 从 localStorage 读取 inviteCode、userId、sessionId
        const savedInviteCode = localStorage.getItem("inviteCode");
        const savedUserId = localStorage.getItem("userId");
        let savedSessionId = localStorage.getItem("sessionId");

        // 如果 sessionId 不存在，生成随机 UUID 并保存
        if (!savedSessionId) {
          savedSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          localStorage.setItem("sessionId", savedSessionId);
        }

        // 更新状态
        if (savedUserId) {
          setUserId(savedUserId);
        }
        setSessionId(savedSessionId);

        // 调用 API 加载会话
        const response = await fetch("/api/load-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: savedUserId,
            sessionId: savedSessionId,
            inviteCode: savedInviteCode,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          // 保存 userId 和 sessionId
          if (data.userId) {
            localStorage.setItem("userId", data.userId);
            setUserId(data.userId);
          }
          if (data.sessionId) {
            localStorage.setItem("sessionId", data.sessionId);
            setSessionId(data.sessionId);
          }

          // 恢复消息 - 直接使用后端返回的格式 { role: "...", content: "..." }
          if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
            // 转换消息格式：后端格式 { role, content } -> 前端格式 { id, content, isUser, timestamp }
            const formattedMessages: Message[] = data.messages.map((msg: any, index: number) => ({
              id: msg.id || `msg_${Date.now()}_${index}`,
              content: msg.content,
              isUser: msg.isUser !== undefined ? msg.isUser : (msg.role === "user"),
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            }));
            setMessages(formattedMessages);
          }

          // 恢复白板数据
          if (data.whiteboard && Object.keys(data.whiteboard).length > 0) {
            setWhiteboardData(data.whiteboard);
          }

          // 恢复当前阶段
          if (data.currentStage && isValidStage(data.currentStage)) {
            setUserStage(data.currentStage);
            
            // 同步更新 FSM
            const fsmStageMap: Record<UserStage, string> = {
              career_planning: "career",
              project_review: "project",
              resume_optimization: "resume",
              application_strategy: "apply",
              interview: "interview",
              salary_talk: "offer",
              offer: "offer",
            };
            const fsmStage = fsmStageMap[data.currentStage as UserStage];
            if (fsmStage) {
              fsm.transition(fsmStage);
            }
          }
        } else {
          console.error("加载会话失败:", await response.text());
          // 如果加载失败，回退到 localStorage
          loadFromLocalStorage();
        }
      } catch (error) {
        console.error("加载会话失败:", error);
        // 如果加载失败，回退到 localStorage
        loadFromLocalStorage();
      } finally {
        setIsLoadingSession(false);
      }
    };

    // 从 localStorage 加载的降级函数
    const loadFromLocalStorage = () => {
      try {
        // 尝试从 localStorage 读取保存的 userStage
        const savedUserStage = localStorage.getItem("ajc_userStage");
        if (savedUserStage && isValidStage(savedUserStage)) {
          setUserStage(savedUserStage);
          
          // 加载该阶段的聊天记录
          const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
          if (chatHistoryStr) {
            const chatHistory = JSON.parse(chatHistoryStr);
            const stageMessages = chatHistory[savedUserStage];
            
            if (stageMessages && Array.isArray(stageMessages)) {
              const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
                id: msg.id,
                content: msg.content,
                isUser: msg.isUser,
                timestamp: new Date(msg.timestamp),
              }));
              setMessages(restoredMessages);
            }
          }
        }

        // 加载白板数据
        const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
        if (whiteboardDataStr) {
          const whiteboardData = JSON.parse(whiteboardDataStr);
          if (whiteboardData && Object.keys(whiteboardData).length > 0) {
            setWhiteboardData(whiteboardData);
          }
        }
      } catch (error) {
        console.error("从 localStorage 加载失败:", error);
      }
    };

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 从 localStorage 读取用户数据并初始化 userStage（已废弃，保留作为降级方案）
  useEffect(() => {
    try {
      const userData = localStorage.getItem("ajc_user");
      if (userData) {
        const data = JSON.parse(userData);
        if (data.currentStage) {
          // 将中文阶段名映射到 UserStage
          const stageMap: Record<string, UserStage> = {
            "职业规划": "career_planning",
            "项目梳理": "project_review",
            "简历优化": "resume_optimization",
            "投递策略": "application_strategy",
            "面试辅导": "interview",
            "谈薪策略": "salary_talk",
            "Offer": "offer",
          };
          const mappedStage = stageMap[data.currentStage];
          if (mappedStage && isValidStage(mappedStage)) {
            setUserStage(mappedStage);
          }
          
          // 同时更新 FSM（用于 UI 显示）
          const fsmStageMap: Record<string, string> = {
            "职业规划": "career",
            "项目梳理": "project",
            "简历优化": "resume",
            "投递策略": "apply",
            "面试辅导": "interview",
            "谈薪策略": "offer",
            "Offer": "offer",
          };
          const stageKey = fsmStageMap[data.currentStage] || "career";
          if (fsm.getCurrent() !== stageKey) {
            fsm.transition(stageKey);
          }
        }
      }
      
      // 尝试从 localStorage 读取保存的 userStage
      const savedUserStage = localStorage.getItem("ajc_userStage");
      if (savedUserStage && isValidStage(savedUserStage)) {
        setUserStage(savedUserStage);
        // 加载该阶段的聊天记录
        const loadStageChatHistory = (stage: UserStage) => {
          try {
            const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
            if (chatHistoryStr) {
              const chatHistory = JSON.parse(chatHistoryStr);
              const stageMessages = chatHistory[stage];
              
              if (stageMessages && Array.isArray(stageMessages)) {
                const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
                  id: msg.id,
                  content: msg.content,
                  isUser: msg.isUser,
                  timestamp: new Date(msg.timestamp),
                }));
                setMessages(restoredMessages);
              }
            }
          } catch (error) {
            console.error("加载聊天记录失败:", error);
          }
        };
        loadStageChatHistory(savedUserStage as UserStage);
      } else {
        // 如果没有保存的阶段，加载默认阶段的聊天记录
        const loadStageChatHistory = (stage: UserStage) => {
          try {
            const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
            if (chatHistoryStr) {
              const chatHistory = JSON.parse(chatHistoryStr);
              const stageMessages = chatHistory[stage];
              
              if (stageMessages && Array.isArray(stageMessages)) {
                const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
                  id: msg.id,
                  content: msg.content,
                  isUser: msg.isUser,
                  timestamp: new Date(msg.timestamp),
                }));
                setMessages(restoredMessages);
              }
            }
          } catch (error) {
            console.error("加载聊天记录失败:", error);
          }
        };
        loadStageChatHistory("career_planning");
      }
    } catch (error) {
      console.error("Failed to load user data:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次
  
  // 保存 userStage 到 localStorage
  useEffect(() => {
    localStorage.setItem("ajc_userStage", userStage);
  }, [userStage]);

  // 旧面试自动启动逻辑已移除 - 现在使用 /app/interview/start/page.tsx

  // 保存 whiteboardData 到 localStorage
  useEffect(() => {
    if (Object.keys(whiteboardData).length > 0) {
      localStorage.setItem("ajc_whiteboardData", JSON.stringify(whiteboardData));
    }
  }, [whiteboardData]);


  // 暴露 setWhiteboardData 到全局，方便在控制台测试
  useEffect(() => {
    (window as any).setWhiteboardData = (data: WhiteboardData) => {
      setWhiteboardData(data);
      console.log("whiteboardData 已更新:", data);
    };
    return () => {
      delete (window as any).setWhiteboardData;
    };
  }, []);

  const [showStageSelector, setShowStageSelector] = useState(false);

  // 检查是否需要显示阶段选择器（从简历编辑器返回时）
  useEffect(() => {
    const shouldShowSelector = localStorage.getItem("ajc_showStageSelector");
    if (shouldShowSelector === "true") {
      setShowStageSelector(true);
      // 清除标记
      localStorage.removeItem("ajc_showStageSelector");
    }
  }, []);

  // 当显示阶段选择器时禁止页面滚动
  useEffect(() => {
    if (showStageSelector) {
      // 禁止滚动
      document.body.style.overflow = 'hidden';
    } else {
      // 恢复滚动
      document.body.style.overflow = '';
    }
    
    // 清理函数：组件卸载时恢复滚动
    return () => {
      document.body.style.overflow = '';
    };
  }, [showStageSelector]);

  const handleBack = () => {
    // 点击返回按钮时，显示阶段选择页面
    setShowStageSelector(true);
  };

  // 保存当前阶段的聊天记录
  const saveStageChatHistory = (stage: UserStage, chatMessages: Message[]) => {
    try {
      const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
      const chatHistory = chatHistoryStr ? JSON.parse(chatHistoryStr) : {};
      
      // 保存该阶段的聊天记录
      chatHistory[stage] = chatMessages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        isUser: msg.isUser,
        timestamp: msg.timestamp.toISOString(),
      }));
      
      localStorage.setItem("ajc_chatHistory", JSON.stringify(chatHistory));
    } catch (error) {
      console.error("保存聊天记录失败:", error);
    }
  };

  // 加载特定阶段的聊天记录
  const loadStageChatHistory = (stage: UserStage) => {
    try {
      const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
      if (chatHistoryStr) {
        const chatHistory = JSON.parse(chatHistoryStr);
        const stageMessages = chatHistory[stage];
        
        if (stageMessages && Array.isArray(stageMessages)) {
          // 恢复该阶段的聊天记录
          const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            isUser: msg.isUser,
            timestamp: new Date(msg.timestamp),
          }));
          setMessages(restoredMessages);
        } else {
          // 如果没有该阶段的记录，清空消息
          setMessages([]);
        }
      } else {
        // 如果没有聊天记录，清空消息
        setMessages([]);
      }
    } catch (error) {
      console.error("加载聊天记录失败:", error);
      setMessages([]);
    }
  };

  // 旧面试引导流程函数已移除 - 现在使用 /app/interview/start/page.tsx

  // 简历上传处理函数
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsResumeProcessing(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setResumeData(data);
      } else {
        const errorText = await response.text();
        console.error("简历解析失败:", errorText);
      }
    } catch (error) {
      console.error("网络或 API 错误:", error);
    } finally {
      setIsResumeProcessing(false);
      event.target.value = '';
    }
  };

  // 删除简历数据
  const handleDeleteResume = () => {
    setResumeData(null);
    setIsPreviewCollapsed(false);
  };

  // 下载简历（占位函数）
  const handleDownloadResume = () => {
    console.log('Download button clicked. Placeholder logic.');
  };

  // 旧面试启动函数已移除 - 现在使用 /app/interview/start/page.tsx

  const handleSelectStage = (stage: UserStage) => {
    // 先保存当前阶段的聊天记录
    saveStageChatHistory(userStage, messages);
    
    // 获取阶段的中文名称
    const stageName = StageNames[stage];
    
    // 如果是面试阶段，跳转到新的面试页面
    if (stage === "interview") {
      router.push("/interview/start");
      return;
    }
    
    // 如果是简历优化阶段，跳转到简历编辑器页面
    if (stage === "resume_optimization") {
      router.push("/chat/resume-editor");
      return;
    }
    
    // 切换到选中的阶段
    setUserStage(stage);
    
    // 同步更新 FSM
    const fsmStageMap: Record<UserStage, string> = {
      career_planning: "career",
      project_review: "project",
      resume_optimization: "resume",
      application_strategy: "apply",
      interview: "interview",
      salary_talk: "offer",
      offer: "offer",
    };
    const fsmStage = fsmStageMap[stage];
    if (fsmStage) {
      fsm.transition(fsmStage);
    }
    
    // 加载该阶段的聊天记录
    loadStageChatHistory(stage);
    
    // 检查该阶段是否有聊天记录，只在首次进入时发送开场白
    const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
    let hasHistory = false;
    if (chatHistoryStr) {
      try {
        const chatHistory = JSON.parse(chatHistoryStr);
        const stageMessages = chatHistory[stage];
        hasHistory = stageMessages && Array.isArray(stageMessages) && stageMessages.length > 0;
      } catch (e) {
        console.error("检查聊天记录失败:", e);
      }
    }
    
    // 只在首次进入该阶段时发送开场白
    if (!hasHistory) {
      sendStageGreeting(stageName);
    }
    
    // 隐藏阶段选择器
    setShowStageSelector(false);
  };

  // 暴露 FSM 到全局，方便在控制台测试
  // 使用 useRef 来稳定引用，避免重复设置
  const fsmRef = useRef(fsm);
  fsmRef.current = fsm;
  
  useEffect(() => {
    (window as any).fsm = {
      transition: (stage: string) => fsmRef.current.transition(stage),
      back: () => fsmRef.current.back(),
      getCurrent: () => fsmRef.current.getCurrent(),
      getCurrentName: () => fsmRef.current.getCurrentName(),
      canGoBack: () => fsmRef.current.canGoBack(),
    };
    return () => {
      delete (window as any).fsm;
    };
  }, []); // 只在组件挂载时执行一次

  // 获取下一个阶段
  const getNextStage = (currentStage: string): string | null => {
    const currentIndex = STAGE_ORDER.indexOf(currentStage as any);
    if (currentIndex < STAGE_ORDER.length - 1) {
      return STAGE_ORDER[currentIndex + 1];
    }
    return null;
  };

  // 分析对话并更新白板数据
  const analyzeConversation = async () => {
    try {
      // 获取所有消息（用于完整上下文）
      const allMessages = messages.map((msg) => ({
        role: msg.isUser ? "user" : "assistant" as const,
        content: msg.content,
      }));

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: allMessages,
          userStage: userStage, // 传递当前阶段
          sessionId: sessionId, // 传递 sessionId
        }),
      });

      if (!response.ok) {
        throw new Error(`分析 API 错误: ${response.status}`);
      }

      const analyzeData: WhiteboardData = await response.json();
      console.log("白板分析结果:", analyzeData);

      // 合并新数据到现有白板数据（保留已有数据，只更新新字段）
      setWhiteboardData((prev) => {
        const merged: WhiteboardData = { ...prev };

        // 合并数组字段（追加新项，避免重复）
        if (analyzeData.starProjects && analyzeData.starProjects.length > 0) {
          const existingIds = new Set((prev.starProjects || []).map((p) => p.id));
          const newProjects = analyzeData.starProjects.filter((p) => !existingIds.has(p.id));
          merged.starProjects = [...(prev.starProjects || []), ...newProjects];
        }

        if (analyzeData.resumeInsights && analyzeData.resumeInsights.length > 0) {
          const existingIds = new Set((prev.resumeInsights || []).map((i) => i.id));
          const newInsights = analyzeData.resumeInsights.filter((i) => !existingIds.has(i.id));
          merged.resumeInsights = [...(prev.resumeInsights || []), ...newInsights];
        }

        if (analyzeData.interviewReports && analyzeData.interviewReports.length > 0) {
          const existingIds = new Set((prev.interviewReports || []).map((r) => r.id));
          const newReports = analyzeData.interviewReports.filter((r) => !existingIds.has(r.id));
          merged.interviewReports = [...(prev.interviewReports || []), ...newReports];
        }

        // 直接覆盖非数组字段（如果新数据存在）
        if (analyzeData.intentRole) merged.intentRole = analyzeData.intentRole;
        if (analyzeData.keySkills && analyzeData.keySkills.length > 0) {
          // 合并技能，去重
          const existingSkills = new Set(prev.keySkills || []);
          merged.keySkills = [
            ...(prev.keySkills || []),
            ...analyzeData.keySkills.filter((s) => !existingSkills.has(s)),
          ];
        }
        if (analyzeData.targetCompanies && analyzeData.targetCompanies.length > 0) {
          merged.targetCompanies = analyzeData.targetCompanies;
        }
        if (analyzeData.salaryStrategy) {
          merged.salaryStrategy = analyzeData.salaryStrategy;
        }
        if (analyzeData.offers && analyzeData.offers.length > 0) {
          merged.offers = analyzeData.offers;
        }

        return merged;
      });
    } catch (error) {
      console.error("分析对话失败:", error);
    }
  };

  // Debounce 分析函数（使用 ref 确保访问最新状态）
  const messagesRef = useRef(messages);
  const userStageRef = useRef(userStage);
  const sessionIdRef = useRef(sessionId);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  useEffect(() => {
    userStageRef.current = userStage;
  }, [userStage]);
  
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const debouncedAnalyze = useRef(() => {
    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
    }
    analyzeTimeoutRef.current = setTimeout(async () => {
      try {
        // 使用 ref 获取最新的 messages 和 userStage
        const allMessages = messagesRef.current.map((msg) => ({
          role: msg.isUser ? "user" : "assistant" as const,
          content: msg.content,
        }));

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: allMessages,
            userStage: userStageRef.current,
            sessionId: sessionIdRef.current, // 传递 sessionId
          }),
        });

        if (!response.ok) {
          throw new Error(`分析 API 错误: ${response.status}`);
        }

        const analyzeData: WhiteboardData = await response.json();
        console.log("自动分析结果:", analyzeData);

        // 合并新数据到现有白板数据
        setWhiteboardData((prev) => {
          const merged: WhiteboardData = { ...prev };

          // 合并数组字段（追加新项，避免重复）
          if (analyzeData.starProjects && analyzeData.starProjects.length > 0) {
            const existingIds = new Set((prev.starProjects || []).map((p) => p.id));
            const newProjects = analyzeData.starProjects.filter((p) => !existingIds.has(p.id));
            merged.starProjects = [...(prev.starProjects || []), ...newProjects];
          }

          if (analyzeData.resumeInsights && analyzeData.resumeInsights.length > 0) {
            const existingIds = new Set((prev.resumeInsights || []).map((i) => i.id));
            const newInsights = analyzeData.resumeInsights.filter((i) => !existingIds.has(i.id));
            merged.resumeInsights = [...(prev.resumeInsights || []), ...newInsights];
          }

          if (analyzeData.interviewReports && analyzeData.interviewReports.length > 0) {
            const existingIds = new Set((prev.interviewReports || []).map((r) => r.id));
            const newReports = analyzeData.interviewReports.filter((r) => !existingIds.has(r.id));
            merged.interviewReports = [...(prev.interviewReports || []), ...newReports];
          }

          // 直接覆盖非数组字段（如果新数据存在）
          if (analyzeData.intentRole) merged.intentRole = analyzeData.intentRole;
          if (analyzeData.keySkills && analyzeData.keySkills.length > 0) {
            const existingSkills = new Set(prev.keySkills || []);
            merged.keySkills = [
              ...(prev.keySkills || []),
              ...analyzeData.keySkills.filter((s) => !existingSkills.has(s)),
            ];
          }
          if (analyzeData.targetCompanies && analyzeData.targetCompanies.length > 0) {
            merged.targetCompanies = analyzeData.targetCompanies;
          }
          if (analyzeData.salaryStrategy) {
            merged.salaryStrategy = analyzeData.salaryStrategy;
          }
          if (analyzeData.offers && analyzeData.offers.length > 0) {
            merged.offers = analyzeData.offers;
          }

          // 保存合并后的白板数据到数据库（异步，不阻塞 UI）
          if (sessionIdRef.current && Object.keys(merged).length > 0) {
            fetch("/api/save-whiteboard", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                data: merged,  // 修复：使用 data 字段而不是 whiteboard
              }),
            }).catch(err => console.error("保存白板数据失败:", err));
          }

          return merged;
        });
      } catch (error) {
        console.error("自动分析失败:", error);
      }
    }, 1000); // 1秒 debounce
  }).current;

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (analyzeTimeoutRef.current) {
        clearTimeout(analyzeTimeoutRef.current);
      }
    };
  }, []);

  // 处理阶段切换确认
  const handleConfirmTransition = () => {
    if (pendingNextStage && isValidStage(pendingNextStage)) {
      // 保存当前阶段聊天记录
      saveStageChatHistory(userStage, messages);
      
      const nextStage = pendingNextStage as UserStage;
      
      // 如果是面试阶段，跳转到面试页面
      if (nextStage === "interview") {
        setShowTransitionModal(false);
        setPendingNextStage(null);
        router.push("/interview/start");
        return;
      }
      
      // 如果是简历优化阶段，跳转到简历编辑器
      if (nextStage === "resume_optimization") {
        setShowTransitionModal(false);
        setPendingNextStage(null);
        router.push("/chat/resume-editor");
        return;
      }
      
      // 更新 userStage
      setUserStage(nextStage);
      
      // 同步更新 FSM
      const fsmStageMap: Record<UserStage, string> = {
        career_planning: "career",
        project_review: "project",
        resume_optimization: "resume",
        application_strategy: "apply",
        interview: "interview",
        salary_talk: "offer",
        offer: "offer",
      };
      const fsmStage = fsmStageMap[nextStage];
      if (fsmStage) {
        fsm.transition(fsmStage);
      }
      
      // 加载新阶段的聊天记录
      loadStageChatHistory(nextStage);
      
      // 检查是否有聊天记录，首次进入发送开场白
      const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
      let hasHistory = false;
      if (chatHistoryStr) {
        try {
          const chatHistory = JSON.parse(chatHistoryStr);
          const stageMessages = chatHistory[nextStage];
          hasHistory = stageMessages && Array.isArray(stageMessages) && stageMessages.length > 0;
        } catch (e) { /* silent */ }
      }
      if (!hasHistory) {
        sendStageGreeting(StageNames[nextStage]);
      }
      
      setShowTransitionModal(false);
      setPendingNextStage(null);
    }
  };

  // 处理阶段切换取消
  const handleCancelTransition = () => {
    setShowTransitionModal(false);
    setPendingNextStage(null);
  };

  // 暴露 analyzeConversation 到全局，方便手动触发
  const analyzeRef = useRef(analyzeConversation);
  analyzeRef.current = analyzeConversation;
  
  useEffect(() => {
    (window as any).analyzeConversation = () => analyzeRef.current();
    return () => {
      delete (window as any).analyzeConversation;
    };
  }, []); // 只在组件挂载时执行一次

  // 阶段开场白 fallback 文案映射
  const stageGreetingFallback: Record<string, string> = {
    "职业规划": "让我们一起来规划你的职业发展路径吧。",
    "项目梳理": "开始梳理你的项目经历，挖掘亮点。",
    "简历优化": "让我们优化你的简历，突出核心竞争力。",
    "投递策略": "制定精准的投递策略，提高面试通过率。",
    "模拟面试": "开始模拟面试，提升你的面试表现。",
    "薪资沟通": "制定薪资谈判策略，争取理想薪资。",
    "Offer": "分析 Offer 细节，做出最佳选择。",
  };

  // 发送阶段开场白
  const sendStageGreeting = async (stage: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

      const response = await fetch('/api/stage-greeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.ok === true && data.result) {
        // 成功获取开场白，添加到消息列表
        const greetingMessage: Message = {
          id: `greeting_${Date.now()}`,
          content: data.result,
          isUser: false,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, greetingMessage]);
      } else {
        // API 返回失败，使用 fallback
        throw new Error(data.error || 'API 返回失败');
      }
    } catch (error: any) {
      console.warn('获取阶段开场白失败:', error);
      
      // 使用 fallback 文案
      const fallbackText = stageGreetingFallback[stage] || `开始${stage}阶段的工作。`;
      const fallbackMessage: Message = {
        id: `greeting_fallback_${Date.now()}`,
        content: fallbackText,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) {
      return;
    }

    const messageContent = inputValue.trim();

    // 旧面试模式特殊处理已移除 - 现在使用 /app/interview/start/page.tsx

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    console.log("[DEBUG] Setting isLoading = true");
    setIsLoading(true);

    // 添加超时保护：30秒后强制重置 isLoading
    const timeoutId = setTimeout(() => {
      console.warn("API 调用超时，强制重置 isLoading");
      setIsLoading(false);
    }, 30000);

    try {
      // 从 localStorage 获取必要的 session 信息
      const currentSessionId = sessionId || localStorage.getItem("sessionId");
      const currentUserId = userId || localStorage.getItem("userId");
      const currentInviteCode = localStorage.getItem("inviteCode");

      // 构建 messages 数组：将当前 messages 转换为 { role, content } 格式
      const messagesArray: Array<{ role: "user" | "assistant" | "system"; content: string }> = messages.map((msg) => ({
        role: msg.isUser ? "user" : "assistant",
        content: msg.content,
      }));

      // 旧面试引导流程系统提示已移除 - 现在使用 /app/interview/start/page.tsx

      // 添加当前用户消息
      messagesArray.push({
        role: "user",
        content: messageContent,
      });

      // 确保 messages 数组不为空（至少包含当前用户消息）
      if (messagesArray.length === 0) {
        messagesArray.push({
          role: "user",
          content: messageContent,
        });
      }

      // 构建请求体，只包含必要字段，不发送 undefined
      const requestBody: any = {
        messages: messagesArray,
        stage: userStage, // 添加当前阶段，用于选择对应的提示词
      };

      if (currentSessionId) {
        requestBody.sessionId = currentSessionId;
      }
      if (currentUserId) {
        requestBody.userId = currentUserId;
      }
      if (currentInviteCode) {
        requestBody.inviteCode = currentInviteCode;
      }

      // 调用 API 获取 AI 回复
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      // 检查响应状态
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.reply || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // 验证响应结构（开发调试用）
      console.log("API 响应数据:", data);
      console.log("ok 字段:", data.ok);
      console.log("result 字段:", data.result);

      // 检查响应是否成功
      if (!data.ok) {
        throw new Error(data.error || "API 请求失败");
      }

      // 使用 data.result 作为 AI 回复
      const aiReply = data.result;
      
      if (!aiReply || typeof aiReply !== "string") {
        console.warn("警告: API 响应缺少 result 字段或格式不正确");
        throw new Error("API 响应格式不正确：缺少 result 字段");
      }

      // 旧 config_complete JSON 检测已移除 - 现在使用 /app/interview/start/page.tsx

      // 添加 AI 回复
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiReply,
        isUser: false,
        timestamp: new Date(),
      };

      // 先重置 isLoading，再添加消息，确保 ChatFlow 的 useEffect 能正确触发
      setIsLoading(false);
      clearTimeout(timeoutId); // 清理超时定时器
      setMessages((prev) => [...prev, aiMessage]);

      // 更新白板数据（如果返回了 structured 数据）
      if (data.structured && Object.keys(data.structured).length > 0) {
        setWhiteboardData((prev) => {
          const merged: WhiteboardData = { ...prev };

          // 合并 structured 数据到白板
          if (data.structured.intentRole) {
            merged.intentRole = data.structured.intentRole;
          }
          if (data.structured.keySkills && Array.isArray(data.structured.keySkills)) {
            const existingSkills = new Set(prev.keySkills || []);
            merged.keySkills = [
              ...(prev.keySkills || []),
              ...data.structured.keySkills.filter((s: string) => !existingSkills.has(s)),
            ];
          }
          if (data.structured.starProjects && Array.isArray(data.structured.starProjects)) {
            const existingIds = new Set((prev.starProjects || []).map((p) => p.id));
            const newProjects = data.structured.starProjects.filter(
              (p: any) => !existingIds.has(p.id)
            );
            merged.starProjects = [...(prev.starProjects || []), ...newProjects];
          }
          if (data.structured.resumeInsights && Array.isArray(data.structured.resumeInsights)) {
            const existingIds = new Set((prev.resumeInsights || []).map((i) => i.id));
            const newInsights = data.structured.resumeInsights.filter(
              (i: any) => !existingIds.has(i.id)
            );
            merged.resumeInsights = [...(prev.resumeInsights || []), ...newInsights];
          }
          if (data.structured.interviewReports && Array.isArray(data.structured.interviewReports)) {
            const existingIds = new Set((prev.interviewReports || []).map((r) => r.id));
            const newReports = data.structured.interviewReports.filter(
              (r: any) => !existingIds.has(r.id)
            );
            merged.interviewReports = [...(prev.interviewReports || []), ...newReports];
          }
          if (data.structured.targetCompanies && Array.isArray(data.structured.targetCompanies)) {
            merged.targetCompanies = data.structured.targetCompanies;
          }
          if (data.structured.salaryStrategy) {
            merged.salaryStrategy = data.structured.salaryStrategy;
          }
          if (data.structured.offers && Array.isArray(data.structured.offers)) {
            merged.offers = data.structured.offers;
          }

          return merged;
        });
      }

      // 处理阶段推进 — 显示弹窗让用户选择
      if (data.shouldAdvance && data.nextStage && isValidStage(data.nextStage)) {
        const nextStage = data.nextStage;
        console.log(`阶段推进建议: ${StageNames[userStage]} -> ${StageNames[nextStage as UserStage]}`);
        
        // 显示阶段切换确认弹窗
        setPendingNextStage(nextStage);
        setShowTransitionModal(true);
      }

      // 每次 AI 回复后，自动调用分析（带 debounce）
      debouncedAnalyze();
      
      // 保存当前阶段的聊天记录
      const updatedMessages = [...messages, userMessage, aiMessage];
      saveStageChatHistory(userStage, updatedMessages);

      // 异步保存聊天记录到后端（不阻塞UI，不使用await）
      // 构建保存请求体，只包含必要字段
      const saveRequestBody: any = {
        messages: updatedMessages.map((msg) => ({
          role: msg.isUser ? "user" : "assistant",
          content: msg.content,
        })),
      };

      if (currentSessionId) {
        saveRequestBody.sessionId = currentSessionId;
      }
      if (currentUserId) {
        saveRequestBody.userId = currentUserId;
      }
      if (currentInviteCode) {
        saveRequestBody.inviteCode = currentInviteCode;
      }

      // 不使用 await，让它在后台执行
      fetch("/api/save-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(saveRequestBody),
      })
        .then((saveResponse) => {
          if (!saveResponse.ok) {
            return saveResponse.text().then((text) => {
              console.warn("保存会话失败:", text);
            });
          }
        })
        .catch((saveError) => {
          console.error("保存会话失败:", saveError);
        });
    } catch (error: any) {
      console.error("发送消息失败:", error);
      // 显示更详细的错误信息
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: error.message || "抱歉，发送消息时出现了错误。请稍后再试。",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      // 注意：isLoading 已经在 try 块中设置为 false
      // 这里只是作为保险，确保在错误情况下也能重置
      clearTimeout(timeoutId); // 清理超时定时器
      console.log("[DEBUG] Setting isLoading = false (finally block - safety net)");
      setIsLoading(false);
    }
  };

  // 如果正在加载会话，显示加载状态
  if (isLoadingSession) {
    return (
      <div className="min-h-screen w-full bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 mb-2">正在加载会话...</div>
          <div className="text-sm text-gray-400">恢复你的对话历史</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-gray-50">
      {/* 庆祝动画层 */}
      <Confetti isActive={showConfetti} />
      <CelebrationModal
        isOpen={showCelebration}
        onClose={() => setShowCelebration(false)}
        type={celebrationType}
        title={celebrationTitle}
      />

      {/* 旧面试按钮 UI 已移除 - 现在使用 /app/interview/start/page.tsx */}
      
      {/* 顶部阶段控制器 */}
      <StageController
        currentStage={fsm.getCurrentName()}
        onBack={handleBack}
        canGoBack={true} // 始终显示返回按钮
      />

      {/* 主内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧聊天流区域（70%） */}
        <div className="w-full md:w-[70%] flex-shrink-0 relative">
          <ChatFlow
            messages={messages}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={sendMessage}
            isLoading={isLoading}
            userStage={userStage}
            onNavigate={(path) => router.push(path)}
          />
          {/* 阶段选择器覆盖层（固定定位，覆盖整个视口） */}
          {showStageSelector && (
            <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-50 via-white to-purple-50 overflow-y-auto">
              <div className="min-h-screen w-full flex items-start justify-start py-8 pl-8 pr-4">
                <div className="w-full max-w-3xl">
                  <StageSelector
                    onSelectStage={handleSelectStage}
                    currentStage={userStage}
                    onClose={() => setShowStageSelector(false)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧智能白板区域（50%） */}
        <div 
          id="whiteboard-panel" 
          className={`whiteboard-panel hidden md:block ${isWhiteboardVisible ? '' : 'collapsed'} flex-shrink-0 relative`}
        >
          {/* 只使用画布视图 */}
          <WhiteboardCanvas
            data={whiteboardData}
            currentStage={userStage}
            onUpdate={setWhiteboardData}
            isVisible={isWhiteboardVisible}
            messages={messages}
            onMilestone={handleMilestone}
          />
        </div>
      </div>

      {/* 阶段切换确认模态 */}
      <StageTransitionModal
        isOpen={showTransitionModal}
        currentStage={StageNames[userStage]}
        nextStage={pendingNextStage ? (StageNames[pendingNextStage as UserStage] || pendingNextStage) : ""}
        onConfirm={handleConfirmTransition}
        onCancel={handleCancelTransition}
      />
    </div>
  );
}
