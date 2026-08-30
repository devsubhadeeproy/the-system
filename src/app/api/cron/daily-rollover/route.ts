import { NextResponse } from "next/server";

import { processAllUsersDailyQuestRollover } from "@/lib/dailyQuestRollover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await processAllUsersDailyQuestRollover();

    return NextResponse.json({
      ok: true,
      ...result,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Daily quest rollover failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Daily quest rollover failed.",
      },
      { status: 500 },
    );
  }
}
