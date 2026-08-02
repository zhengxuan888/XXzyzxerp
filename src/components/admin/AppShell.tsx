"use client";

import {
  Bell,
  ChartNoAxesCombined,
  Building2,
  ChevronRight,
  ChevronDown,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Target,
  Truck,
  MessagesSquare,
  Package,
  WalletCards,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { zh } from "@/lib/i18n";

type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon?: string | null;
  children?: MenuItem[];
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

const navIcons = {
  ShoppingCart,
  Truck,
  MessagesSquare,
  Package,
  WalletCards,
  UsersRound,
  ShieldCheck,
  Settings2,
  Target,
  ChartNoAxesCombined,
} as const;

function MenuIcon({ name, active }: { name?: string | null; active?: boolean }) {
  const Icon = name && name in navIcons ? navIcons[name as keyof typeof navIcons] : null;
  if (Icon) return <Icon size={18} />;
  return <span className={`size-1.5 rounded-full ${active ? "bg-white" : "bg-slate-300 group-hover:bg-violet-500"}`} />;
}

type SearchableMenu = MenuItem & { groupLabel?: string };

function flattenNavigation(items: MenuItem[]): SearchableMenu[] {
  return items.flatMap((item) =>
    item.children?.length
      ? item.children.map((child) => ({ ...child, groupLabel: item.label }))
      : [item],
  );
}

function menuLabel(item: Pick<MenuItem, "label" | "path">) {
  return item.path === "/admin" ? "工作台" : zh(item.label);
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
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const navigation = useMemo(() => [
    { id: "dashboard", label: "工作台", path: "/admin" },
    ...menuItems.filter((item) => item.path !== "/admin"),
  ], [menuItems]);
  const activeMembership = memberships.find((item) => item.id === activeMembershipId);
  const storageSuffix = activeMembershipId ?? "default";
  const searchableMenus = useMemo(() => flattenNavigation(navigation), [navigation]);
  const searchResults = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return searchableMenus.slice(0, 8);
    return searchableMenus.filter((item) =>
      `${menuLabel(item)} ${item.groupLabel ? zh(item.groupLabel) : ""}`.toLocaleLowerCase("zh-CN").includes(keyword),
    ).slice(0, 10);
  }, [searchKeyword, searchableMenus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setCollapsed(window.localStorage.getItem(`erp-nav-collapsed:${storageSuffix}`) === "1");
        const savedGroups = window.localStorage.getItem(`erp-nav-groups:${storageSuffix}`);
        if (savedGroups) setOpenGroups(JSON.parse(savedGroups) as Record<string, boolean>);
      } catch {
        // 浏览器禁用本地存储时继续使用默认导航状态。
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageSuffix]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [searchOpen]);

  function openSearch() {
    setSearchKeyword("");
    setSearchOpen(true);
  }

  function updateCollapsed(value: boolean) {
    setCollapsed(value);
    try {
      window.localStorage.setItem(`erp-nav-collapsed:${storageSuffix}`, value ? "1" : "0");
    } catch {
      // 存储失败不影响导航。
    }
  }

  function updateGroup(groupId: string, expanded: boolean) {
    setOpenGroups((current) => {
      const next = { ...current, [groupId]: expanded };
      try {
        window.localStorage.setItem(`erp-nav-groups:${storageSuffix}`, JSON.stringify(next));
      } catch {
        // 存储失败不影响导航。
      }
      return next;
    });
  }

  function goToMenu(item: SearchableMenu) {
    setSearchOpen(false);
    router.push(item.path);
  }

  return (
    <div className="min-h-screen bg-[var(--surface-muted)] text-slate-900">
      <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-slate-200 bg-white">
        <div className="flex h-full items-center gap-3 px-3 lg:px-5">
          <button
            type="button"
            aria-label="打开导航"
            onClick={() => setMobileOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={20} />
          </button>

          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-teal-600 text-xs font-black tracking-tight text-white">
              ZC
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm font-bold tracking-tight text-slate-950">{brand}</strong>
              <span className="block truncate text-[10px] text-slate-400">择优臻选 · 业务运营系统</span>
            </span>
          </Link>

          <div className="ml-auto hidden max-w-md flex-1 items-center lg:flex">
            <button
              type="button"
              onClick={openSearch}
              className="ml-8 flex h-9 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-slate-400 transition hover:border-teal-300 hover:bg-white hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <Search size={16} />
              <span className="text-xs">快速查找功能</span>
              <kbd className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">Ctrl K</kbd>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1 lg:ml-4">
            <div className="hidden items-center gap-2 border-l border-slate-200 px-3 py-1.5 xl:flex">
              <Building2 size={15} className="text-violet-600" />
              <span className="max-w-64 truncate text-xs font-medium text-slate-700">
                {activeMembership?.label ?? "当前业务板块"}
              </span>
            </div>
            <button
              type="button"
              aria-label="快速查找功能"
              onClick={openSearch}
              className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <Search size={18} />
            </button>
            <button type="button" aria-label="通知" className="relative grid size-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
              <Bell size={18} />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500" />
            </button>
            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-slate-600"><CircleUserRound size={17} /></span>
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

      {searchOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="快速查找功能"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl shadow-slate-950/20"
          >
            <label className="flex h-14 items-center gap-3 border-b border-slate-200 px-4">
              <Search size={19} className="text-violet-600" />
              <input
                ref={searchInputRef}
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="输入功能名称，例如：核单、物流、员工"
                aria-label="搜索功能"
              />
              <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-400">ESC</kbd>
            </label>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {searchResults.length ? (
                <ul className="space-y-1">
                  {searchResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => goToMenu(item)}
                        className="group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
                      >
                        <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-violet-100 group-hover:text-violet-700">
                          {item.path === "/admin" ? <LayoutDashboard size={16} /> : <Search size={15} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm text-slate-800">{menuLabel(item)}</strong>
                          <span className="block truncate text-xs text-slate-400">{item.groupLabel ? `${zh(item.groupLabel)} · ` : ""}{item.path}</span>
                        </span>
                        <span className="text-xs text-slate-300">打开</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-700">没有找到匹配功能</p>
                  <p className="mt-1 text-xs text-slate-400">只会显示当前账号拥有权限的菜单。</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <aside
        className={`fixed bottom-0 left-0 top-14 z-50 border-r border-slate-200 bg-white transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-3 py-3">
            {!collapsed && <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">主导航</span>}
            <button
              type="button"
              aria-label={collapsed ? "展开导航" : "收起导航"}
              onClick={() => updateCollapsed(!collapsed)}
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
                const hasChildren = Boolean(item.children?.length);
                const childActive = item.children?.some((child) => isActive(pathname, child.path)) ?? false;
                const expanded = openGroups[item.id] ?? childActive;
                if (hasChildren) {
                  return (
                    <li key={item.id} className="pt-1">
                      <button
                        type="button"
                        title={collapsed ? menuLabel(item) : undefined}
                        aria-expanded={expanded}
                        onClick={() => {
                          if (collapsed) {
                            updateCollapsed(false);
                            updateGroup(item.id, true);
                          } else {
                            updateGroup(item.id, !expanded);
                          }
                        }}
                        className={`group flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                          childActive ? "bg-violet-50 text-violet-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                      >
                        <span className="grid size-5 shrink-0 place-items-center"><MenuIcon name={item.icon} /></span>
                        {!collapsed && (
                          <>
                            <span className="min-w-0 flex-1 truncate text-left">{menuLabel(item)}</span>
                            <ChevronRight size={15} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
                          </>
                        )}
                      </button>
                      {!collapsed && expanded && (
                        <ul className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                          {item.children!.map((child) => {
                            const activeChild = isActive(pathname, child.path);
                            return (
                              <li key={child.id}>
                                <Link
                                  href={child.path}
                                  onClick={() => setMobileOpen(false)}
                                  className={`flex min-h-9 items-center rounded-lg px-3 text-sm transition ${
                                    activeChild
                                      ? "bg-teal-50 font-semibold text-teal-800"
                                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                                  }`}
                                >
                                  <span className="truncate">{zh(child.label)}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }
                return (
                  <li key={item.id}>
                    <Link
                      href={item.path}
                      title={collapsed ? menuLabel(item) : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                        active
                          ? "bg-teal-50 font-semibold text-teal-800"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      <span className="grid size-5 shrink-0 place-items-center">
                        {item.path === "/admin" ? <LayoutDashboard size={18} /> : <MenuIcon name={item.icon} active={active} />}
                      </span>
                      {!collapsed && <span className="truncate">{menuLabel(item)}</span>}
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

      <main className={`min-h-screen min-w-0 overflow-x-hidden pt-14 transition-all duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-60"}`}>
        <div className="mx-auto min-w-0 w-full max-w-[1720px] p-3 md:p-5 xl:p-6">{children}</div>
      </main>
    </div>
  );
}
