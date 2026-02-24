"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UserStage, StageNames } from "@/lib/stage";
import ProgressBar from "./ProgressBar";
import InterviewCalendar from "./InterviewCalendar";
import TaskCard from "./TaskCard";

// 白板数据结构（与 API 返回格式一致）
export interface WhiteboardData {
  // career_planning 阶段
  intentRole?: string;
  keySkills?: string[];

  // project_review 阶段
  starProjects?: Array<{
    id: string;
    title: string;
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
    createdAt?: string;
  }>;

  // resume_optimization 阶段
  resumeInsights?: Array<{
    id: string;
    original?: string;
    optimized?: string;
    suggestion?: string;
    section?: string;
  }>;

  // interview 阶段
  interviewReports?: Array<{
    id: string;
    round: string;
    questions?: Array<{
      question: string;
      userAnswer?: string;
      aiFeedback?: string;
      score?: number;
    }>;
    overallScore?: number;
    strengths?: string[];
    improvements?: string[];
    createdAt?: string;
  }>;

  // application_strategy 阶段
  targetCompanies?: Array<{
    name: string;
    position: string;
    matchScore?: number;
    notes?: string;
  }>;

  // salary_talk 阶段
  salaryStrategy?: {
    targetRange?: string;
    negotiationPoints?: string[];
    marketData?: string;
  };

  // offer 阶段
  offers?: Array<{
    company: string;
    position: string;
    salary?: string;
    benefits?: string[];
    pros?: string[];
    cons?: string[];
  }>;
}

interface WhiteboardProps {
  data?: WhiteboardData;
  currentStage?: UserStage;
  onUpdate?: (data: WhiteboardData) => void;
  resumeData?: any;
  isResumeProcessing?: boolean;
  isPreviewCollapsed?: boolean;
  onFileUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteResume?: () => void;
  onDownloadResume?: () => void;
  onTogglePreview?: () => void;
  onToggle?: () => void;
  isVisible?: boolean;
  messages?: any[];
  onMilestone?: (completedCount: number, totalCount: number) => void;
}

