/**
 * 进度计算 - 根据 WhiteboardData 计算各阶段完成度
 */

import type { WhiteboardData } from '@/components/Whiteboard';
import type { UserStage } from './stage';

export interface StageProgress {
  stage: UserStage;
  percentage: number;
  label: string;
}

/**
 * 计算所有阶段的完成度
 */
export function calculateProgress(data: WhiteboardData | undefined): StageProgress[] {
  if (!data) {
    return getDefaultProgress();
  }

  return [
    {
      stage: 'career_planning',
      label: '职业规划',
      percentage: calcCareerPlanning(data),
    },
    {
      stage: 'project_review',
      label: '项目梳理',
      percentage: calcProjectReview(data),
    },
    {
      stage: 'resume_optimization',
      label: '简历优化',
      percentage: calcResumeOptimization(data),
    },
    {
      stage: 'application_strategy',
      label: '投递策略',
      percentage: calcApplicationStrategy(data),
    },
    {
      stage: 'interview',
      label: '模拟面试',
      percentage: calcInterview(data),
    },
    {
      stage: 'salary_talk',
      label: '薪资沟通',
      percentage: calcSalaryTalk(data),
    },
    {
      stage: 'offer',
      label: 'Offer',
      percentage: calcOffer(data),
    },
  ];
}

function getDefaultProgress(): StageProgress[] {
  const stages: Array<{ stage: UserStage; label: string }> = [
    { stage: 'career_planning', label: '职业规划' },
    { stage: 'project_review', label: '项目梳理' },
    { stage: 'resume_optimization', label: '简历优化' },
    { stage: 'application_strategy', label: '投递策略' },
    { stage: 'interview', label: '模拟面试' },
    { stage: 'salary_talk', label: '薪资沟通' },
    { stage: 'offer', label: 'Offer' },
  ];
  return stages.map(s => ({ ...s, percentage: 0 }));
}

function calcCareerPlanning(data: WhiteboardData): number {
  let score = 0;
  if (data.intentRole) score += 50;
  if (data.keySkills && data.keySkills.length > 0) score += 50;
  return score;
}

function calcProjectReview(data: WhiteboardData): number {
  if (!data.starProjects || data.starProjects.length === 0) return 0;
  // 每个完整项目贡献 33%，最多100%
  const completeProjects = data.starProjects.filter(
    p => p.title && p.situation && p.action && p.result
  ).length;
  return Math.min(100, Math.round((completeProjects / 3) * 100));
}

function calcResumeOptimization(data: WhiteboardData): number {
  if (!data.resumeInsights || data.resumeInsights.length === 0) return 0;
  return Math.min(100, data.resumeInsights.length * 20);
}

function calcApplicationStrategy(data: WhiteboardData): number {
  if (!data.targetCompanies || data.targetCompanies.length === 0) return 0;
  return Math.min(100, data.targetCompanies.length * 20);
}

function calcInterview(data: WhiteboardData): number {
  if (!data.interviewReports || data.interviewReports.length === 0) return 0;
  const avgScore = data.interviewReports.reduce((sum, r) => sum + (r.overallScore || 0), 0) / data.interviewReports.length;
  return Math.min(100, Math.round(avgScore));
}

function calcSalaryTalk(data: WhiteboardData): number {
  if (!data.salaryStrategy) return 0;
  let score = 0;
  if (data.salaryStrategy.targetRange) score += 40;
  if (data.salaryStrategy.negotiationPoints?.length) score += 40;
  if (data.salaryStrategy.marketData) score += 20;
  return score;
}

function calcOffer(data: WhiteboardData): number {
  if (!data.offers || data.offers.length === 0) return 0;
  return Math.min(100, data.offers.length * 50);
}
