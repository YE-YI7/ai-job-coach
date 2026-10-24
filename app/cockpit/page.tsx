import { redirect } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities } from "@/lib/coach-harness/repository";
import { parseEntryKind } from "@/lib/entry-doors";
import {landingHandoffHref} from '@/lib/landing-handoff';

export const dynamic = "force-dynamic";

const allowedTabs = new Set(["overview", "evidence", "resume", "interview", "review", "salary"]);

export default async function CockpitPage({ searchParams }: { searchParams: Promise<{ tab?: string; entry?: string;handoff?:string }> }) {
  const params = await searchParams;
  const initialEntry = parseEntryKind(params.entry) ?? undefined;
  const user = await getCurrentUserFromRequest();
  const handoff=initialEntry==='one_sentence'&&params.handoff==='1';
  const destination=handoff?landingHandoffHref():initialEntry?`/cockpit?entry=${initialEntry}`:'/cockpit';
  if (!user) redirect(`/login?redirect=${encodeURIComponent(destination)}`);
  const initialTab = params.tab && allowedTabs.has(params.tab) ? params.tab as "overview" | "evidence" | "resume" | "interview" | "review" | "salary" : undefined;
  // A failed read is not an empty account. Let the recovery boundary render.
  const opportunities = await listCockpitOpportunities(user.id);
  return <CockpitApp initialOpportunities={opportunities} userEmail={user.email} userId={user.id}
    dataMode="live" initialTab={initialTab} initialEntry={initialEntry} />;
}
