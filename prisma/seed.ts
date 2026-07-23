import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type SeedAction = {
  key: string;
  name: string;
  namespace: string;
  scope: "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "SITE" | "SELF";
};

const actionDefs: SeedAction[] = [
  { key: "legal_entity.read", name: "Legal entity read", namespace: "erp", scope: "ALL" },
  { key: "legal_entity.create", name: "Legal entity create", namespace: "erp", scope: "ALL" },
  { key: "legal_entity.delete", name: "Legal entity delete", namespace: "erp", scope: "ALL" },
  { key: "business_unit.read", name: "Business unit read", namespace: "erp", scope: "ALL" },
  { key: "business_unit.create", name: "Business unit create", namespace: "erp", scope: "ALL" },
  { key: "business_unit.delete", name: "Business unit delete", namespace: "erp", scope: "ALL" },
  { key: "department.read", name: "Department read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "department.create", name: "Department create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "department.delete", name: "Department delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.read", name: "Site read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.create", name: "Site create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.delete", name: "Site delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.read", name: "User read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.create", name: "User create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.delete", name: "User delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.read", name: "Membership read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.create", name: "Membership create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.delete", name: "Membership delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "role.read", name: "Role read", namespace: "erp", scope: "ALL" },
  { key: "role.create", name: "Role create", namespace: "erp", scope: "ALL" },
  { key: "role.delete", name: "Role delete", namespace: "erp", scope: "ALL" },
  { key: "menu.read", name: "Menu read", namespace: "erp", scope: "ALL" },
  { key: "menu.create", name: "Menu create", namespace: "erp", scope: "ALL" },
  { key: "menu.delete", name: "Menu delete", namespace: "erp", scope: "ALL" },
  { key: "access_grant.read", name: "Access grant read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "access_grant.create", name: "Access grant create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "access_grant.delete", name: "Access grant delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "delegation.manage", name: "Delegation manage", namespace: "erp", scope: "ALL" },

  { key: "dashboard.view", name: "Dashboard view", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "customer.read", name: "Customer read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "customer.create", name: "Customer create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "customer.delete", name: "Customer delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "product.read", name: "Product read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.create", name: "Product create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.delete", name: "Product delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "sku.create", name: "SKU create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "inventory.read", name: "Inventory read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "inventory.adjust", name: "Inventory adjust", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "order.read", name: "Order read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.create", name: "Order create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.update", name: "Order update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.delete", name: "Order delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.status.update", name: "Order status update", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "shipment.read", name: "Shipment read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.create", name: "Shipment create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.track.update", name: "Shipment track update", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "expense.read", name: "Expense read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "expense.create", name: "Expense create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "expense.delete", name: "Expense delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "attendance.read", name: "Attendance read", namespace: "erp", scope: "DEPARTMENT" },
  { key: "attendance.create", name: "Attendance create", namespace: "erp", scope: "DEPARTMENT" },
  { key: "attendance.delete", name: "Attendance delete", namespace: "erp", scope: "DEPARTMENT" },
  { key: "attendance.approve", name: "Attendance approve", namespace: "erp", scope: "DEPARTMENT" },

  { key: "leave_request.read", name: "Leave request read", namespace: "erp", scope: "SELF" },
  { key: "leave_request.create", name: "Leave request create", namespace: "erp", scope: "SELF" },
  { key: "leave_request.approve", name: "Leave request approve", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "announcement.read", name: "Announcement read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "announcement.create", name: "Announcement create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "announcement.delete", name: "Announcement delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "document.read", name: "Document read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "document.create", name: "Document create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "document.delete", name: "Document delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "approval.submit", name: "Approval submit", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "approval.review", name: "Approval review", namespace: "erp", scope: "BUSINESS_UNIT" },
];

const menuDefs = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/admin",
    requiredActionKey: "dashboard.view",
    sortOrder: 1,
    isActive: true,
  },
  {
    key: "organizations",
    label: "Organizations",
    path: "/admin/organizations",
    requiredActionKey: "legal_entity.read",
    sortOrder: 10,
    isActive: true,
  },
  {
    key: "business-units",
    label: "Business Units",
    path: "/admin/business-units",
    requiredActionKey: "business_unit.read",
    sortOrder: 20,
    isActive: true,
  },
  {
    key: "departments",
    label: "Departments",
    path: "/admin/departments",
    requiredActionKey: "department.read",
    sortOrder: 30,
    isActive: true,
  },
  {
    key: "sites",
    label: "Sites",
    path: "/admin/sites",
    requiredActionKey: "site.read",
    sortOrder: 40,
    isActive: true,
  },
  {
    key: "users",
    label: "Users",
    path: "/admin/users",
    requiredActionKey: "user.read",
    sortOrder: 50,
    isActive: true,
  },
  {
    key: "memberships",
    label: "Memberships",
    path: "/admin/memberships",
    requiredActionKey: "membership.read",
    sortOrder: 60,
    isActive: true,
  },
  {
    key: "roles",
    label: "Roles",
    path: "/admin/roles",
    requiredActionKey: "role.read",
    sortOrder: 70,
    isActive: true,
  },
  {
    key: "menus",
    label: "Menu Settings",
    path: "/admin/menus",
    requiredActionKey: "menu.read",
    sortOrder: 80,
    isActive: true,
  },
  {
    key: "access-grants",
    label: "Access Grants",
    path: "/admin/access-grants",
    requiredActionKey: "access_grant.read",
    sortOrder: 90,
    isActive: true,
  },
  {
    key: "customers",
    label: "Customers",
    path: "/admin/customers",
    requiredActionKey: "customer.read",
    sortOrder: 100,
    isActive: true,
  },
  {
    key: "products",
    label: "Products",
    path: "/admin/products",
    requiredActionKey: "product.read",
    sortOrder: 110,
    isActive: true,
  },
  {
    key: "orders",
    label: "Orders",
    path: "/admin/orders",
    requiredActionKey: "order.read",
    sortOrder: 120,
    isActive: true,
  },
  {
    key: "inventory",
    label: "Inventory",
    path: "/admin/inventory",
    requiredActionKey: "inventory.read",
    sortOrder: 115,
    isActive: true,
  },
  {
    key: "shipments",
    label: "Shipments",
    path: "/admin/shipments",
    requiredActionKey: "shipment.read",
    sortOrder: 130,
    isActive: true,
  },
  {
    key: "expenses",
    label: "Expenses",
    path: "/admin/expenses",
    requiredActionKey: "expense.read",
    sortOrder: 140,
    isActive: true,
  },
  {
    key: "approvals",
    label: "Approvals",
    path: "/admin/approvals",
    requiredActionKey: "approval.submit",
    sortOrder: 150,
    isActive: true,
  },
  {
    key: "attendance",
    label: "Attendance",
    path: "/admin/attendance",
    requiredActionKey: "attendance.read",
    sortOrder: 160,
    isActive: true,
  },
  {
    key: "leave-requests",
    label: "Leave Requests",
    path: "/admin/leave-requests",
    requiredActionKey: "leave_request.read",
    sortOrder: 170,
    isActive: true,
  },
  {
    key: "announcements",
    label: "Announcements",
    path: "/admin/announcements",
    requiredActionKey: "announcement.read",
    sortOrder: 180,
    isActive: true,
  },
  {
    key: "documents",
    label: "Documents",
    path: "/admin/documents",
    requiredActionKey: "document.read",
    sortOrder: 190,
    isActive: true,
  },
];

async function main() {
  const legalEntity = await prisma.legalEntity.upsert({
    where: { code: "SAMPLE_LEGAL_ENTITY" },
    update: {},
    create: {
      code: "SAMPLE_LEGAL_ENTITY",
      name: "Sample Company",
    },
  });

  const businessUnit = await prisma.businessUnit.upsert({
    where: { legalEntityId_code: { legalEntityId: legalEntity.id, code: "SAMPLE_BU" } },
    update: {},
    create: {
      legalEntityId: legalEntity.id,
      code: "SAMPLE_BU",
      name: "Sample Business Unit",
    },
  });

  const existingRootDepartment = await prisma.department.findFirst({
    where: {
      businessUnitId: businessUnit.id,
      code: "ROOT_DEPT",
      parentId: null,
    },
  });
  const rootDepartment =
    existingRootDepartment ??
    (await prisma.department.create({
      data: {
        businessUnitId: businessUnit.id,
        code: "ROOT_DEPT",
        name: "Default Department",
        hierarchyPath: "/ROOT_DEPT",
      },
    }));

  const site = await prisma.site.upsert({
    where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEFAULT_SITE" } },
    update: {},
    create: {
      code: "DEFAULT_SITE",
      name: "Default Site",
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
    },
  });

  const dashboardAction = actionDefs.find((action) => action.key === "dashboard.view");
  for (const action of actionDefs) {
    await prisma.action.upsert({
      where: { key: action.key },
      update: {
        name: action.name,
        namespace: action.namespace,
      },
      create: {
        key: action.key,
        name: action.name,
        namespace: action.namespace,
      },
    });
  }

  const actions = await prisma.action.findMany();
  const actionSeedMap = new Map(actionDefs.map((action) => [action.key, action]));

  for (const menu of menuDefs) {
    await prisma.menu.upsert({
      where: { key: menu.key },
      update: {
        label: menu.label,
        path: menu.path,
        requiredActionKey: menu.requiredActionKey,
        sortOrder: menu.sortOrder,
        isActive: menu.isActive,
      },
      create: {
        key: menu.key,
        label: menu.label,
        path: menu.path,
        requiredActionKey: menu.requiredActionKey,
        sortOrder: menu.sortOrder,
        isActive: menu.isActive,
      },
    });
  }

  const roleFounder = await prisma.role.upsert({
    where: { code: "platform_admin" },
    update: {
      name: "Platform Admin",
      isSystem: true,
    },
    create: {
      code: "platform_admin",
      name: "Platform Admin",
      description: "System platform admin role with global capabilities.",
      isSystem: true,
    },
  });

  const roleManager = await prisma.role.upsert({
    where: { code: "business_manager" },
    update: {
      name: "Business Manager",
      isSystem: true,
    },
    create: {
      code: "business_manager",
      name: "Business Manager",
      description: "Can manage users, memberships, and permissions in own business scope.",
      isSystem: true,
    },
  });

  const roleStaff = await prisma.role.upsert({
    where: { code: "employee" },
    update: {
      name: "Employee",
      isSystem: false,
    },
    create: {
      code: "employee",
      name: "Employee",
      description: "Basic operator role for operational staff.",
      isSystem: false,
    },
  });

  for (const action of actions) {
    await prisma.rolePermission.upsert({
      where: { roleId_actionKey: { roleId: roleFounder.id, actionKey: action.key } },
      update: { isAllowed: true, scope: "ALL" },
      create: {
        roleId: roleFounder.id,
        actionKey: action.key,
        scope: "ALL",
        isAllowed: true,
      },
    });
  }

  const managerAllowed = new Set([
    "dashboard.view",
    "legal_entity.read",
    "legal_entity.create",
    "business_unit.read",
    "business_unit.create",
    "department.read",
    "department.create",
    "site.read",
    "site.create",
    "user.read",
    "membership.read",
    "membership.create",
    "membership.delete",
    "role.read",
    "menu.read",
    "menu.create",
    "access_grant.read",
    "access_grant.create",
    "access_grant.delete",
    "delegation.manage",
    "customer.read",
    "customer.create",
    "customer.delete",
    "product.read",
    "product.create",
    "product.delete",
    "sku.create",
    "inventory.read",
    "inventory.adjust",
    "order.read",
    "order.create",
    "order.update",
    "order.delete",
    "order.status.update",
    "shipment.read",
    "shipment.create",
    "shipment.track.update",
    "expense.read",
    "expense.create",
    "expense.delete",
    "attendance.read",
    "attendance.create",
    "attendance.delete",
    "attendance.approve",
    "leave_request.read",
    "leave_request.create",
    "leave_request.approve",
    "announcement.read",
    "announcement.create",
    "announcement.delete",
    "document.read",
    "document.create",
    "document.delete",
    "approval.submit",
    "approval.review",
  ]);

  for (const action of actions) {
    const allow = managerAllowed.has(action.key);
    await prisma.rolePermission.upsert({
      where: { roleId_actionKey: { roleId: roleManager.id, actionKey: action.key } },
      update: {
        isAllowed: allow,
        scope: allow ? actionSeedMap.get(action.key)?.scope ?? "BUSINESS_UNIT" : "SELF",
      },
      create: {
        roleId: roleManager.id,
        actionKey: action.key,
        scope: allow ? actionSeedMap.get(action.key)?.scope ?? "BUSINESS_UNIT" : "SELF",
        isAllowed: allow,
      },
    });
  }

  for (const action of actions) {
    await prisma.rolePermission.upsert({
      where: { roleId_actionKey: { roleId: roleStaff.id, actionKey: action.key } },
      update: { isAllowed: false, scope: "SELF" },
      create: {
        roleId: roleStaff.id,
        actionKey: action.key,
        scope: "SELF",
        isAllowed: false,
      },
    });
  }

  const menuList = await prisma.menu.findMany();
  for (const menu of menuList) {
    await prisma.menuPermission.upsert({
      where: { menuId_roleId: { menuId: menu.id, roleId: roleFounder.id } },
      update: { isEnabled: true },
      create: {
        menuId: menu.id,
        roleId: roleFounder.id,
        isEnabled: true,
      },
    });
    await prisma.menuPermission.upsert({
      where: { menuId_roleId: { menuId: menu.id, roleId: roleManager.id } },
      update: { isEnabled: menu.requiredActionKey !== "menu.create" },
      create: {
        menuId: menu.id,
        roleId: roleManager.id,
        isEnabled: menu.requiredActionKey !== "menu.create",
      },
    });
    await prisma.menuPermission.upsert({
      where: { menuId_roleId: { menuId: menu.id, roleId: roleStaff.id } },
      update: { isEnabled: menu.requiredActionKey === "dashboard.view" },
      create: {
        menuId: menu.id,
        roleId: roleStaff.id,
        isEnabled: menu.requiredActionKey === "dashboard.view",
      },
    });
  }

  const founderPassword = await bcrypt.hash(process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026", 10);
  const founderUser = await prisma.user.upsert({
    where: { username: "founder" },
    update: { fullName: "Foundation Admin" },
    create: {
      username: "founder",
      email: "founder@local.erp",
      fullName: "Foundation Admin",
      passwordHash: founderPassword,
      isActive: true,
    },
  });

  const existingFounderMembership = await prisma.membership.findFirst({
    where: {
      userId: founderUser.id,
      businessUnitId: businessUnit.id,
      roleId: roleFounder.id,
      isPrimary: true,
    },
  });
  if (!existingFounderMembership) {
    await prisma.membership.create({
      data: {
        userId: founderUser.id,
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        departmentId: rootDepartment.id,
        siteId: site.id,
        roleId: roleFounder.id,
        isPrimary: true,
        isActive: true,
        scope: "ALL",
        startedAt: new Date(),
      },
    });
  }

  for (const action of actions) {
    await prisma.delegationRule.upsert({
      where: { roleId_actionKey: { roleId: roleFounder.id, actionKey: action.key } },
      update: { canTransfer: true, maxScope: "ALL" },
      create: {
        roleId: roleFounder.id,
        actionKey: action.key,
        canTransfer: true,
        maxScope: "ALL",
      },
    });
    if (managerAllowed.has(action.key)) {
      await prisma.delegationRule.upsert({
        where: { roleId_actionKey: { roleId: roleManager.id, actionKey: action.key } },
        update: { canTransfer: true, maxScope: actionSeedMap.get(action.key)?.scope ?? "DEPARTMENT" },
        create: {
          roleId: roleManager.id,
          actionKey: action.key,
          canTransfer: true,
          maxScope: actionSeedMap.get(action.key)?.scope ?? "DEPARTMENT",
        },
      });
    }
  }

  if (dashboardAction) {
    await prisma.menu.upsert({
      where: { key: "dashboard" },
      update: { requiredActionKey: dashboardAction.key },
      create: {
        key: "dashboard",
        label: "Dashboard",
        path: "/admin",
        requiredActionKey: dashboardAction.key,
        sortOrder: 1,
        isActive: true,
      },
    });
  }

  await prisma.legalEntity.upsert({
    where: { code: "FACEBOOK_COD" },
    update: {},
    create: {
      code: "FACEBOOK_COD",
      name: "Facebook COD",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.info("Seed completed.");
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
