import Link from "next/link";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPermission } from "@/lib/permission";
import { redirect } from "next/navigation";

const cards = [
  { label: "Legal Entities", href: "/admin/organizations", actionKey: "legal_entity.read" },
  { label: "Business Units", href: "/admin/business-units", actionKey: "business_unit.read" },
  { label: "Departments", href: "/admin/departments", actionKey: "department.read" },
  { label: "Sites", href: "/admin/sites", actionKey: "site.read" },
  { label: "Users", href: "/admin/users", actionKey: "user.read" },
  { label: "Memberships", href: "/admin/memberships", actionKey: "membership.read" },
  { label: "Roles", href: "/admin/roles", actionKey: "role.read" },
  { label: "Menus", href: "/admin/menus", actionKey: "menu.read" },
  { label: "Access Grants", href: "/admin/access-grants", actionKey: "access_grant.read" },
  { label: "Customers", href: "/admin/customers", actionKey: "customer.read" },
  { label: "Products", href: "/admin/products", actionKey: "product.read" },
  { label: "Orders", href: "/admin/orders", actionKey: "order.read" },
  { label: "Shipments", href: "/admin/shipments", actionKey: "shipment.read" },
  { label: "Expenses", href: "/admin/expenses", actionKey: "expense.read" },
  { label: "Approvals", href: "/admin/approvals", actionKey: "approval.submit" },
  { label: "Attendance", href: "/admin/attendance", actionKey: "attendance.read" },
  { label: "Leave Requests", href: "/admin/leave-requests", actionKey: "leave_request.read" },
  { label: "Announcements", href: "/admin/announcements", actionKey: "announcement.read" },
  { label: "Documents", href: "/admin/documents", actionKey: "document.read" },
];

export default async function AdminHomePage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) {
    redirect("/login");
  }
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) {
    redirect("/login");
  }

  const legalEntityCount = await prisma.legalEntity.count();
  const unitCount = await prisma.businessUnit.count();
  const deptCount = await prisma.department.count();
  const userCount = await prisma.user.count({ where: { isActive: true } });
  const grantCount = await prisma.accessGrant.count({ where: { granteeMembershipId: membership.id, isActive: true } });

  const entries = (
    await Promise.all(
      cards.map(async (item) => {
        const decision = await checkPermission({
          userId: session.userId,
          membershipId: membership.id,
          actionKey: item.actionKey,
          targetBusinessUnitId: membership.businessUnitId,
        });
        return decision.allowed ? item : null;
      }),
    )
  ).filter((item): item is (typeof cards)[number] => item !== null);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Welcome to ERP V2. Current membership: {membership.businessUnit?.name ?? "Current business unit"}.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Legal entities</p>
          <p className="text-2xl font-bold">{legalEntityCount}</p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Business units</p>
          <p className="text-2xl font-bold">{unitCount}</p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Departments</p>
          <p className="text-2xl font-bold">{deptCount}</p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Active users</p>
          <p className="text-2xl font-bold">{userCount}</p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Active grants</p>
          <p className="text-2xl font-bold">{grantCount}</p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {entries.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded border border-gray-200 p-4 text-sm font-medium hover:bg-gray-50"
          >
            {item.label}
          </Link>
        ))}
      </section>
    </div>
  );
}
