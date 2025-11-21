"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../context/AppContext";
import { ClipboardList, Edit3, ExternalLink } from "./icons";

export default function WhiteboardPanel() {
  const { state, dispatch } = useApp();
  const { whiteboard } = state;

  // 自动保存组件
  const EditableBlock = ({
    title,
    content,
    section,
    field,
    placeholder,
  }: {
    title: string;
    content: string;
    section: string;
    field: string;
    placeholder?: string;
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(content || "");

    useEffect(() => {
      setValue(content);
    }, [content]);

    const handleBlur = () => {
      setIsEditing(false);
      dispatch({
        type: "UPDATE_WHITEBOARD",
        payload: { section, data: { [field]: value } },
      });
    };

    return (
      <div className="mb-6 group">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center">
          {title}
          <Edit3 size={10} className="ml-2 opacity-0 group-hover:opacity-100 text-slate-400" />
        </h4>
        {isEditing ? (
          <textarea
            autoFocus
            className="w-full p-2 bg-white border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-100 outline-none"
            rows={field === "notes" ? 6 : 2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                handleBlur();
              }
            }}
          />
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className={`p-2 -ml-2 rounded cursor-pointer hover:bg-slate-100 min-h-[30px] text-sm whitespace-pre-wrap ${
              !value ? "text-slate-300 italic" : "text-slate-700"
            }`}
          >
            {value || placeholder || "点击添加内容..."}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 shadow-[-4px_0_15px_rgba(0,0,0,0.02)] z-20">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-slate-700 flex items-center">
          <ClipboardList className="mr-2" size={18} /> 你的求职白板
        </h3>
        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></div> 自动保存
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {/* 职业画像 */}
        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-3 border-b pb-1">🎯 职业画像</h3>
          <EditableBlock
            title="意向岗位"
            section="planning"
            field="targetRole"
            content={whiteboard.planning.targetRole}
            placeholder="例如：产品经理"
          />
          <EditableBlock
            title="核心能力"
            section="planning"
            field="keySkills"
            content={whiteboard.planning.keySkills}
            placeholder="AI 自动提取的技能关键词..."
          />
        </section>

        {/* 项目经历 */}
        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-3 border-b pb-1 flex justify-between items-center">
            💼 核心经历
            <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 rounded">
              {whiteboard.projects.length} / 5
            </span>
          </h3>
          {whiteboard.projects.length === 0 && (
            <p className="text-sm text-slate-400 italic p-2">暂无项目，请在对话中梳理。</p>
          )}
          {whiteboard.projects.map((proj: any, idx: number) => (
            <div key={idx} className="bg-slate-50 rounded-lg p-3 mb-3 border border-slate-100">
              <div className="font-semibold text-sm text-slate-700">{proj.name || `项目 ${idx + 1}`}</div>
              <div className="text-xs text-slate-500 mt-1 line-clamp-3">{proj.star || proj.description || ""}</div>
            </div>
          ))}
        </section>

        {/* 投递策略 */}
        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-3 border-b pb-1">🚀 投递策略</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {whiteboard.strategy.platforms &&
              whiteboard.strategy.platforms.map((p: string) => (
                <span key={p} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">
                  {p}
                </span>
              ))}
          </div>
          <EditableBlock
            title="优先级偏好"
            section="strategy"
            field="priority"
            content={whiteboard.strategy.priority}
          />
        </section>

        {/* 简历解析结果 */}
        {whiteboard.resumeInsights && (
          <section>
            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b pb-1 flex items-center justify-between">
              📄 简历解析
              {whiteboard.resume.rawText && (
                <a
                  href={`/resume-preview?resumeId=${whiteboard.resume.resumeId}`}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={12} className="mr-1" /> 查看原文
                </a>
              )}
            </h3>

            {whiteboard.resumeInsights.personalInfo && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-600 mb-2">个人信息</h4>
                <div className="text-xs text-slate-500 space-y-1">
                  {whiteboard.resumeInsights.personalInfo.name && (
                    <div>姓名：{whiteboard.resumeInsights.personalInfo.name}</div>
                  )}
                  {whiteboard.resumeInsights.personalInfo.email && (
                    <div>邮箱：{whiteboard.resumeInsights.personalInfo.email}</div>
                  )}
                  {whiteboard.resumeInsights.personalInfo.phone && (
                    <div>电话：{whiteboard.resumeInsights.personalInfo.phone}</div>
                  )}
                </div>
              </div>
            )}

            {whiteboard.resumeInsights.education && whiteboard.resumeInsights.education.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-600 mb-2">教育经历</h4>
                {whiteboard.resumeInsights.education.map((edu: any, idx: number) => (
                  <div key={idx} className="text-xs text-slate-500 mb-2">
                    <div className="font-medium">{edu.school || ""} - {edu.major || ""}</div>
                    <div>{edu.degree || ""} | {edu.time || ""}</div>
                  </div>
                ))}
              </div>
            )}

            {whiteboard.resumeInsights.workExperience && whiteboard.resumeInsights.workExperience.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-600 mb-2">工作经历</h4>
                {whiteboard.resumeInsights.workExperience.map((work: any, idx: number) => (
                  <div key={idx} className="text-xs text-slate-500 mb-2">
                    <div className="font-medium">{work.company || ""} - {work.position || ""}</div>
                    <div>{work.time || ""}</div>
                    <div className="text-slate-400 mt-1">{work.description || ""}</div>
                  </div>
                ))}
              </div>
            )}

            {whiteboard.resumeInsights.projects && whiteboard.resumeInsights.projects.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-600 mb-2">项目经历</h4>
                {whiteboard.resumeInsights.projects.map((proj: any, idx: number) => (
                  <div key={idx} className="text-xs text-slate-500 mb-2">
                    <div className="font-medium">{proj.name || ""}</div>
                    <div className="text-slate-400 mt-1">{proj.description || ""}</div>
                  </div>
                ))}
              </div>
            )}

            {whiteboard.resumeInsights.skills && whiteboard.resumeInsights.skills.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-600 mb-2">技能</h4>
                <div className="flex flex-wrap gap-2">
                  {whiteboard.resumeInsights.skills.map((skill: string, idx: number) => (
                    <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 面试报告 */}
        {whiteboard.interviewReports && whiteboard.interviewReports.length > 0 && (
          <section>
            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b pb-1">📊 面试报告</h3>
            {whiteboard.interviewReports.map((report: any, idx: number) => (
              <div key={idx} className="mb-4 bg-slate-50 rounded-lg p-4 border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-700">{report.round}</div>
                    <div className="text-xs text-slate-500">{report.questionCount} 题</div>
                  </div>
                  {report.overallScore && (
                    <div className="text-right">
                      <div className="text-xs text-slate-500">综合评分</div>
                      <div className="text-sm font-bold text-blue-600">
                        {Math.round(
                          (report.overallScore.accuracy +
                            report.overallScore.grammar +
                            report.overallScore.confidence +
                            (report.overallScore.detail || 0)) /
                            (report.overallScore.detail !== undefined ? 4 : 3)
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {report.strengths && report.strengths.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-green-600 mb-1">亮点：</div>
                    <ul className="text-xs text-slate-600 list-disc list-inside">
                      {report.strengths.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.improvements && report.improvements.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-orange-600 mb-1">改进：</div>
                    <ul className="text-xs text-slate-600 list-disc list-inside">
                      {report.improvements.map((i: string, idx: number) => (
                        <li key={idx}>{i}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* 求职笔记 */}
        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-3 border-b pb-1">📝 随手记</h3>
          <EditableBlock
            title=""
            section="notes"
            field="content"
            content={typeof whiteboard.notes === "string" ? whiteboard.notes : whiteboard.notes || ""}
            placeholder="记录面试复盘、HR联系方式等..."
          />
        </section>
      </div>
    </div>
  );
}

