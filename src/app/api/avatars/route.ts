import { NextResponse } from "next/server";
import { listAvatars } from "@/lib/liveavatar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const avatars = await listAvatars();
    return NextResponse.json({ avatars });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
