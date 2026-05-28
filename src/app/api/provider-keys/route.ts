import { NextResponse } from "next/server";
import {
  createSecret,
  listSecrets,
  type SecretType,
} from "@/lib/liveavatar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SecretType[] = [
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "GEMINI_API_KEY",
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get("type");
    let secrets = await listSecrets();
    if (typeFilter && VALID_TYPES.includes(typeFilter as SecretType)) {
      secrets = secrets.filter((s) => s.secret_type === typeFilter);
    }
    return NextResponse.json({ providerKeys: secrets });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      secret_type?: string;
      secret_name?: string;
      secret_value?: string;
    };
    if (
      !body.secret_type ||
      !VALID_TYPES.includes(body.secret_type as SecretType)
    ) {
      return NextResponse.json(
        { error: `secret_type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    if (!body.secret_name || !body.secret_value) {
      return NextResponse.json(
        { error: "secret_name and secret_value are required" },
        { status: 400 },
      );
    }
    const result = await createSecret({
      secret_type: body.secret_type as SecretType,
      secret_name: body.secret_name,
      secret_value: body.secret_value,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
