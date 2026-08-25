import { NextResponse } from "next/server";

import release from "../../../../.agents/plugins/plugins/yi-zhi/release.json";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(release, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    }
  });
}
