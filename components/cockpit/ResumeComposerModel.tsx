"use client";
import { createContext, type ReactNode } from "react";
import type { ChatMode } from "@/lib/coach-harness/chat-options";

// 两种导师视图共用现有模型状态和目录，不再藏掉选择入口或另建偏好。
const ResumeComposerModel = createContext<{control:ReactNode;mode:ChatMode}|null>(null);
export default ResumeComposerModel;
