"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { WhiteboardData } from "@/components/Whiteboard";

type InterviewReport = NonNullable<WhiteboardData["interviewReports"]>[number];

export default function InterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());

  useEffect(() => {
    // 从 localStorage 获取白板数据
    try {
      const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
      if (whiteboardDataStr) {
        const whiteboardData: WhiteboardData = JSON.parse(whiteboardDataStr);
        const foundReport = whiteboardData.interviewReports?.find((r) => r.id === id);
        if (foundReport) {
          setReport(foundReport);
          // 默认展开所有问题
          if (foundReport.questions) {
            setExpandedQuestions(new Set(foundReport.questions.map((_, idx) => idx)));
          }
          return;
        }
      }
    } catch (error) {
      console.error("读取面试数据失败:", error);
    }

    // 如果没有找到，使用模拟数据
    const mockReport: InterviewReport = {
      id,
      round: "第一轮：技术面试",
      overallScore: 85,
      questions: [
        {
          question: "请介绍一下你自己",
          userAnswer: "我是...",
          aiFeedback: "回答清晰，但可以更突出核心技能",
          score: 80,
        },
      ],
      strengths: ["表达清晰", "逻辑完整"],
      improvements: ["可以增加更多具体案例"],
      createdAt: new Date().toISOString(),
    };

    setReport(mockReport);
  }, [id]);

  const toggleQuestion = (index: number) => {
    setExpandedQuestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mt-6">
        {/* 头部信息 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{report.round}</h1>
            <div className="text-sm text-gray-500 mt-1">
              面试类型：{report.round.includes("技术") ? "技术面" : report.round.includes("业务") ? "业务面" : "HR面"}
            </div>
          </div>
          {report.overallScore !== undefined && (
            <div className="text-right">
              <div className="text-sm text-gray-500">总分</div>
              <div className="text-3xl font-bold text-orange-600">{report.overallScore}</div>
            </div>
          )}
        </div>

        {/* 问题列表 */}
        {report.questions && report.questions.length > 0 && (
          <div className="space-y-4 mb-6">
            {report.questions.map((q, idx) => {
              const isExpanded = expandedQuestions.has(idx);
              return (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900 mb-2">
                        Q{idx + 1}: {q.question}
                      </div>
                      {q.score !== undefined && (
                        <div className="text-xs text-gray-500 mb-2">
                          评分：<span className="font-semibold text-orange-600">{q.score}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleQuestion(idx)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {isExpanded ? "收起" : "展开"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-gray-100">
                      {q.userAnswer && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">用户回答</div>
                          <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                            {q.userAnswer}
                          </div>
                        </div>
                      )}

                      {q.aiFeedback && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">AI 反馈</div>
                          <div className="text-sm text-gray-700 bg-blue-50 p-3 rounded border border-blue-200">
                            {q.aiFeedback}
                          </div>
                        </div>
                      )}

                      {/* AI Tips 框 */}
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="text-xs font-semibold text-yellow-900 mb-2">💡 AI Tips</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium text-yellow-800">考察点：</span>
                            <span className="text-yellow-700">技术能力、项目经验</span>
                          </div>
                          <div>
                            <span className="font-medium text-yellow-800">回答结构：</span>
                            <span className="text-yellow-700">STAR 法则</span>
                          </div>
                          <div>
                            <span className="font-medium text-yellow-800">行业知识：</span>
                            <span className="text-yellow-700">相关技术栈</span>
                          </div>
                          <div>
                            <span className="font-medium text-yellow-800">避坑：</span>
                            <span className="text-yellow-700">避免空泛描述</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 总结部分 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {report.strengths && report.strengths.length > 0 && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-sm font-semibold text-green-900 mb-2">优点</div>
              <ul className="space-y-1">
                {report.strengths.map((s, idx) => (
                  <li key={idx} className="text-sm text-green-800 flex items-start gap-1">
                    <span>✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.improvements && report.improvements.length > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm font-semibold text-blue-900 mb-2">改进建议</div>
              <ul className="space-y-1">
                {report.improvements.map((i, idx) => (
                  <li key={idx} className="text-sm text-blue-800 flex items-start gap-1">
                    <span>→</span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="pt-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => router.push("/cockpit?tab=interview")}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
}
