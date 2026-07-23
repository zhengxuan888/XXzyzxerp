import { NextRequest, NextResponse } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { getMembershipAwareMenus } from "@/lib/permission-guard";

function toArrayMap(
  menuMap: Map<string | null, { id: string; key: string; label: string; path: string; icon: string | null; parentId: string | null; sortOrder: number }[]>,
) {
  const result: Array<{
    id: string;
    key: string;
    label: string;
    path: string;
    icon: string | null;
    sortOrder: number;
    parentId: string | null;
  }> = [];
  for (const nodes of menuMap.values()) {
    result.push(...nodes);
  }
  return result;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthContext(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  const menuMap = await getMembershipAwareMenus({ membershipId: auth.membership.id, userId: auth.userId });
  return NextResponse.json({ menuItems: toArrayMap(menuMap) });
}
