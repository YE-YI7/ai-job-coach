import { redirect } from "next/navigation";
import { postLoginTarget } from "@/lib/auth-redirect";

/** Old bookmarks stay valid, but no user is forced through the retired tour. */
export default async function LegacyOnboardingRedirect({searchParams}:{searchParams:Promise<{redirect?:string}>}) {
  const params=await searchParams;
  redirect(postLoginTarget(params.redirect||null));
}
