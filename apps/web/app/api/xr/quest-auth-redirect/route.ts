import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unavailable in production." }, { status: 404 });
  }

  const tidSession = request.nextUrl.searchParams.get("tidSession");
  const nextPath = request.nextUrl.searchParams.get("next") ?? "/";

  if (!tidSession || !nextPath.startsWith("/")) {
    return NextResponse.json({ error: "Missing tidSession or safe next path." }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set("tid_session", tidSession, {
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: false
  });

  return response;
}
