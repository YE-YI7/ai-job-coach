/**
 * 数据分析工具库
 * 
 * 提供数据飞轮相关功能：
 * - 数据写入（埋点）
 * - 百分位排名计算
 * - 聚合统计
 */

import { getDbClient } from './db';

// 指标类型
export type MetricType = 'interview_score' | 'resume_score' | 'chat_count' | 'stage_progress';

// 阶段类型
export type AnalyticsStage = 
  | 'career_planning'
  | 'project_review'
  | 'resume_optimization'
  | 'application_strategy'
  | 'interview'
  | 'salary_talk'
  | 'offer';

interface AnalyticsRecord {
  user_id: string;
  stage: AnalyticsStage;
  metric_type: MetricType;
  metric_value: number;
  metadata?: Record<string, any>;
}

/**
 * 写入一条分析数据
 */
export async function recordMetric(record: AnalyticsRecord): Promise<boolean> {
  try {
    const client = await getDbClient();
    if (!client) return false;

    const { error } = await client
      .from('user_analytics')
      .insert({
        user_id: record.user_id,
        stage: record.stage,
        metric_type: record.metric_type,
        metric_value: record.metric_value,
        metadata: record.metadata || {},
      });

    if (error) {
      console.error('Analytics record error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Analytics record exception:', err);
    return false;
  }
}

/**
 * 计算百分位排名
 * 返回用户在某个指标上超过了多少比例的其他用户 (0-100)
 */
export async function getPercentileRank(
  userId: string,
  stage: AnalyticsStage,
  metricType: MetricType
): Promise<{ percentile: number; total: number; isEstimated: boolean }> {
  try {
    const client = await getDbClient();
    if (!client) {
      return { percentile: 75, total: 0, isEstimated: true };
    }

    // 获取用户最新的该指标值
    const { data: userMetric } = await client
      .from('user_analytics')
      .select('metric_value')
      .eq('user_id', userId)
      .eq('stage', stage)
      .eq('metric_type', metricType)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!userMetric) {
      return { percentile: 0, total: 0, isEstimated: true };
    }

    // 获取所有用户在该指标上的最新值（去重取每个用户最高值）
    const { data: allMetrics } = await client
      .from('user_analytics')
      .select('user_id, metric_value')
      .eq('stage', stage)
      .eq('metric_type', metricType)
      .order('metric_value', { ascending: true });

    if (!allMetrics || allMetrics.length === 0) {
      return { percentile: 75, total: 0, isEstimated: true };
    }

    // 去重：每个用户取最高值
    const userBestMap = new Map<string, number>();
    for (const m of allMetrics) {
      const current = userBestMap.get(m.user_id);
      if (current === undefined || m.metric_value > current) {
        userBestMap.set(m.user_id, m.metric_value);
      }
    }

    const values = Array.from(userBestMap.values()).sort((a, b) => a - b);
    const total = values.length;

    // 数据量不足时使用估算值
    if (total < 10) {
      // 基于分数给出合理估算
      const score = userMetric.metric_value;
      let estimatedPercentile: number;
      if (score >= 90) estimatedPercentile = 95;
      else if (score >= 80) estimatedPercentile = 85;
      else if (score >= 70) estimatedPercentile = 70;
      else if (score >= 60) estimatedPercentile = 50;
      else estimatedPercentile = 30;

      return { percentile: estimatedPercentile, total, isEstimated: true };
    }

    // 计算真实百分位
    const belowCount = values.filter(v => v < userMetric.metric_value).length;
    const percentile = Math.round((belowCount / total) * 100);

    return { percentile, total, isEstimated: false };
  } catch (err) {
    console.error('Percentile calculation error:', err);
    return { percentile: 75, total: 0, isEstimated: true };
  }
}

/**
 * 获取用户某阶段的历史数据摘要
 */
export async function getUserStageSummary(
  userId: string,
  stage: AnalyticsStage
): Promise<{
  totalRecords: number;
  avgScore: number;
  maxScore: number;
  recentTrend: 'improving' | 'stable' | 'declining';
}> {
  try {
    const client = await getDbClient();
    if (!client) {
      return { totalRecords: 0, avgScore: 0, maxScore: 0, recentTrend: 'stable' };
    }

    const { data } = await client
      .from('user_analytics')
      .select('metric_value, created_at')
      .eq('user_id', userId)
      .eq('stage', stage)
      .order('created_at', { ascending: true });

    if (!data || data.length === 0) {
      return { totalRecords: 0, avgScore: 0, maxScore: 0, recentTrend: 'stable' };
    }

    const values = data.map(d => d.metric_value);
    const totalRecords = values.length;
    const avgScore = Math.round(values.reduce((a, b) => a + b, 0) / totalRecords);
    const maxScore = Math.max(...values);

    // 计算趋势：对比最近 3 次和之前的平均值
    let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (values.length >= 4) {
      const recentAvg = values.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = values.slice(0, -3).reduce((a, b) => a + b, 0) / (values.length - 3);
      if (recentAvg > olderAvg * 1.05) recentTrend = 'improving';
      else if (recentAvg < olderAvg * 0.95) recentTrend = 'declining';
    }

    return { totalRecords, avgScore, maxScore, recentTrend };
  } catch (err) {
    console.error('Stage summary error:', err);
    return { totalRecords: 0, avgScore: 0, maxScore: 0, recentTrend: 'stable' };
  }
}

/**
 * 获取高频面试题统计（从所有用户的面试数据中聚合）
 */
export async function getPopularQuestions(
  limit: number = 10
): Promise<Array<{ question: string; frequency: number; avgScore: number }>> {
  try {
    const client = await getDbClient();
    if (!client) return [];

    const { data } = await client
      .from('user_analytics')
      .select('metadata')
      .eq('stage', 'interview')
      .eq('metric_type', 'interview_score')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!data || data.length === 0) return [];

    // 从 metadata 中提取问题并聚合
    const questionMap = new Map<string, { count: number; totalScore: number }>();
    for (const record of data) {
      const meta = record.metadata as Record<string, any>;
      if (meta?.question) {
        const q = meta.question;
        const existing = questionMap.get(q) || { count: 0, totalScore: 0 };
        existing.count++;
        existing.totalScore += (meta.score || 0);
        questionMap.set(q, existing);
      }
    }

    return Array.from(questionMap.entries())
      .map(([question, stats]) => ({
        question,
        frequency: stats.count,
        avgScore: stats.count > 0 ? Math.round(stats.totalScore / stats.count) : 0,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  } catch (err) {
    console.error('Popular questions error:', err);
    return [];
  }
}
