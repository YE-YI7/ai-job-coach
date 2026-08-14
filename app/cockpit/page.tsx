import { redirect } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities } from "@/lib/coach-harness/repository";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const user = await getCurrentUserFromRequest();
  if (!user) redirect("/login?redirect=%2Fcockpit");

  const opportunities = await listCockpitOpportunities(user.id).catch(() => []);
  return <CockpitApp initialOpportunities={opportunities} userEmail={user.email} dataMode="live" />;
}
