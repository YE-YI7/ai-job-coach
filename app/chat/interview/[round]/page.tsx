import { redirect } from "next/navigation";

export default async function LegacyInterviewPage({
  params,
}: {
  params: Promise<{ round: string }>;
}) {
  const { round } = await params;
  const query = new URLSearchParams({ from: "legacy-interview", round });
  redirect(`/cockpit?tab=interview&${query.toString()}`);
}
