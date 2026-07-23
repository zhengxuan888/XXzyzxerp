import { validate } from "deep-email-validator";
import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckName = "regex" | "typo" | "disposable" | "mx" | "smtp";
const CHECK_ORDER: CheckName[] = ["regex", "typo", "disposable", "mx", "smtp"];
const CHECK_LABELS: Record<CheckName, string> = {
  regex: "邮箱格式",
  typo: "拼写检查",
  disposable: "临时邮箱",
  mx: "MX 服务器",
  smtp: "具体邮箱",
};
const UNCERTAIN = ["timeout", "timed out", "unexpectedly closed", "connection", "network", "unrecognized", "try again", "busy", "shut down", "unknown"];

function translateFailure(check: CheckName, reason = "") {
  if (check === "regex") return "邮箱格式不正确";
  if (check === "typo") return "邮箱域名疑似拼写错误，请检查后重新输入";
  if (check === "disposable") return "不接受临时或一次性邮箱";
  if (check === "mx") return "该域名没有可用的邮件服务器";
  if (reason.toLowerCase().includes("mailbox not found")) return "邮件服务器确认该邮箱不存在";
  return "邮件服务器未能确认这个具体邮箱";
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email !== "string" || !body.email.trim()) {
      return NextResponse.json({ error: "请输入客户邮箱" }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const result = await validate({
      email,
      validateRegex: true,
      validateTypo: true,
      validateDisposable: true,
      validateMx: true,
      validateSMTP: true,
    });
    const failedIndex = result.reason ? CHECK_ORDER.indexOf(result.reason) : CHECK_ORDER.length - 1;
    const checks = CHECK_ORDER.slice(0, failedIndex + 1).map((name) => {
      const check = result.validators[name] ?? { valid: false };
      return {
        name,
        label: CHECK_LABELS[name],
        passed: check.valid,
        detail: check.valid ? "通过" : translateFailure(name, check.reason),
      };
    });
    const smtp = result.validators.smtp;
    const smtpReason = smtp?.reason?.toLowerCase() ?? "";
    const smtpUncertain = result.reason === "smtp" && (!smtpReason || UNCERTAIN.some((word) => smtpReason.includes(word)));

    if (result.valid && smtp?.valid) {
      return NextResponse.json({
        valid: true,
        verified: true,
        status: "likely_valid",
        message: "邮件服务器接受该邮箱，真实性较高",
        checks,
      });
    }
    if (smtpUncertain) {
      return NextResponse.json({
        valid: false,
        verified: false,
        status: "unknown",
        message: "格式和域名正常，但服务商未公开具体账号状态，无法确认真实性",
        checks,
      });
    }

    const failedCheck = (result.reason || "smtp") as CheckName;
    return NextResponse.json({
      valid: false,
      verified: false,
      status: "invalid",
      message: translateFailure(failedCheck, result.validators[failedCheck]?.reason),
      checks,
    });
  } catch (error) {
    console.error("Email validation failed:", error);
    return NextResponse.json({
      valid: false,
      verified: false,
      status: "unknown",
      message: "邮箱检测服务暂时不可用，请稍后重试",
    }, { status: 503 });
  }
}
