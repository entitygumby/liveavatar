import { NextResponse } from "next/server";
import { bindThirdPartyVoice } from "@/lib/liveavatar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      provider_voice_id?: string;
      secret_id?: string;
      name?: string;
    };
    if (!body.provider_voice_id || !body.secret_id) {
      return NextResponse.json(
        { error: "provider_voice_id and secret_id are required" },
        { status: 400 },
      );
    }
    const result = await bindThirdPartyVoice({
      provider_voice_id: body.provider_voice_id,
      secret_id: body.secret_id,
      name: body.name,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
