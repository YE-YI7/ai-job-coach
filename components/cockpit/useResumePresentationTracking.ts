"use client";
import {useEffect, useRef} from "react";
import {trackProductEvent} from "@/lib/product-events";

/** 文档版本随保存回读即可观测；交付是否真实由事件接口核对本账号的服务端回执。 */
export function useResumePresentationTracking(generationId: string | null | undefined, visible: boolean) {
  const presented = useRef(new Set<string>());
  useEffect(() => {
    if (!visible || !generationId || presented.current.has(generationId)) return;
    presented.current.add(generationId);
    trackProductEvent("resume_result_presented", {generation_id:generationId});
  }, [generationId, visible]);
}
