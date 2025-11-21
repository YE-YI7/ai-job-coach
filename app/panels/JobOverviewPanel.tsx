"use client";

import { useState } from "react";

export interface JobOverviewData {
  targetJob?: string;
  keyCapabilities?: string[];
  projects?: Array<{ name: string; description: string }>;
  resumeSuggestions?: string;
  interviewSuggestions?: string;
}

interface JobOverviewPanelProps {
  data: JobOverviewData;
}

export default function JobOverviewPanel({ data }: JobOverviewPanelProps) {
  const [expanded, setExpanded] = useState<{
    resume?: boolean;
    interview?: boolean;
  }>({});

  const toggleExpand = (key: 'resume' | 'interview') => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-[15.33px]">
      {/* 意向岗位 */}
      {data.targetJob && (
        <div className="w-64 h-20 px-4 pt-4 pb-[0.67px] bg-neutral-50 rounded-2xl outline outline-[0.67px] outline-black/0 outline-offset-[-0.67px]">
          <div className="inline-flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center">
              <div className="w-4 h-4 relative">
                <div className="w-1.5 h-3 left-[5.33px] top-[1.33px] absolute outline outline-[1.33px] outline-cyan-400 outline-offset-[-0.67px]" />
                <div className="w-3.5 h-2.5 left-[1.33px] top-[4px] absolute outline outline-[1.33px] outline-cyan-400 outline-offset-[-0.67px]" />
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <div className="h-6 text-gray-900 text-base font-normal leading-6">意向岗位</div>
              <div className="h-6 text-gray-600 text-base font-normal leading-6">{data.targetJob}</div>
            </div>
          </div>
        </div>
      )}

      {/* 关键能力 */}
      {data.keyCapabilities && data.keyCapabilities.length > 0 && (
        <div className="w-64 h-20 px-4 pt-4 pb-[0.67px] bg-neutral-50 rounded-2xl outline outline-[0.67px] outline-black/0 outline-offset-[-0.67px]">
          <div className="inline-flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center">
              <div className="w-4 h-4 relative">
                <div className="w-2 h-2 left-[4px] top-[1.33px] absolute outline outline-[1.33px] outline-cyan-400 outline-offset-[-0.67px]" />
                <div className="w-1 h-0 left-[6px] top-[12px] absolute outline outline-[1.33px] outline-cyan-400 outline-offset-[-0.67px]" />
                <div className="w-[2.67px] h-0 left-[6.67px] top-[14.67px] absolute outline outline-[1.33px] outline-cyan-400 outline-offset-[-0.67px]" />
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <div className="h-6 text-gray-900 text-base font-normal leading-6">关键能力</div>
              <div className="h-6 text-gray-600 text-base font-normal leading-6">
                {data.keyCapabilities.join("、")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 项目列表 */}
      {data.projects && data.projects.length > 0 && (
        <>
          {data.projects.slice(0, 5).map((project, idx) => (
            <div key={idx} className="w-64 h-20 px-4 pt-4 pb-[0.67px] bg-neutral-50 rounded-2xl outline outline-[0.67px] outline-black/0 outline-offset-[-0.67px]">
              <div className="inline-flex items-start gap-3">
                <div className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center">
                  <div className="w-4 h-4 relative">
                    <div className="w-3.5 h-3 left-[1.33px] top-[2px] absolute outline outline-[1.33px] outline-cyan-400 outline-offset-[-0.67px]" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <div className="h-6 text-gray-900 text-base font-normal leading-6">项目{String.fromCharCode(65 + idx)}</div>
                  <div className="h-6 text-gray-600 text-base font-normal leading-6">{project.name}</div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* 简历优化建议 */}
      {data.resumeSuggestions && (
        <div className={`w-64 px-4 pt-4 pb-[0.67px] bg-neutral-50 rounded-2xl outline outline-[0.67px] outline-black/0 outline-offset-[-0.67px] ${expanded.resume ? 'h-auto' : 'h-36'}`}>
          <div className="inline-flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center">
              <div className="w-4 h-4 relative">
                <div className="w-2.5 h-3.5 left-[2.67px] top-[1.33px] absolute outline outline-[1.33px] outline-teal-300 outline-offset-[-0.67px]" />
                <div className="w-1 h-1 left-[9.33px] top-[1.33px] absolute outline outline-[1.33px] outline-teal-300 outline-offset-[-0.67px]" />
              </div>
            </div>
            <div className="flex-1 relative">
              <div className="h-6 text-gray-900 text-base font-normal leading-6">简历优化建议</div>
              {expanded.resume ? (
                <>
                  <div className="text-gray-600 text-base font-normal leading-6 mt-2 whitespace-pre-wrap">{data.resumeSuggestions}</div>
                  <button
                    onClick={() => toggleExpand('resume')}
                    className="text-cyan-400 text-base font-normal leading-6 mt-2"
                  >
                    收起详情
                  </button>
                </>
              ) : (
                <>
                  <div className="h-12 text-gray-600 text-base font-normal leading-6 mt-2 line-clamp-2">{data.resumeSuggestions}</div>
                  <button
                    onClick={() => toggleExpand('resume')}
                    className="text-cyan-400 text-base font-normal leading-6 mt-2"
                  >
                    查看详情
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 模拟面试建议 */}
      {data.interviewSuggestions && (
        <div className={`w-64 px-4 pt-4 pb-[0.67px] bg-neutral-50 rounded-2xl outline outline-[0.67px] outline-black/0 outline-offset-[-0.67px] ${expanded.interview ? 'h-auto' : 'h-28'}`}>
          <div className="inline-flex items-start gap-3">
            <div className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center">
              <div className="w-4 h-4 relative">
                <div className="w-3.5 h-3 left-[1.33px] top-[2px] absolute outline outline-[1.33px] outline-cyan-400 outline-offset-[-0.67px]" />
              </div>
            </div>
            <div className="flex-1 relative">
              <div className="h-6 text-gray-900 text-base font-normal leading-6">模拟面试建议</div>
              {expanded.interview ? (
                <>
                  <div className="text-gray-600 text-base font-normal leading-6 mt-2 whitespace-pre-wrap">{data.interviewSuggestions}</div>
                  <button
                    onClick={() => toggleExpand('interview')}
                    className="text-cyan-400 text-base font-normal leading-6 mt-2"
                  >
                    收起详情
                  </button>
                </>
              ) : (
                <>
                  <div className="h-6 text-gray-600 text-base font-normal leading-6 mt-2">{data.interviewSuggestions}</div>
                  <button
                    onClick={() => toggleExpand('interview')}
                    className="text-cyan-400 text-base font-normal leading-6 mt-2"
                  >
                    查看详情
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

