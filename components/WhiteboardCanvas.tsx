"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DraggableNote from "./DraggableNote";
import { UserStage, StageNames } from "@/lib/stage";
import { WhiteboardData } from "./Whiteboard";
import TaskCard from "./TaskCard";

interface NotePosition {
  id: string;
  x: number;
  y: number;
}

interface WhiteboardCanvasProps {
  data?: WhiteboardData;
  currentStage?: UserStage;
  onUpdate?: (data: WhiteboardData) => void;
  isVisible?: boolean;
  messages?: any[];
  onMilestone?: (completedCount: number, totalCount: number) => void;
}

export default function WhiteboardCanvas({
  data,
  currentStage = "career_planning",
  onUpdate,
  isVisible = true,
  messages = [],
  onMilestone,
}: WhiteboardCanvasProps) {
  const router = useRouter();
  const [notePositions, setNotePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [customNotes, setCustomNotes] = useState<Array<{ id: string; title: string; content: string; color: string }>>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // 添加自定义便利贴
  const handleAddCustomNote = () => {
    const newNote = {
      id: `custom_${Date.now()}`,
      title: "新便利贴",
      content: "点击编辑内容...",
      color: "yellow",
    };
    
    setCustomNotes((prev) => {
      const updatedNotes = [...prev, newNote];
      // 保存到 localStorage（全局共享）
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('whiteboard_custom_notes', JSON.stringify(updatedNotes));
          console.log("Saved custom notes:", updatedNotes.length);
        }
      } catch (e) {
        console.error("Failed to save custom notes:", e);
      }
      return updatedNotes;
    });
    
    // 为新便利贴生成位置
    const newPosition = { x: 20, y: 20 };
    setNotePositions((prev) => {
      const updatedPositions = { ...prev, [newNote.id]: newPosition };
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('whiteboard_positions', JSON.stringify(updatedPositions));
        }
      } catch (e) {
        console.error("Failed to save positions:", e);
      }
      return updatedPositions;
    });
  };

  // 处理便利贴内容更新
  const handleContentChange = (id: string, title: string, content: string) => {
    setCustomNotes((prev) => {
      const updatedNotes = prev.map((note) =>
        note.id === id ? { ...note, title, content } : note
      );
      // 保存到 localStorage（全局共享）
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('whiteboard_custom_notes', JSON.stringify(updatedNotes));
        }
      } catch (e) {
        console.error("Failed to save updated notes:", e);
      }
      return updatedNotes;
    });
  };

  // 自动布局算法 - 瀑布流式排列
  const generateAutoLayout = () => {
    const positions: Record<string, { x: number; y: number }> = {};
    let currentX = 20;
    let currentY = 20;
    const noteWidth = 280; // 包含 padding
    const noteHeight = 180;
    const gap = 20;
    const maxWidth = canvasRef.current?.clientWidth || 800;

    // 为每个数据项生成位置
    const addNote = (id: string) => {
      if (currentX + noteWidth > maxWidth) {
        currentX = 20;
        currentY += noteHeight + gap;
      }
      positions[id] = { x: currentX, y: currentY };
      currentX += noteWidth + gap;
    };

    // 按数据类型生成便利贴
    if (data?.intentRole) addNote("intentRole");
    if (data?.keySkills && data?.keySkills.length > 0) addNote("keySkills");
    
    data?.starProjects?.forEach((project) => addNote(`project_${project.id}`));
    data?.resumeInsights?.forEach((insight) => addNote(`insight_${insight.id}`));
    data?.interviewReports?.forEach((report) => addNote(`interview_${report.id}`));
    data?.targetCompanies?.forEach((company, idx) => addNote(`company_${idx}`));
    
    if (data?.salaryStrategy) addNote("salaryStrategy");
    data?.offers?.forEach((offer, idx) => addNote(`offer_${idx}`));
    
    // 添加自定义便利贴（从 localStorage 读取最新的）
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedCustomNotes = localStorage.getItem('whiteboard_custom_notes');
        if (savedCustomNotes) {
          try {
            const notes = JSON.parse(savedCustomNotes);
            notes.forEach((note: any) => addNote(note.id));
          } catch (e) {
            console.error("Failed to parse custom notes in layout:", e);
          }
        }
      }
    } catch (e) {
      console.error("Failed to access localStorage in layout:", e);
    }

    return positions;
  };

  // 先加载自定义便利贴（全局共享，不依赖 currentStage）
  useEffect(() => {
    try {
      // 检查 localStorage 是否可用
      if (typeof window === 'undefined' || !window.localStorage) {
        console.warn("localStorage is not available");
        setCustomNotes([]);
        return;
      }

      const savedCustomNotes = localStorage.getItem('whiteboard_custom_notes');
      if (savedCustomNotes) {
        try {
          const notes = JSON.parse(savedCustomNotes);
          setCustomNotes(notes);
          console.log("Loaded custom notes:", notes.length);
        } catch (e) {
          console.error("Failed to parse custom notes:", e);
          setCustomNotes([]);
        }
      } else {
        setCustomNotes([]);
      }
    } catch (e) {
      console.error("Failed to access localStorage:", e);
      setCustomNotes([]);
    }
  }, []); // 移除 currentStage 依赖

  // 初始化位置（在 customNotes 加载后，全局共享）
  useEffect(() => {
    try {
      // 检查 localStorage 是否可用
      if (typeof window === 'undefined' || !window.localStorage) {
        console.warn("localStorage is not available for positions");
        setNotePositions(generateAutoLayout());
        return;
      }

      // 尝试从 localStorage 加载保存的位置
      const savedPositions = localStorage.getItem('whiteboard_positions');
      if (savedPositions) {
        try {
          const positions = JSON.parse(savedPositions);
          setNotePositions(positions);
          console.log("Loaded positions:", Object.keys(positions).length);
        } catch (e) {
          console.error("Failed to parse positions:", e);
          // 如果加载失败，使用自动布局
          setNotePositions(generateAutoLayout());
        }
      } else {
        // 首次加载，使用自动布局
        const autoLayout = generateAutoLayout();
        setNotePositions(autoLayout);
        console.log("Generated auto layout:", Object.keys(autoLayout).length);
      }
    } catch (e) {
      console.error("Failed to access localStorage for positions:", e);
      setNotePositions(generateAutoLayout());
    }
  }, [data, customNotes]); // 移除 currentStage 依赖

  // 保存位置到 localStorage（全局共享）
  const handlePositionChange = (id: string, position: { x: number; y: number }) => {
    const newPositions = { ...notePositions, [id]: position };
    setNotePositions(newPositions);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('whiteboard_positions', JSON.stringify(newPositions));
      }
    } catch (e) {
      console.error("Failed to save position change:", e);
    }
  };

  // 重置布局（全局共享）
  const handleResetLayout = () => {
    const newPositions = generateAutoLayout();
    setNotePositions(newPositions);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('whiteboard_positions', JSON.stringify(newPositions));
        console.log("Reset layout:", Object.keys(newPositions).length);
      }
    } catch (e) {
      console.error("Failed to save reset layout:", e);
    }
  };

  // 检查是否有任何数据（包括自定义便利贴）
  const hasData = (data && Object.keys(data).length > 0) || customNotes.length > 0;

  return (
    <div className="h-full relative bg-transparent">
      {/* 工具栏 - 始终显示，固定在白板面板顶部 */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleAddCustomNote}
          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建便利贴
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleResetLayout}
          className="bg-white px-4 py-2.5 rounded-xl border-2 border-gray-300 shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm text-gray-700 font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重置布局
        </motion.button>
        
        <div className="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl border border-gray-300 shadow-sm text-xs text-gray-600 font-medium">
          {StageNames[currentStage]}
        </div>
      </div>

      {/* 线性任务卡 - 固定在画布上方 */}
      <div className="mx-6 mt-16 mb-2">
        <TaskCard
          stage={currentStage}
          messages={messages}
          onMilestone={onMilestone}
        />
      </div>

      {/* 画布区域 - 内部滚动 */}
      <div
        ref={canvasRef}
        className="h-full rounded-2xl shadow-sm relative overflow-auto mx-6 my-20 bg-gray-100 border border-gray-200"
        style={{ minHeight: "600px" }}
      >
        <div className="relative w-full" style={{ minHeight: "100%" }}>
          {/* 空状态提示 - 仅在没有数据时显示 */}
          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-4 animate-scale-in opacity-40">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <span className="text-3xl">📋</span>
                </div>
                <div className="text-gray-600 text-sm font-medium">智能白板画布</div>
                <div className="text-gray-400 text-xs">
                  对话中的关键信息将自动生成便利贴显示在这里
                </div>
                <div className="text-gray-400 text-xs">
                  或点击右上角"新建便利贴"手动添加笔记
                </div>
              </div>
            </div>
          )}
          {/* career_planning: 意向岗位 */}
          {data?.intentRole && notePositions["intentRole"] && (
            <DraggableNote
              id="intentRole"
              title="求职岗位"
              content={<div className="text-base font-semibold">{data?.intentRole}</div>}
              color="cyan"
              initialPosition={notePositions["intentRole"]}
              onPositionChange={handlePositionChange}
            />
          )}

          {/* career_planning: 核心技能 */}
          {data?.keySkills && data?.keySkills.length > 0 && notePositions["keySkills"] && (
            <DraggableNote
              id="keySkills"
              title="核心技能"
              content={
                <div className="flex flex-wrap gap-1.5">
                  {data?.keySkills?.slice(0, 6).map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-white/80 rounded-full text-xs text-gray-700 border border-blue-200"
                    >
                      {skill}
                    </span>
                  ))}
                  {data?.keySkills && data.keySkills.length > 6 && (
                    <span className="px-2 py-0.5 text-xs text-gray-500">
                      +{data?.keySkills.length - 6} 更多
                    </span>
                  )}
                </div>
              }
              color="blue"
              initialPosition={notePositions["keySkills"]}
              onPositionChange={handlePositionChange}
            />
          )}

          {/* project_review: STAR 项目卡片 */}
          {data?.starProjects?.map((project) => {
            const noteId = `project_${project.id}`;
            if (!notePositions[noteId]) return null;
            
            return (
              <DraggableNote
                key={noteId}
                id={noteId}
                title={project.title}
                content={
                  <div className="space-y-1">
                    {project.situation && (
                      <div className="text-xs">
                        <span className="font-medium text-purple-700">背景：</span>
                        <span className="line-clamp-2">{project.situation}</span>
                      </div>
                    )}
                    {project.result && (
                      <div className="text-xs">
                        <span className="font-medium text-purple-700">成果：</span>
                        <span className="line-clamp-2">{project.result}</span>
                      </div>
                    )}
                  </div>
                }
                color="purple"
                initialPosition={notePositions[noteId]}
                onPositionChange={handlePositionChange}
                onClick={() => router.push(`/details/project/${project.id}`)}
              />
            );
          })}

          {/* resume_optimization: 简历优化建议 */}
          {data?.resumeInsights?.slice(0, 5).map((insight) => {
            const noteId = `insight_${insight.id}`;
            if (!notePositions[noteId]) return null;
            
            return (
              <DraggableNote
                key={noteId}
                id={noteId}
                title={insight.section || "简历优化"}
                content={
                  <div className="space-y-1">
                    {insight.original && (
                      <div className="text-xs">
                        <span className="line-through text-gray-400">{insight.original.slice(0, 50)}...</span>
                      </div>
                    )}
                    {insight.optimized && (
                      <div className="text-xs text-green-700 font-medium">
                        {insight.optimized.slice(0, 50)}...
                      </div>
                    )}
                    {insight.suggestion && (
                      <div className="text-xs text-gray-600 line-clamp-2">
                        💡 {insight.suggestion}
                      </div>
                    )}
                  </div>
                }
                color="green"
                initialPosition={notePositions[noteId]}
                onPositionChange={handlePositionChange}
                onClick={() => router.push("/chat/resume-editor")}
              />
            );
          })}

          {/* interview: 面试报告 */}
          {data?.interviewReports?.map((report) => {
            const noteId = `interview_${report.id}`;
            if (!notePositions[noteId]) return null;
            
            return (
              <DraggableNote
                key={noteId}
                id={noteId}
                title={report.round}
                content={
                  <div className="space-y-1">
                    {report.overallScore !== undefined && (
                      <div className="text-sm font-bold text-orange-600">
                        总分：{report.overallScore}
                      </div>
                    )}
                    {report.strengths && report.strengths.length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-green-600">✓ </span>
                        {report.strengths[0]}
                      </div>
                    )}
                    {report.improvements && report.improvements.length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-orange-600">⚠ </span>
                        {report.improvements[0]}
                      </div>
                    )}
                  </div>
                }
                color="orange"
                initialPosition={notePositions[noteId]}
                onPositionChange={handlePositionChange}
                onClick={() => router.push(`/details/interview/${report.id}`)}
              />
            );
          })}

          {/* application_strategy: 目标公司 */}
          {data?.targetCompanies?.map((company, idx) => {
            const noteId = `company_${idx}`;
            if (!notePositions[noteId]) return null;
            
            return (
              <DraggableNote
                key={noteId}
                id={noteId}
                title={company.name}
                content={
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{company.position}</div>
                    {company.matchScore !== undefined && (
                      <div className="text-xs text-yellow-600">
                        匹配度：{company.matchScore}%
                      </div>
                    )}
                    {company.notes && (
                      <div className="text-xs text-gray-600 line-clamp-2">
                        {company.notes}
                      </div>
                    )}
                  </div>
                }
                color="yellow"
                initialPosition={notePositions[noteId]}
                onPositionChange={handlePositionChange}
              />
            );
          })}

          {/* salary_talk: 薪资策略 */}
          {data?.salaryStrategy && notePositions["salaryStrategy"] && (
            <DraggableNote
              id="salaryStrategy"
              title="薪资策略"
              content={
                <div className="space-y-1">
                  {data?.salaryStrategy?.targetRange && (
                    <div className="text-sm font-semibold text-indigo-700">
                      {data?.salaryStrategy?.targetRange}
                    </div>
                  )}
                  {data?.salaryStrategy?.negotiationPoints && data?.salaryStrategy?.negotiationPoints.length > 0 && (
                    <div className="text-xs space-y-0.5">
                      {data?.salaryStrategy?.negotiationPoints.slice(0, 3).map((point, idx) => (
                        <div key={idx} className="flex items-start gap-1">
                          <span>•</span>
                          <span className="line-clamp-1">{point}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              }
              color="indigo"
              initialPosition={notePositions["salaryStrategy"]}
              onPositionChange={handlePositionChange}
            />
          )}

          {/* offer: Offer 列表 */}
          {data?.offers?.map((offer, idx) => {
            const noteId = `offer_${idx}`;
            if (!notePositions[noteId]) return null;
            
            return (
              <DraggableNote
                key={noteId}
                id={noteId}
                title={offer.company}
                content={
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{offer.position}</div>
                    {offer.salary && (
                      <div className="text-sm font-semibold text-emerald-600">
                        {offer.salary}
                      </div>
                    )}
                    {offer.pros && offer.pros.length > 0 && (
                      <div className="text-xs text-gray-600">
                        ✓ {offer.pros[0]}
                      </div>
                    )}
                  </div>
                }
                color="emerald"
                initialPosition={notePositions[noteId]}
                onPositionChange={handlePositionChange}
              />
            );
          })}

          {/* 自定义便利贴 */}
          {customNotes.map((note) => {
            if (!notePositions[note.id]) return null;
            
            return (
              <DraggableNote
                key={note.id}
                id={note.id}
                title={note.title}
                content={note.content}
                color={note.color as any}
                initialPosition={notePositions[note.id]}
                onPositionChange={handlePositionChange}
                onContentChange={handleContentChange}
                editable={true}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
