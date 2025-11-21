"use client";

import { Suspense } from "react";
import { useApp } from "../context/AppContext";
import { ArrowLeft } from "../components/icons";

function ResumePreviewContent() {
  const { state } = useApp();
  const { whiteboard } = state;

  const resumeInsights = whiteboard.resumeInsights;
  const rawText = whiteboard.resume.rawText || resumeInsights?.rawText || "";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* 头部 */}
        <div className="mb-6 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center text-slate-600 hover:text-slate-800 transition"
          >
            <ArrowLeft size={20} className="mr-2" />
            返回主页面
          </a>
          <h1 className="text-2xl font-bold text-slate-800">简历原文预览</h1>
          <div className="w-24"></div> {/* 占位，保持居中 */}
        </div>

        {/* 简历内容 */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          {rawText ? (
            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">
                {rawText}
              </pre>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400">
              <p>暂无简历内容</p>
              <p className="text-sm mt-2">请先上传简历文件</p>
            </div>
          )}
        </div>

        {/* 结构化信息（可选显示） */}
        {resumeInsights && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">解析结果</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {resumeInsights.personalInfo && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-600 mb-2">个人信息</h3>
                  <div className="text-xs text-slate-500 space-y-1">
                    {resumeInsights.personalInfo.name && <div>姓名：{resumeInsights.personalInfo.name}</div>}
                    {resumeInsights.personalInfo.email && <div>邮箱：{resumeInsights.personalInfo.email}</div>}
                    {resumeInsights.personalInfo.phone && <div>电话：{resumeInsights.personalInfo.phone}</div>}
                  </div>
                </div>
              )}

              {resumeInsights.skills && resumeInsights.skills.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-600 mb-2">技能</h3>
                  <div className="flex flex-wrap gap-2">
                    {resumeInsights.skills.map((skill: string, idx: number) => (
                      <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResumePreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center">加载中...</div>}>
      <ResumePreviewContent />
    </Suspense>
  );
}

