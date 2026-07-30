"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, MessageSquareText, RefreshCw, Search, Tag, UserRoundCheck } from "lucide-react";
import AttachmentPanel from "@/components/admin/AttachmentPanel";

type InboxData = {
  conversations: Array<{
    id: string;
    subject: string | null;
    preview: string | null;
    status: string;
    unreadCount: number;
    lastMessageAt: string | null;
    departmentId: string | null;
    channelConnection: { providerKey: string; displayName: string };
    contactIdentity: { displayName: string | null; normalizedAddress: string | null };
    messages: Array<{ id: string; direction: string; contentText: string | null; occurredAt: string }>;
    assignments: Array<{ assigneeMembershipId: string; assignee: { user: { fullName: string } } }>;
    tags: Array<{ tag: { id: string; name: string; color: string } }>;
    customerLinks: Array<{ customer: { id: string; code: string; name: string }; linkType: string }>;
  }>;
  memberships: Array<{ id: string; user: { fullName: string }; department: { name: string } | null }>;
  tags: Array<{ id: string; name: string; color: string }>;
  customers: Array<{ id: string; code: string; name: string }>;
  connections: Array<{ id: string; providerKey: string; displayName: string; lastSyncAt: string | null }>;
  meta: { page: number; pageSize: number; total: number; pageCount: number };
};

const statusLabel: Record<string, string> = { OPEN: "待处理", PENDING: "跟进中", RESOLVED: "已解决", CLOSED: "已关闭" };

