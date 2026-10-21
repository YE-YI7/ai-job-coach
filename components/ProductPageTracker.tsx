"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { analyticsPage, trackProductEvent } from "@/lib/product-events";

export default function ProductPageTracker() {
  const pathname = usePathname(),
    previous = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname) return;
    const page = analyticsPage(pathname);
    if (!page) {
      previous.current = null;
      return;
    }
    const record = () => {
      if (
        document.visibilityState !== "visible" ||
        previous.current === pathname
      )
        return;
      previous.current = pathname;
      trackProductEvent("page_viewed", { page });
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [pathname]);
  return null;
}
