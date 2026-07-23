import Link from "next/link";

type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon?: string | null;
};

type MembershipOption = {
  id: string;
  label: string;
};

type AppShellProps = {
  menuItems: MenuItem[];
  brand?: string;
  userName?: string;
  memberships?: MembershipOption[];
  activeMembershipId?: string | null;
  currentPath?: string;
  children: React.ReactNode;
};

function renderMenuItem(item: MenuItem, currentPath?: string) {
  const active = currentPath === item.path || currentPath?.startsWith(`${item.path}/`);
  return (
    <li key={item.id}>
      <Link
        href={item.path}
        className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-sky-50 font-semibold text-sky-700" : "text-gray-600 hover:bg-gray-100"}`}
      >
        {item.label}
      </Link>
    </li>
  );
}

export default function AppShell({
  menuItems,
  brand = "ERP V2",
  userName,
  memberships = [],
  activeMembershipId,
  currentPath,
  children,
}: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl gap-6 px-4 py-6">
      <aside className="w-64 shrink-0">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-lg font-semibold text-gray-900">{brand}</p>
          <p className="mt-1 text-xs text-gray-500">Dynamic Menu</p>
          <nav className="mt-4">
            <ul className="flex flex-col gap-1">
              <li>
                <Link href="/admin" className="block rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
                  Home
                </Link>
              </li>
              {menuItems.map((item) => renderMenuItem(item, currentPath))}
            </ul>
          </nav>
          <p className="mt-6 border-t border-gray-200 pt-4 text-xs text-gray-400">Current user: {userName || "Unknown"}</p>
          {memberships.length > 1 ? (
            <form action="/api/context/active-membership" method="post" className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-4">
              <label className="text-xs font-medium text-gray-700">Current business context</label>
              <select
                name="membershipId"
                defaultValue={activeMembershipId ?? ""}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              >
                {memberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded border border-gray-300 px-2 py-1 text-xs">
                Switch context
              </button>
            </form>
          ) : null}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="mt-2 w-full rounded border border-gray-300 py-2 text-sm hover:bg-gray-50">
              Logout
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 rounded-lg border border-gray-200 bg-white p-6">{children}</main>
    </div>
  );
}
