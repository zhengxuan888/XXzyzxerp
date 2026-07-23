import { NextRequest, NextResponse } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const decision = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "customer.delete",
    targetBusinessUnitId: customer.businessUnitId,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: "FORBIDDEN", reasons: decision.reasons }, { status: 403 });
  }

  const row = await prisma.customer.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.customers",
    action: "customer.delete",
    targetType: "customer",
    targetId: row.id,
    businessUnitId: row.businessUnitId,
    roleId: auth.membership.roleId,
  });

  return NextResponse.json({ ok: true, deleted: row.id });
}
