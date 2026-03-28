"use client";

/**
 * SSE 流式分析 Hook
 *
 * 消费 POST /api/interview-review/analyze-stream 的 SSE 事件流，
 * 暴露渐进式状态供 AnalyzingPhase 组件使用。
 *
 * 因为是 POST 请求，不能用浏览器原生 EventSource，
 * 改用 fetch + ReadableStream.getReader() 手动解析 SSE。
 */

import { useState, useCallback, useRef } from "react";
import type {
  ParsedQuestion,
  QuestionAnalysisResult,
  ReviewSummary,
  ReviewRoleId,
  DiscussionTurn,
} from "@/lib/interview-review/types";

// ==================== 类型 ====================

export interface RoleInfo {
  id: ReviewRoleId;
  name: string;
  tag: string;
}

export type StreamStatus = "idle" | "connecting" | "streaming" | "complete" | "error";

export interface AnalysisStreamState {
  status: StreamStatus;
  rolesUsed: RoleInfo[];
  currentQuestionIndex: number;
  totalQuestions: number;
  /** 每道题正在进行的讨论气泡 */
  liveTurns: Record<number, DiscussionTurn[]>;
  /** 已完成的题目结果 */
  completedResults: QuestionAnalysisResult[];
  summary: ReviewSummary | null;
  error: string | null;
}

export interface StartStreamParams {
  questions: ParsedQuestion[];
  company?: string;
  round?: string;
  tags?: string[];
  resume_text?: string;
  job_description?: string;
  session_id?: string;
}

// ==================== SSE 解析 ====================

interface SSEEvent {
  event: string;
  data: string;
}

/** 从文本 buffer 中解析出完整的 SSE 事件 */
function parseSSEBuffer(buffer: string): { events: SSEEvent[]; remaining: string } {
  const events: SSEEvent[] = [];
  // SSE 事件以 \n\n 分隔
  const parts = buffer.split("\n\n");
  // 最后一个 part 可能不完整
  const remaining = parts.pop() || "";

  for (const part of parts) {
    if (!part.trim()) continue;

    let event = "";
    let data = "";

    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }

    if (event && data) {
      events.push({ event, data });
    }
  }

  return { events, remaining };
}

// ==================== Hook ====================

export function useAnalysisStream() {
  const [state, setState] = useState<AnalysisStreamState>({
    status: "idle",
    rolesUsed: [],
    currentQuestionIndex: -1,
    totalQuestions: 0,
    liveTurns: {},
    completedResults: [],
    summary: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (params: StartStreamParams) => {
    // 如果有正在进行的流，先取消
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // 重置状态
    setState({
      status: "connecting",
      rolesUsed: [],
      currentQuestionIndex: -1,
      totalQuestions: params.questions.length,
      liveTurns: {},
      completedResults: [],
      summary: null,
      error: null,
    });

    try {
      const res = await fetch("/api/interview-review/analyze-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "请求失败" }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("浏览器不支持流式响应");
      }

      setState(prev => ({ ...prev, status: "streaming" }));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEBuffer(buffer);
        buffer = remaining;

        for (const { event, data } of events) {
          try {
            const parsed = JSON.parse(data);
            handleSSEEvent(event, parsed);
          } catch {
            console.warn("[SSE] Failed to parse event data:", data);
          }
        }
      }

      // 流结束，确保状态为 complete
      setState(prev => {
        if (prev.status === "streaming") {
          return { ...prev, status: "complete" };
        }
        return prev;
      });
    } catch (err: any) {
      if (err.name === "AbortError") return; // 用户主动取消
      console.error("[SSE] Stream error:", err);
      setState(prev => ({
        ...prev,
        status: "error",
        error: err.message || "分析过程出错",
      }));
    }
  }, []);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(prev => ({ ...prev, status: "idle" }));
  }, []);

  /** 处理单条 SSE 事件 */
  function handleSSEEvent(event: string, data: any) {
    switch (event) {
      case "roles":
        setState(prev => ({
          ...prev,
          rolesUsed: data.roles_used || [],
        }));
        break;

      case "question_start":
        setState(prev => ({
          ...prev,
          currentQuestionIndex: data.question_index,
          totalQuestions: data.total,
          liveTurns: { ...prev.liveTurns, [data.question_index]: [] },
        }));
        break;

      case "discussion_turn":
        setState(prev => ({
          ...prev,
          liveTurns: {
            ...prev.liveTurns,
            [data.question_index]: [
              ...(prev.liveTurns[data.question_index] || []),
              data.turn,
            ],
          },
        }));
        break;

      case "question_complete":
        setState(prev => ({
          ...prev,
          completedResults: [...prev.completedResults, data.result],
        }));
        break;

      case "summary":
        setState(prev => ({
          ...prev,
          summary: data,
        }));
        break;

      case "done":
        setState(prev => ({
          ...prev,
          status: "complete",
        }));
        break;

      case "error":
        setState(prev => ({
          ...prev,
          status: "error",
          error: data.message || "分析过程出错",
        }));
        break;
    }
  }

  return {
    ...state,
    startStream,
    cancelStream,
  };
}
