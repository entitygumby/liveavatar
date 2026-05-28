import { NextResponse } from "next/server";
import { keepAliveSession } from "@/lib/liveavatar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { sessionToken } = (await req.json()) as { sessionToken?: string };
    if (!sessionToken) {
      return NextResponse.json(
        { error: "sessionToken is required" },
        { status: 400 },
      );
    }
    await keepAliveSession(sessionToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
