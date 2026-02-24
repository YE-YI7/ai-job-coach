import { z } from "zod";

/**
 * 简历结构化 Schema
 * 使用 Zod 定义强类型验证
 */
export const ResumeSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),

  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string().optional(),
      major: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
    })
  ),

  experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      start: z.string().optional(),
      end: z.string().optional(),
      description: z.array(z.string()),
    })
  ),

  projects: z.array(
    z.object({
      name: z.string(),
      details: z.array(z.string()),
    })
  ),

  skills: z.array(z.string()),
});

/**
 * 简历类型
 * 从 ResumeSchema 推断出的 TypeScript 类型
 */
export type Resume = z.infer<typeof ResumeSchema>;

