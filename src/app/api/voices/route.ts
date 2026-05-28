import { NextResponse } from "next/server";
import { listVoices } from "@/lib/liveavatar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch both — private (cloned/imported) first so they appear at the top
    const [priv, pub] = await Promise.all([
      listVoices("private").catch(() => []),
      listVoices("public"),
    ]);
    return NextResponse.json({
      private: priv,
      public: pub,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
