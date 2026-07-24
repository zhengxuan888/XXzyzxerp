"use client";

import {
  Bell,
  Building2,
  ChevronDown,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { zh } from "@/lib/i18n";

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

function isActive(pathname: string, path: string) {
  if (path === "/admin") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function AppShell({
  menuItems,
  brand = "择优臻选 ERP",
  userName,
  memberships = [],
  activeMembershipId,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navigation = [
    { id: "dashboard", label: "工作台", path: "/admin" },
    ...menuItems.filter((item) => item.path !== "/admin"),
  ];
  const activeMembership = memberships.find((item) => item.id === activeMembershipId);

  return (
    <div className="min-h-screen bg-[var(--surface-muted)] text-slate-900">
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="flex h-full items-center gap-3 px-4 lg:px-6">
          <button
            type="button"
            aria-label="打开导航"
            onClick={() => setMobileOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={20} />
          </button>

          <Link href="/admin" className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 text-sm font-black tracking-tight text-white shadow-sm shadow-violet-200">
              ZC
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm font-bold tracking-tight text-slate-950">{brand}</strong>
              <span className="block truncate text-[11px] text-slate-500">择优臻选 · 业务运营系统</span>
            </span>
          </Link>

          <div className="ml-auto hidden max-w-md flex-1 items-center lg:flex">
            <div className="ml-8 flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-400">
              <Search size={16} />
              <span className="text-xs">搜索订单、客户、物流单号</span>
              <kbd className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">Ctrl K</kbd>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 lg:ml-4">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 xl:flex">
              <Building2 size={15} className="text-violet-600" />
              <span className="max-w-64 truncate text-xs font-medium text-slate-700">
                {activeMembership?.label ?? "当前业务板块"}
              </span>
            </div>
            <button type="button" aria-label="通知" className="relative grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
              <Bell size={18} />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500" />
            </button>
            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <span className="grid size-9 place-items-center rounded-xl bg-slate-900 text-white"><CircleUserRound size={18} /></span>
              <span className="max-w-44 truncate text-xs font-semibold text-slate-700">{userName || "当前用户"}</span>
            </div>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <button
          aria-label="关闭导航遮罩"
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed bottom-0 left-0 top-16 z-50 border-r border-slate-200 bg-white transition-all duration-200 ${
          collapsed ? "w-[76px]" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-3 py-3">
            {!collapsed && <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">主导航</span>}
            <button
              type="button"
              aria-label={collapsed ? "展开导航" : "收起导航"}
              onClick={() => setCollapsed((value) => !value)}
              className="hidden size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:grid"
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <button type="button" aria-label="关闭导航" onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-lg text-slate-500 lg:hidden">
              <X size={19} />
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="主导航">
            <ul className="space-y-1">
              {navigation.map((item) => {
                const active = isActive(pathname, item.path);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.path}
                      title={collapsed ? zh(item.label) : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                        active
                          ? "bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-sm shadow-violet-200"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      <span className="grid size-5 shrink-0 place-items-center">
                        {item.path === "/admin" ? <LayoutDashboard size={18} /> : <span className={`size-1.5 rounded-full ${active ? "bg-white" : "bg-slate-300 group-hover:bg-violet-500"}`} />}
                      </span>
                      {!collapsed && <span className="truncate">{zh(item.label)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-slate-200 p-3">
            {!collapsed && memberships.length > 1 && (
              <form action="/api/context/active-membership" method="post" className="mb-2 rounded-xl bg-slate-50 p-2">
                <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <ShieldCheck size={13} /> 当前业务上下文
                </label>
                <div className="relative">
                  <select
                    name="membershipId"
                    defaultValue={activeMembershipId ?? ""}
                    onChange={(event) => event.currentTarget.form?.requestSubmit()}
                    className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-2 pr-7 text-xs text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  >
                    {memberships.map((membership) => (
                      <option key={membership.id} value={membership.id}>{membership.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2 top-2.5 text-slate-400" />
                </div>
              </form>
            )}
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title={collapsed ? "退出登录" : undefined}
                className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              >
                <LogOut size={17} />
                {!collapsed && "退出登录"}
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className={`min-h-screen pt-16 transition-all duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <div className="mx-auto w-full max-w-[1680px] p-4 md:p-6 xl:p-8">{children}</div>
      </main>
    </div>
  );
}
