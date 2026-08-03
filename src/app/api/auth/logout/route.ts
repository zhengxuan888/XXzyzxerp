import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  // Logout is submitted by a normal HTML form in both the browser and the
  // desktop shell. Returning JSON navigates the whole window to the API
  // response, so finish the session with a POST/Redirect/GET instead.
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return response;
}
