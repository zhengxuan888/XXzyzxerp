import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  // Logout is submitted by a normal HTML form in both the browser and the
  // desktop shell. Returning JSON navigates the whole window to the API
  // response, so finish the session with a POST/Redirect/GET instead.
  // Keep Location relative: behind nginx, request.url contains the container
  // address (0.0.0.0:3000), which must never leak into the desktop client.
  const response = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return response;
}
