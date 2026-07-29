export const ADMIN_RESOURCE_MAP = {
  "legal-entities": {
    model: "legalEntity" as const,
    readAction: "legal_entity.read",
    writeAction: "legal_entity.create",
    updateAction: "legal_entity.update",
    deleteAction: "legal_entity.delete",
  },
  "business-units": {
    model: "businessUnit" as const,
    readAction: "business_unit.read",
    writeAction: "business_unit.create",
    updateAction: "business_unit.update",
    deleteAction: "business_unit.delete",
  },
  departments: {
    model: "department" as const,
    readAction: "department.read",
    writeAction: "department.create",
    updateAction: "department.update",
    deleteAction: "department.delete",
  },
  users: {
    model: "user" as const,
    readAction: "user.read",
    writeAction: "user.create",
    updateAction: "user.update",
    deleteAction: "user.delete",
  },
  memberships: {
    model: "membership" as const,
    readAction: "membership.read",
    writeAction: "membership.create",
    updateAction: "membership.update",
    deleteAction: "membership.delete",
  },
  roles: {
    model: "role" as const,
    readAction: "role.read",
    writeAction: "role.create",
    updateAction: "role.update",
    deleteAction: "role.delete",
  },
  menus: {
    model: "menu" as const,
    readAction: "menu.read",
    writeAction: "menu.create",
    updateAction: "menu.update",
    deleteAction: "menu.delete",
  },
  "access-grants": {
    model: "accessGrant" as const,
    readAction: "access_grant.read",
    writeAction: "access_grant.create",
    updateAction: "access_grant.update",
    deleteAction: "access_grant.delete",
  },
  "sites": {
    model: "site" as const,
    readAction: "site.read",
    writeAction: "site.create",
    updateAction: "site.update",
    deleteAction: "site.delete",
  },
} as const;

export type AdminResource = keyof typeof ADMIN_RESOURCE_MAP;
