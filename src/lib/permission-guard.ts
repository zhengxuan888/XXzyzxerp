import { prisma } from "@/lib/prisma";
import { checkPermission, getAllowedActionsForSession } from "@/lib/permission";

type PermissionSource = {
  id: string;
  key: string;
  label: string;
  path: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  requiredCondition: unknown;
};

function hasNoBlockingCondition(value: unknown) {
  if (value === null || value === undefined) return true;

  // Dashboard shortcut settings were stored in the legacy `requiredCondition`
  // JSON column before a dedicated presentation-config column existed. They do
  // not express an authorization rule: treating them as one hides an otherwise
  // authorized menu (for example, “订单管理”) from every non-founder role.
  //
  // Keep this compatibility narrow and fail closed for every other JSON shape.
  // When we add an executable condition language, only an explicitly supported
  // condition envelope should be allowed through here.
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length > 0
    && keys.every((key) => key === "dashboardShortcut" || key === "shortcutOrder")
    && (record.dashboardShortcut === true || Number.isInteger(record.shortcutOrder));
}

export type PermissionOptions = {
  userId: string;
  membershipId: string;
  actionKey: string;
  targetBusinessUnitId?: string | null;
  targetDepartmentId?: string | null;
  targetSiteId?: string | null;
  targetUserId?: string | null;
  targetMembershipId?: string | null;
};

export async function requirePermission(opts: PermissionOptions): Promise<void> {
  const decision = await checkPermission(opts);
  if (!decision.allowed) {
    const error: Error & { status?: number; code?: string[] } = new Error(`FORBIDDEN:${decision.reasons.join(",")}`);
    error.status = 403;
    error.code = decision.reasons;
    throw error;
  }
}

export async function getMembershipAwareMenus(opts: {
  membershipId: string;
  userId: string;
}): Promise<Map<string | null, PermissionSource[]>> {
  const now = new Date();
  const membership = await prisma.membership.findFirst({
    where: {
      id: opts.membershipId,
      userId: opts.userId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    },
    include: { role: { select: { code: true } } },
  });
  if (!membership) return new Map<string | null, PermissionSource[]>();

  const permissionSet = await getAllowedActionsForSession({
    userId: opts.userId,
    membershipId: opts.membershipId,
  });
  const allowed = new Set(permissionSet);
  const trustedAdministrator = ["platform_admin", "legacy_admin"].includes(membership.role.code);

  const menuPermissions = await prisma.menuPermission.findMany({
    where: { roleId: membership.roleId, isEnabled: true },
    select: { menuId: true },
  });
  const roleMenuIds = new Set(menuPermissions.map((item) => item.menuId));
  const grantActions = new Set(
    (
      await prisma.accessGrant.findMany({
        where: {
          granteeMembershipId: membership.id,
          businessUnitId: membership.businessUnitId,
          isActive: true,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { actionKey: true },
      })
    ).map((item) => item.actionKey),
  );
  const menus = await prisma.menu.findMany({ where: { isActive: true } });
  const parentMenuIds = new Set(menus.flatMap((item) => item.parentId ? [item.parentId] : []));

  type MenuPermissionView = Omit<PermissionSource, "id"> & {
    id: string;
    requiredActionKey: string | null;
  };

  const initiallyVisible = menus
    .map(
      (item): MenuPermissionView => ({
        id: item.id,
        key: item.key,
        label: item.label,
        path: item.path,
        icon: item.icon,
        parentId: item.parentId,
        sortOrder: item.sortOrder,
        requiredActionKey: item.requiredActionKey,
        requiredCondition: item.requiredCondition,
      }),
    )
    .filter(
      (item) =>
        !parentMenuIds.has(item.id) &&
        hasNoBlockingCondition(item.requiredCondition) &&
        (trustedAdministrator || roleMenuIds.has(item.id) || Boolean(item.requiredActionKey && grantActions.has(item.requiredActionKey))) &&
        (!item.requiredActionKey || allowed.has(item.requiredActionKey)),
    )
    .map((item) => ({
      id: item.id,
      key: item.key,
      label: item.label,
      path: item.path,
      icon: item.icon,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      requiredCondition: item.requiredCondition,
    }));

  const visibleIds = new Set(initiallyVisible.map((item) => item.id));
  const menuById = new Map(menus.map((item) => [item.id, item]));
  for (const item of initiallyVisible) {
    let parentId = item.parentId;
    while (parentId) {
      const parent = menuById.get(parentId);
      // A group can itself carry a condition. Do not use it as a way to
      // bypass a condition evaluator that has not been implemented yet.
      if (!parent || !hasNoBlockingCondition(parent.requiredCondition)) break;
      visibleIds.add(parent.id);
      parentId = parent.parentId;
    }
  }
  const items: PermissionSource[] = menus
    .filter((item) => visibleIds.has(item.id))
    .map((item) => ({
      id: item.id,
      key: item.key,
      label: item.label,
      path: item.path,
      icon: item.icon,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      requiredCondition: item.requiredCondition,
    }));

  const byParent = new Map<string | null, PermissionSource[]>();
  for (const item of items) {
    const current = byParent.get(item.parentId) ?? [];
    current.push(item);
    byParent.set(item.parentId, current);
  }

  for (const value of byParent.values()) {
    value.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }

  return byParent;
}
