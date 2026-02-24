/**
 * 跨阶段记忆管理 API
 * 
 * GET  /api/memory          - 查询用户记忆（支持按阶段、类型筛选）
 * POST /api/memory/trigger   - 手动触发记忆提取或总结
 * DELETE /api/memory         - 清理/停用记忆
 */

import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { 
  getUserMemories, 
  getCrossStageMemories, 
  getAllSummaries,
  deactivateMemory,
  deactivateStageMemories,
  type Stage 
} from "@/lib/memory";
import { buildMemoryContext, toMemoryStage } from "@/lib/memory-context-builder";

export const runtime = "nodejs";

/**
 * GET /api/memory
 * 查询用户的跨阶段记忆
 * 
 * Query params:
 *   stage     - 指定阶段（可选，不传则返回所有）
 *   type      - 'memories' | 'summaries' | 'context' | 'all'（默认 all）
 */
export async function GET(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const url = new URL(req.url);
    const stage = url.searchParams.get('stage') || undefined;
    const type = url.searchParams.get('type') || 'all';
    const memoryStage = stage ? toMemoryStage(stage) : undefined;

    const result: any = {};

    if (type === 'all' || type === 'memories') {
      result.memories = await getUserMemories(auth.id, memoryStage as Stage);
    }

    if (type === 'all' || type === 'summaries') {
      result.summaries = await getAllSummaries(auth.id, memoryStage as Stage);
    }

    if (type === 'all' || type === 'context') {
      // 构建当前阶段视角的记忆上下文预览
      const currentStage = stage || 'career_planning';
      result.context = await buildMemoryContext(auth.id, currentStage);
    }

    if (type === 'cross' && stage) {
      // 获取跨阶段记忆
      result.crossMemories = await getCrossStageMemories(
        auth.id, 
        memoryStage as Stage, 
        20
      );
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[Memory API] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器错误" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/memory
 * 停用/清理记忆
 * 
 * Body:
 *   memoryId  - 停用单条记忆
 *   stage     - 停用某阶段所有记忆
 */
export async function DELETE(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    
    if (body.memoryId) {
      await deactivateMemory(body.memoryId);
      return NextResponse.json({ ok: true, message: "记忆已停用" });
    }

    if (body.stage) {
      const memoryStage = toMemoryStage(body.stage);
      await deactivateStageMemories(auth.id, memoryStage as Stage);
      return NextResponse.json({ ok: true, message: `${body.stage} 阶段记忆已全部停用` });
    }

    return NextResponse.json(
      { ok: false, error: "请提供 memoryId 或 stage" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[Memory API] DELETE error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器错误" },
      { status: 500 }
    );
  }
}
