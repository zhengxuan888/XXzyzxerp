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

export type PermissionOptions = {
  userId: string;
  membershipId: string;
  actionKey: string;
  targetBusinessUnitId?: string | null;
  targetDepartmentId?: string | null;
  targetSiteId?: string | null;
  targetUserId?: string | null;
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
  const membership = await prisma.membership.findUnique({ where: { id: opts.membershipId } });
  if (!membership) return new Map<string | null, PermissionSource[]>();

  const permissionSet = await getAllowedActionsForSession({
    userId: opts.userId,
    membershipId: opts.membershipId,
  });
  const allowed = new Set(permissionSet);

  const menuPermissions = await prisma.menuPermission.findMany({
    where: { roleId: membership.roleId, isEnabled: true },
    select: { menuId: true },
  });
  const roleMenuIds = new Set(menuPermissions.map((item) => item.menuId));
  const now = new Date();
  const grantActions = new Set(
    (
      await prisma.accessGrant.findMany({
        where: {
          granteeMembershipId: membership.id,
          isActive: true,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { actionKey: true },
      })
    ).map((item) => item.actionKey),
  );
  const menus = await prisma.menu.findMany({ where: { isActive: true } });

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
        (roleMenuIds.has(item.id) || Boolean(item.requiredActionKey && grantActions.has(item.requiredActionKey))) &&
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
      visibleIds.add(parentId);
      parentId = menuById.get(parentId)?.parentId ?? null;
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
