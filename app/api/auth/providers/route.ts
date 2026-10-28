import { NextResponse } from "next/server";
import { getAuthProviders } from "@/lib/auth";

/** Sign-in methods with their enabled flags: `[{id,label,enabled}]`. */
export async function GET() {
  return NextResponse.json(getAuthProviders());
}
