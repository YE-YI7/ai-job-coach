import { z } from "zod";

/**
 * 阶段类型定义
 */
export const PHASES = [
  "career_plan",
  "project_review",
  "resume_edit",
  "interview",
  "negotiation",
  "offer",
] as const;

/**
 * 阶段类型
 */
export type Phase = (typeof PHASES)[number];

/**
 * 阶段验证 Schema
 */
const PhaseSchema = z.enum(PHASES);

/**
 * 状态机类
 * 管理求职流程的各个阶段
 */
export class StateMachine {
  private currentPhase: Phase;
  private readonly phases: readonly Phase[];

  /**
   * 构造函数
   * @param initialPhase 初始阶段，默认为第一个阶段
   */
  constructor(initialPhase: Phase = PHASES[0]) {
    this.phases = PHASES;
    // 验证初始阶段
    this.currentPhase = PhaseSchema.parse(initialPhase);
  }

  /**
   * 获取当前阶段
   * @returns Phase 当前阶段名称
   */
  getPhase(): Phase {
    return this.currentPhase;
  }

  /**
   * 设置阶段
   * @param phaseName 要跳转到的阶段名称
   * @throws {z.ZodError} 如果阶段名称无效
   */
  setPhase(phaseName: string): void {
    // 使用 zod 校验阶段名称
    const validatedPhase = PhaseSchema.parse(phaseName);
    this.currentPhase = validatedPhase;
  }

  /**
   * 进入下一阶段
   * 按照 phases 顺序自动进入下一阶段
   * 边界规则：如果已经在 "offer" 阶段，则保持不变
   * @returns Phase 新的阶段（如果已到最后阶段则返回当前阶段）
   */
  next(): Phase {
    const currentIndex = this.phases.indexOf(this.currentPhase);

    // 边界检查：如果已经在最后一个阶段，保持不变
    if (currentIndex === this.phases.length - 1) {
      return this.currentPhase;
    }

    // 进入下一阶段
    const nextIndex = currentIndex + 1;
    this.currentPhase = this.phases[nextIndex];

    return this.currentPhase;
  }

  /**
   * 获取所有阶段
   * @returns readonly Phase[] 所有阶段的数组
   */
  getPhases(): readonly Phase[] {
    return this.phases;
  }

  /**
   * 检查是否为最后一个阶段
   * @returns boolean
   */
  isLastPhase(): boolean {
    return this.currentPhase === this.phases[this.phases.length - 1];
  }

  /**
   * 检查是否为第一个阶段
   * @returns boolean
   */
  isFirstPhase(): boolean {
    return this.currentPhase === this.phases[0];
  }

  /**
   * 获取当前阶段的索引
   * @returns number 当前阶段在 phases 数组中的索引
   */
  getCurrentPhaseIndex(): number {
    return this.phases.indexOf(this.currentPhase);
  }
}

/**
 * 状态机单例实例
 */
export const stateMachine = new StateMachine();

