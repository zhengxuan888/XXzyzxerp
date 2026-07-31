import { NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { checkPermission } from "@/lib/permission";
import { resourceConfigInputSchema } from "@/lib/resource-input";
import { createResourceAccessPlan } from "@/lib/resource-access";
import { prisma } from "@/lib/prisma";

const WIDE_SCOPES = ["ALL", "BUSINESS_UNIT"] as const;

async function canConfigure(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "resource.configure",
    targetBusinessUnitId: auth.membership.businessUnitId,
    allowedScopes: WIDE_SCOPES,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const [readPlan, createPlan, updatePlan, lifecyclePlan, archivePlan, accountManagePlan, configureDecision, categories, statuses, lifecycleActions, departments, sites, memberships] = await Promise.all([
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.read" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.create" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.update" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.lifecycle.manage" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "resource.archive" }),
    createResourceAccessPlan({ membership: auth.membership, actionKey: "software_asset.account.manage" }),
    canConfigure(auth),
    prisma.resourceCategory.findMany({
      where: { businessUnitId: auth.membership.businessUnitId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.resourceStatus.findMany({
      where: { businessUnitId: auth.membership.businessUnitId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.resourceLifecycleAction.findMany({
      where: { businessUnitId: auth.membership.businessUnitId },
      include: { fromStatus: { select: { name: true } }, toStatus: { select: { name: true } } },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.department.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, code: true, name: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.site.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, code: true, name: true, departmentId: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.membership.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true, OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }] },
      select: { id: true, departmentId: true, siteId: true, user: { select: { username: true, fullName: true } } },
      orderBy: { user: { username: "asc" } },
    }),
  ]);
  if (!readPlan.allowed && !createPlan.allowed && !updatePlan.allowed && !lifecyclePlan.allowed && !archivePlan.allowed) {
    return fail("FORBIDDEN", "没有资源中心访问权限。", 403);
  }

  const plansForTargetSelection = [createPlan, updatePlan, lifecyclePlan, archivePlan];
  const allowsAny = (target: { businessUnitId: string; departmentId: string | null; siteId: string | null; assignedMembershipId: string | null }) =>
    plansForTargetSelection.some((plan) => plan.allows(target));

  const allowedDepartments = departments.filter((department) =>
    allowsAny({
      businessUnitId: auth.membership.businessUnitId,
      departmentId: department.id,
      siteId: null,
      assignedMembershipId: null,
    }) || department.id === auth.membership.departmentId,
  );
  const allowedSites = sites.filter((site) =>
    allowsAny({
      businessUnitId: auth.membership.businessUnitId,
      departmentId: site.departmentId,
      siteId: site.id,
      assignedMembershipId: null,
    }) || site.id === auth.membership.siteId,
  );
  const allowedMemberships = memberships.filter((membership) =>
    allowsAny({
      businessUnitId: auth.membership.businessUnitId,
      departmentId: membership.departmentId,
      siteId: membership.siteId,
      assignedMembershipId: membership.id,
    }),
  );

  return ok({
    categories,
    statuses,
    lifecycleActions,
    departments: allowedDepartments,
    sites: allowedSites,
    memberships: allowedMemberships.map((membership) => ({
      id: membership.id,
      departmentId: membership.departmentId,
      siteId: membership.siteId,
      name: membership.user.fullName || membership.user.username,
      username: membership.user.username,
    })),
    capabilities: {
      canRead: readPlan.allowed,
      canCreate: createPlan.allowed,
      canUpdate: updatePlan.allowed,
      canLifecycle: lifecyclePlan.allowed,
      canArchive: archivePlan.allowed,
      canManageSoftwareAccount: accountManagePlan.allowed,
      canConfigure: configureDecision.allowed,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canConfigure(auth);
  if (!permission.allowed) return fail("FORBIDDEN", "没有配置资源分类和流转规则的权限。", 403);

  const body = await request.json().catch(() => null);
  const parsed = resourceConfigInputSchema.safeParse(body);
  if (!parsed.success) return fail("INVALID_RESOURCE_CONFIG", "资源配置不符合要求。", 400, parsed.error.flatten());
  if (parsed.data.kind === "lifecycleAction") {
    const statusIds = [parsed.data.fromStatusId, parsed.data.toStatusId].filter((value): value is string => Boolean(value));
    if (statusIds.length) {
      const count = await prisma.resourceStatus.count({ where: { id: { in: statusIds }, businessUnitId: auth.membership.businessUnitId, isActive: true } });
      if (count !== new Set(statusIds).size) return fail("RESOURCE_STATUS_INVALID", "流转动作引用了不存在、已停用或不属于当前业务板块的状态。", 400);
    }
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      let row: { id: string; code: string; name: string };
      let targetType: string;
      if (parsed.data.kind === "category") {
        const category = await tx.resourceCategory.create({
          data: {
            legalEntityId: auth.membership.legalEntityId,
            businessUnitId: auth.membership.businessUnitId,
            code: parsed.data.code,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            isSoftware: parsed.data.isSoftware,
            sortOrder: parsed.data.sortOrder,
          },
        });
        row = category;
        targetType = "resource_category";
      } else if (parsed.data.kind === "status") {
        const status = await tx.resourceStatus.create({
          data: {
            legalEntityId: auth.membership.legalEntityId,
            businessUnitId: auth.membership.businessUnitId,
            code: parsed.data.code,
            name: parsed.data.name,
            color: parsed.data.color ?? null,
            isTerminal: parsed.data.isTerminal,
            sortOrder: parsed.data.sortOrder,
          },
        });
        row = status;
        targetType = "resource_status";
      } else {
        const lifecycleAction = await tx.resourceLifecycleAction.create({
          data: {
            legalEntityId: auth.membership.legalEntityId,
            businessUnitId: auth.membership.businessUnitId,
            code: parsed.data.code,
            name: parsed.data.name,
            fromStatusId: parsed.data.fromStatusId ?? null,
            toStatusId: parsed.data.toStatusId ?? null,
            availableQuantityDelta: parsed.data.availableQuantityDelta,
            archiveAsset: parsed.data.archiveAsset,
            requiresAssignee: parsed.data.requiresAssignee,
            sortOrder: parsed.data.sortOrder,
          },
        });
        row = lifecycleAction;
        targetType = "resource_lifecycle_action";
      }
      await writeAuditLog({
        actorUserId: auth.userId,
        actorMembershipId: auth.membership.id,
        module: "mvp.resource_config",
        action: "resource.configure.create",
        targetType,
        targetId: row.id,
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId: auth.membership.businessUnitId,
        roleId: auth.membership.roleId,
        details: { kind: parsed.data.kind, code: row.code, name: row.name },
      }, tx);
      return row;
    });
    return ok(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源配置创建失败。";
    if (message.includes("_businessUnitId_code_key")) return fail("RESOURCE_CONFIG_CODE_CONFLICT", "当前业务板块内配置编码已存在。", 409);
    throw error;
  }
}
