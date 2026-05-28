import { NextResponse } from "next/server";
import { listContexts } from "@/lib/liveavatar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const contexts = await listContexts();
    // Newest first
    contexts.sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    return NextResponse.json({ contexts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
