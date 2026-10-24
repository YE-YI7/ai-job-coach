"use client";

import { useEffect, useRef } from "react";
import { FIRST_LIGHT_HTML } from "./content";
import { mountFirstLight } from "./interactions";
import { trackProductEvent } from "@/lib/product-events";
import { parseEntryKind } from "@/lib/entry-doors";
import "./first-light.css";

export default function FirstLightHome() {
  const root = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);
  useEffect(() => {
    if (!root.current) return;
    // Restore the authored demo on every mount, including React Strict Mode.
    // No user account data is rendered into this subtree.
    root.current.innerHTML = FIRST_LIGHT_HTML;
    const cleanup = mountFirstLight(root.current);
    if (!viewed.current) {
      viewed.current = true;
      trackProductEvent("landing_viewed", { surface: "home" });
    }
    return cleanup;
  }, []);
  return (
    <div
      data-first-light-home
      ref={root}
      onClick={(event) => {
        const target = event.target;
        const link =
          target instanceof Element ? target.closest("a[href]") : null;
        if (!(link instanceof HTMLAnchorElement)) return;
        const url = new URL(link.href);
        const kind = parseEntryKind(url.searchParams.get("entry"));
        if (
          url.origin !== location.origin ||
          url.pathname !== "/cockpit" ||
          !kind
        )
          return;
        trackProductEvent("landing_task_clicked", {
          task: kind,
          placement: "first_light",
        });
      }}
      dangerouslySetInnerHTML={{ __html: FIRST_LIGHT_HTML }}
    />
  );
}
