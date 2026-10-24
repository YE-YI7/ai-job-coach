"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackProductEvent } from "@/lib/product-events";
import type { EntryKind } from "@/lib/entry-doors";

export default function EntryTrackLink({ kind, href, className, children }: {
  kind: EntryKind;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return <Link className={className} href={href}
    onClick={() => trackProductEvent("landing_task_clicked", { task: kind, placement: "hero" })}>
    {children}
  </Link>;
}
