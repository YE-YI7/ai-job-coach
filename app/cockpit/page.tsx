import { redirect } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { demoOpportunities } from "@/lib/opportunities/demo";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const user = await getCurrentUserFromRequest();
  if (!user) redirect("/login?redirect=%2Fcockpit");

  return <CockpitApp initialOpportunities={demoOpportunities} userEmail={user.email} />;
}