export default function Whiteboard({ 
  data, 
  currentStage = "career_planning", 
  onUpdate,
  resumeData = null,
  isResumeProcessing = false,
  isPreviewCollapsed = false,
  onFileUpload,
  onDeleteResume,
  onDownloadResume,
  onTogglePreview,
  onToggle,
  isVisible = true,
  messages = [],
  onMilestone,
}: WhiteboardProps) {
  const router = useRouter();

  // 动画配置
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20, y: 10 },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
  };

  // 如果没有数据，显示空状态
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="h-full bg-gray-50 p-6">
        <div className="h-full bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="text-4xl mb-4">📓</div>
              <div className="text-gray-600 text-sm font-semibold">你的求职笔记本</div>
              <div className="text-gray-400 text-xs">
                当前阶段：{StageNames[currentStage]}
              </div>
              <div className="text-gray-400 text-xs mt-2 leading-relaxed">
                这里会自动记录你和益老师聊天中的关键信息<br />
                就像一本智能求职笔记 ✨
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleProjectClick = (projectId: string) => {
    router.push(`/details/project/${projectId}`);
  };

  const handleResumeClick = (insightId: string) => {
    router.push(`/details/resume/${insightId}`);
  };

  const handleInterviewClick = (reportId: string) => {
    router.push(`/details/interview/${reportId}`);
  };

  return (
    <div className="h-full bg-gray-50 relative flex flex-col">
      {/* 切换按钮 */}
      {onToggle && (
        <button
          onClick={onToggle}
          className="absolute top-4 left-4 z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-md hover:shadow-lg transition-all border border-gray-200"
          title={isVisible ? "收起白板" : "展开白板"}
        >
          <i className={`fas ${isVisible ? 'fa-chevron-right' : 'fa-chevron-left'} text-gray-600 text-sm`}></i>
        </button>
      )}
      {/* 进度仪表盘 */}
      <div className="shrink-0">
        <ProgressBar data={data} currentStage={currentStage} />
      </div>
      <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm mx-6 mb-6 mt-2 min-h-0">
        <motion.div
          className="h-full p-4 overflow-y-auto space-y-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* 标题 */}
          <div className="border-b border-gray-200 pb-3">
            <h2 className="text-lg font-semibold text-gray-900">智能白板</h2>
            <p className="text-xs text-gray-500 mt-1">
              当前阶段：{StageNames[currentStage]}
            </p>
          </div>

          {/* 线性任务卡 */}
          <TaskCard
            stage={currentStage}
            messages={messages}
            onMilestone={onMilestone}
          />

          {/* career_planning: 意向岗位 */}
          {data.intentRole && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-cyan-50 rounded-lg border border-cyan-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-2">求职岗位</div>
              <div className="text-base font-semibold text-gray-900">{data.intentRole}</div>
            </motion.div>
          )}

          {/* career_planning: 核心技能 */}
          {data.keySkills && data.keySkills.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-blue-50 rounded-lg border border-blue-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-2">核心技能</div>
              <div className="flex flex-wrap gap-2">
                {data.keySkills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-white rounded-full text-sm text-gray-700 border border-blue-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {/* project_review: STAR 项目卡片 */}
          {data.starProjects && data.starProjects.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-purple-50 rounded-lg border border-purple-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">项目经历</div>
              <div className="space-y-3">
                {data.starProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="p-3 bg-white rounded-lg border border-purple-200 cursor-pointer hover:border-purple-300 transition-colors"
                    onClick={() => handleProjectClick(project.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-semibold text-gray-900">{project.title}</div>
                      <span className="text-xs text-purple-600">→</span>
                    </div>
                    {project.situation && (
                      <div className="text-xs text-gray-600 mb-1">
                        <span className="font-medium">背景：</span>
                        {project.situation}
                      </div>
                    )}
                    {project.result && (
                      <div className="text-xs text-gray-600 line-clamp-2">
                        <span className="font-medium">成果：</span>
                        {project.result}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* resume_optimization: 简历上传和预览功能 */}
          {currentStage === "resume_optimization" && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-orange-50 rounded-lg border border-orange-200 h-full flex flex-col"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">简历解析</div>
              
              {/* 互斥状态渲染：加载中 */}
              {isResumeProcessing ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <div className="text-sm text-orange-600 font-medium">正在解析简历，请稍候...</div>
                </div>
              ) : !resumeData ? (
                /* 互斥状态渲染：初始上传状态 */
                <label
                  htmlFor="resume-upload"
                  className="flex-1 border-2 border-dashed border-orange-400 p-10 h-full flex flex-col items-center justify-center rounded-xl cursor-pointer hover:bg-orange-50/50 transition"
                >
                  <input
                    type="file"
                    id="resume-upload"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={onFileUpload}
                  />
                  <div className="text-4xl mb-2">📄</div>
                  <div className="text-sm font-medium text-gray-700 mb-1">点击上传简历</div>
                  <div className="text-xs text-gray-500">支持 PDF、DOCX、TXT 格式</div>
                </label>
              ) : (
                /* 互斥状态渲染：预览和操作状态 */
                <div className="flex-1 flex flex-col min-h-0">
                  {/* 操作栏 */}
                  <div className="flex justify-between items-center p-3 border-b border-orange-200 shrink-0">
                    <button
                      onClick={onTogglePreview}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-100 rounded-lg transition-colors"
                    >
                      <i className={`fas ${isPreviewCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
                      <span>{isPreviewCollapsed ? '展开预览' : '收起预览'}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onDownloadResume}
                        className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors"
                      >
                        下载
                      </button>
                      <button
                        onClick={onDeleteResume}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {/* 预览主体 */}
                  {!isPreviewCollapsed ? (
                    <div className="flex-1 overflow-y-auto space-y-4 p-3 min-h-0">
                      {resumeData.summary && (
                        <div>
                          <h2 className="text-base font-semibold text-gray-900 mb-2">简历摘要</h2>
                          <p className="text-sm text-gray-700 leading-relaxed">{resumeData.summary}</p>
                        </div>
                      )}
                      {resumeData.sections && resumeData.sections.length > 0 && (
                        <div>
                          <h2 className="text-base font-semibold text-gray-900 mb-2">详细内容</h2>
                          <ul className="space-y-3">
                            {resumeData.sections.map((section: any, index: number) => (
                              <li key={index} className="border-l-2 border-orange-300 pl-3">
                                <h3 className="text-sm font-medium text-gray-800 mb-1">{section.title || `章节 ${index + 1}`}</h3>
                                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{section.content}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 收起提示 */
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center text-sm text-gray-500">
                        简历预览已收起。点击操作栏的按钮展开。
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* resume_optimization: 简历优化建议 */}
          {data.resumeInsights && data.resumeInsights.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-green-50 rounded-lg border border-green-200"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-gray-500">简历优化建议</div>
                <button
                  onClick={() => router.push("/chat/resume-editor")}
                  className="px-2 py-1 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600 transition-colors"
                >
                  进入编辑器
                </button>
              </div>
              <div className="space-y-3">
                {data.resumeInsights.slice(0, 3).map((insight) => (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="p-3 bg-white rounded-lg border border-green-200 cursor-pointer hover:border-green-300 transition-colors"
                    onClick={() => router.push("/chat/resume-editor")}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        {insight.section && (
                          <div className="text-xs font-medium text-gray-500 mb-1">
                            {insight.section}
                          </div>
                        )}
                        {insight.original && (
                          <div className="text-xs text-gray-600 mb-1">
                            <span className="font-medium">原句：</span>
                            <span className="line-through text-gray-400">{insight.original}</span>
                          </div>
                        )}
                        {insight.optimized && (
                          <div className="text-xs text-gray-800 mb-1">
                            <span className="font-medium">优化：</span>
                            <span className="text-green-700">{insight.optimized}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-green-600 ml-2">→</span>
                    </div>
                    {insight.suggestion && (
                      <div className="text-xs text-gray-600 line-clamp-2">
                        <span className="font-medium">建议：</span>
                        {insight.suggestion}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* interview: 面试报告 */}
          {data.interviewReports && data.interviewReports.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-orange-50 rounded-lg border border-orange-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">面试报告</div>
              <div className="space-y-3">
                {data.interviewReports.map((report) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="p-3 bg-white rounded-lg border border-orange-200 cursor-pointer hover:border-orange-300 transition-colors"
                    onClick={() => handleInterviewClick(report.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-semibold text-gray-900">{report.round}</div>
                      <span className="text-xs text-orange-600">→</span>
                    </div>
                    {report.overallScore !== undefined && (
                      <div className="text-xs text-gray-600 mb-2">
                        总分：<span className="font-semibold text-orange-600">{report.overallScore}</span>
                      </div>
                    )}
                    {report.questions && report.questions.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {report.questions.length} 个问题
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* application_strategy: 目标公司 */}
          {data.targetCompanies && data.targetCompanies.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-yellow-50 rounded-lg border border-yellow-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">目标公司</div>
              <div className="space-y-2">
                {data.targetCompanies.map((company, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="p-3 bg-white rounded-lg border border-yellow-200"
                  >
                    <div className="text-sm font-semibold text-gray-900">{company.name}</div>
                    <div className="text-xs text-gray-600">{company.position}</div>
                    {company.matchScore !== undefined && (
                      <div className="text-xs text-gray-500 mt-1">
                        匹配度：{company.matchScore}%
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* salary_talk: 薪资策略 */}
          {data.salaryStrategy && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-indigo-50 rounded-lg border border-indigo-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">薪资策略</div>
              {data.salaryStrategy.targetRange && (
                <div className="text-sm font-semibold text-gray-900 mb-2">
                  目标范围：{data.salaryStrategy.targetRange}
                </div>
              )}
              {data.salaryStrategy.negotiationPoints && data.salaryStrategy.negotiationPoints.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-gray-600 mb-1">谈判要点：</div>
                  {data.salaryStrategy.negotiationPoints.map((point, idx) => (
                    <div key={idx} className="text-xs text-gray-700 flex items-start gap-1">
                      <span>•</span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* offer: Offer 列表 */}
          {data.offers && data.offers.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-emerald-50 rounded-lg border border-emerald-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">Offer 列表</div>
              <div className="space-y-3">
                {data.offers.map((offer, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="p-3 bg-white rounded-lg border border-emerald-200"
                  >
                    <div className="text-sm font-semibold text-gray-900">{offer.company}</div>
                    <div className="text-xs text-gray-600">{offer.position}</div>
                    {offer.salary && (
                      <div className="text-xs text-emerald-600 font-medium mt-1">
                        {offer.salary}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* 面试日历 */}
          <motion.div
            variants={itemVariants}
            className="rounded-lg border border-blue-200 bg-blue-50/30 overflow-hidden"
          >
            <InterviewCalendar
              onNavigateToInterview={() => router.push("/interview/start")}
            />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