export default function UnifiedInbox({ canUploadAttachments, canDeleteAttachments }: { canUploadAttachments: boolean; canDeleteAttachments: boolean }) {
  const [data, setData] = useState<InboxData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const response = await fetch("/api/mvp/inbox", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "收件箱加载失败");
    setData(payload.data);
    setSelectedId((current) => current ?? payload.data.conversations[0]?.id ?? null);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/mvp/inbox", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "收件箱加载失败");
        if (active) {
          setData(payload.data);
          setSelectedId(payload.data.conversations[0]?.id ?? null);
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "收件箱加载失败");
      });
    return () => {
      active = false;
    };
  }, []);

  async function act(body: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/mvp/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "操作失败");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const conversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.conversations ?? []).filter((item) =>
      !normalized || [item.subject, item.preview, item.contactIdentity.displayName].some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [data, query]);
  const selected = data?.conversations.find((item) => item.id === selectedId) ?? conversations[0];
  const demo = data?.connections.find((connection) => connection.providerKey === "DEMO");

  return (
    <div className="space-y-5" aria-labelledby="inbox-title">
      <section className="rounded-3xl bg-gradient-to-r from-slate-950 via-violet-950 to-slate-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              <Inbox size={16} /> Local unified inbox
            </div>
            <h1 id="inbox-title" className="text-2xl font-black tracking-tight">统一收件箱</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">集中处理不同渠道的客户咨询，统一查看会话、消息、分派和客户关联。</p>
          </div>
          <button
            type="button"
            disabled={!demo || busy}
            onClick={() => demo && act({ action: "sync_demo", connectionId: demo.id })}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            <RefreshCw size={17} className={busy ? "animate-spin" : ""} /> 同步消息
          </button>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="grid min-h-[640px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_minmax(0,1fr)_280px]">
        <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-4">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
              <Search size={16} className="text-slate-400" />
              <span className="sr-only">搜索会话</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索客户或消息" className="w-full bg-transparent text-sm outline-none" />
            </label>
          </div>
          <div className="max-h-[580px] overflow-y-auto">
            {!data && <div className="p-6 text-sm text-slate-500">正在加载会话…</div>}
            {data && conversations.length === 0 && <div className="p-6 text-sm text-slate-500">没有符合条件的会话。</div>}
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full border-b border-slate-100 p-4 text-left transition ${selected?.id === conversation.id ? "bg-violet-50" : "hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="truncate text-sm text-slate-900">{conversation.contactIdentity.displayName ?? "未知联系人"}</strong>
                  <span className="text-[11px] text-slate-400">{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{conversation.channelConnection.displayName}</span>
                  <span className="text-xs text-violet-700">{statusLabel[conversation.status] ?? conversation.status}</span>
                  {conversation.unreadCount > 0 && <span className="ml-auto grid size-5 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white">{conversation.unreadCount}</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{conversation.preview ?? "暂无消息摘要"}</p>
              </button>
            ))}
          </div>
        </aside>

        <article className="flex min-w-0 flex-col bg-slate-50/60">
          {!selected ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-slate-500"><div><MessageSquareText className="mx-auto mb-3" /><p>选择左侧会话开始处理。</p></div></div>
          ) : (
            <>
              <header className="border-b border-slate-200 bg-white p-4">
                <h2 className="font-bold text-slate-950">{selected.subject ?? selected.contactIdentity.displayName ?? "客户会话"}</h2>
                <p className="mt-1 text-xs text-slate-500">{selected.channelConnection.displayName} · {selected.messages.length} 条消息</p>
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {selected.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${message.direction === "OUTBOUND" ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
                      <p className="whitespace-pre-wrap leading-6">{message.contentText ?? "非文本消息"}</p>
                      <time className={`mt-2 block text-[10px] ${message.direction === "OUTBOUND" ? "text-violet-200" : "text-slate-400"}`}>{new Date(message.occurredAt).toLocaleString("zh-CN")}</time>
                    </div>
                  </div>
                ))}
              </div>
              <footer className="border-t border-slate-200 bg-white p-4 text-xs text-slate-500">本批仅支持采集与内部处理；真实渠道回复能力尚未启用。</footer>
            </>
          )}
        </article>

        <aside className="border-t border-slate-200 p-4 lg:border-l lg:border-t-0">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">处理面板</h3>
          {selected && (
            <div className="mt-4 space-y-5">
              <Control label="处理状态" icon={<MessageSquareText size={15} />}>
                <select aria-label="处理状态" disabled={busy} value={selected.status} onChange={(event) => act({ action: "status", conversationId: selected.id, status: event.target.value })} className="control">
                  {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Control>
              <Control label="分派员工" icon={<UserRoundCheck size={15} />}>
                <select aria-label="分派员工" disabled={busy} value={selected.assignments[0]?.assigneeMembershipId ?? ""} onChange={(event) => event.target.value && act({ action: "assign", conversationId: selected.id, membershipId: event.target.value })} className="control">
                  <option value="">未分派</option>
                  {data?.memberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.user.fullName} · {membership.department?.name ?? "无部门"}</option>)}
                </select>
              </Control>
              <Control label="添加标签" icon={<Tag size={15} />}>
                <select aria-label="添加标签" disabled={busy} defaultValue="" onChange={(event) => event.target.value && act({ action: "tag", conversationId: selected.id, tagId: event.target.value })} className="control">
                  <option value="">选择标签</option>
                  {data?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
                <div className="mt-2 flex flex-wrap gap-1">{selected.tags.map(({ tag }) => <span key={tag.id} className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700">{tag.name}</span>)}</div>
              </Control>
              <Control label="关联客户/线索" icon={<UserRoundCheck size={15} />}>
                <select aria-label="关联客户/线索" disabled={busy} defaultValue="" onChange={(event) => event.target.value && act({ action: "link_customer", conversationId: selected.id, customerId: event.target.value, linkType: "CUSTOMER" })} className="control">
                  <option value="">选择客户</option>
                  {data?.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>)}
                </select>
                {selected.customerLinks.map((link) => <p key={link.customer.id} className="mt-2 text-xs font-medium text-emerald-700">已关联：{link.customer.name}</p>)}
              </Control>
            </div>
          )}
        </aside>
      </section>
      {selected && (
        <AttachmentPanel
          targetType="CONVERSATION"
          targetId={selected.id}
          canUpload={canUploadAttachments}
          canDelete={canDeleteAttachments}
          title="会话图片与附件"
        />
      )}
      <style jsx>{`.control{min-height:44px;width:100%;border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:0 10px;font-size:13px;outline:none}.control:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.12)}`}</style>
    </div>
  );
}

function Control({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section><h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">{icon}{label}</h4>{children}</section>;
}
