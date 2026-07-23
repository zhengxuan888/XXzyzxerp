import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getActiveMembershipById, parseSessionFromToken } from "@/lib/auth";

export type Session = {
  userId: string;
  username: string;
  activeMembershipId: string | null;
  membership?: {
    id: string;
    businessUnitId: string;
    departmentId: string | null;
    siteId: string | null;
    roleId: string;
    legalEntityId: string;
  } | null;
};

export async function getSessionFromCookie() {
  const raw = (await cookies()).get("erpv2_session")?.value;
  if (!raw) return null;
  return parseSessionFromToken(raw);
}

export async function getSessionFromRequest(req: NextRequest): Promise<Session | null> {
  const token =
    req.cookies.get("erpv2_session")?.value || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const parsed = await parseSessionFromToken(token);
  if (!parsed) return null;

  if (!parsed.activeMembershipId) {
    return parsed;
  }

  const membership = await getActiveMembershipById(parsed.activeMembershipId);
  return {
    ...parsed,
    membership: membership
      ? {
          id: membership.id,
          businessUnitId: membership.businessUnitId,
          departmentId: membership.departmentId,
          siteId: membership.siteId,
          roleId: membership.roleId,
          legalEntityId: membership.legalEntityId,
        }
      : null,
  };
}

export async function getSession(): Promise<Session | null> {
  return getSessionFromCookie();
}
