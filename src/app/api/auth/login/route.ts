import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody } from "@/lib/api/http";
import { z } from "zod";
import { performLogin } from "@/lib/auth/login";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, loginSchema);
  if (!parsed.ok) return parsed.response;

  const result = await performLogin(parsed.data.username, parsed.data.password);

  if (!result.ok) {
    return errorResponse(result.status, result.error);
  }

  return NextResponse.json({ user: result.user });
}
