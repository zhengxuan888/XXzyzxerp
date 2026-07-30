"use client";

import {
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  CreditCard,
  FilePlus2,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type FinanceWorkbenchCapabilities = {
  canReadCounterparties: boolean;
  canManageCounterparties: boolean;
  canCreateStatements: boolean;
  canUpdateStatements: boolean;
  canReadReconciliation: boolean;
  canMatchReconciliation: boolean;
  canResolveReconciliation: boolean;
  canApproveStatements: boolean;
  canPostStatements: boolean;
  canVoidStatements: boolean;
  canReadPayments: boolean;
  canCreatePayments: boolean;
  canApprovePayments: boolean;
  canPostPayments: boolean;
  canVoidPayments: boolean;
  canAllocatePayments: boolean;
};

type PageMeta = { page: number; pageSize: number; total: number; pageCount: number };
type ApiEnvelope<T> = { ok: boolean; data?: T; meta?: PageMeta; error?: { code?: string; message?: string } };

type Counterparty = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  departmentId: string | null;
};

type Reconciliation = {
  id: string;
  orderId: string | null;
  shipmentId: string | null;
  amountCents: string;
  status: string;
  method: string;
  reason: string | null;
};

type StatementLine = {
  id: string;
  lineNo: number;
  orderId: string | null;
  shipmentId: string | null;
  sourceReference: string | null;
  description: string | null;
  currency: string;
  currencyScale: number;
  amountCents: string;
  amountLabel: string;
  reconciliationStatus: string;
  reconciliations: Reconciliation[];
};

type Statement = {
  id: string;
  statementNo: string;
  type: string;
  status: string;
  currency: string;
  currencyScale: number;
  totalAmountCents: string;
  totalAmountLabel: string;
  counterpartyId: string;
  counterparty: Pick<Counterparty, "id" | "code" | "name" | "type"> | null;
  note: string | null;
  exceptionReason: string | null;
  lineCount: number;
  allocationCount: number;
  createdAt: string;
  lines?: StatementLine[];
  lineDetailsAvailable?: boolean;
};

type Payment = {
  id: string;
  paymentNo: string;
  direction: string;
  status: string;
  currency: string;
  currencyScale: number;
  amountCents: string;
  amountLabel: string;
  counterpartyId: string;
  counterparty: Pick<Counterparty, "id" | "code" | "name" | "type"> | null;
  note: string | null;
  createdAt: string;
};

const emptyMeta: PageMeta = { page: 1, pageSize: 20, total: 0, pageCount: 1 };
const statementTypes = ["COD_REMITTANCE", "SHIPPING_FEE", "WAREHOUSE_FEE", "RETURN_FEE", "OTHER"];
const statementStatuses = ["DRAFT", "RECONCILING", "EXCEPTION", "APPROVED", "POSTED", "VOIDED"];

const statementTypeLabel: Record<string, string> = {
  COD_REMITTANCE: "COD 回款",
  SHIPPING_FEE: "运输费用",
  WAREHOUSE_FEE: "仓储费用",
  RETURN_FEE: "退件费用",
  OTHER: "其他",
};

const statementStatusLabel: Record<string, string> = {
  DRAFT: "草稿",
  RECONCILING: "对账中",
  EXCEPTION: "异常待处理",
  APPROVED: "已审批",
  POSTED: "已过账",
  VOIDED: "已作废",
};

const paymentStatusLabel: Record<string, string> = {
  DRAFT: "草稿",
  APPROVED: "已审批",
  POSTED: "已过账",
  VOIDED: "已作废",
};

const reconciliationStatusLabel: Record<string, string> = {
  UNMATCHED: "未匹配",
  SUGGESTED: "待确认",
  MATCHED: "已匹配",
  AMOUNT_MISMATCH: "金额差异",
  IGNORED: "已忽略",
};

function statusClass(status: string) {
  if (["APPROVED", "POSTED", "MATCHED", "CONFIRMED"].includes(status)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["EXCEPTION", "VOIDED", "REJECTED", "AMOUNT_MISMATCH"].includes(status)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (["RECONCILING", "SUGGESTED"].includes(status)) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function moneyFromDecimal(input: string, scaleInput: string) {
  const scale = Number.parseInt(scaleInput, 10);
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 6) throw new Error("货币小数位必须在 0 到 6 之间。");
  const value = input.trim();
  const match = value.match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new Error("金额只能填写非负十进制数字，不能使用科学计数法。");
  const fraction = match[2] ?? "";
  if (fraction.length > scale) throw new Error(`当前币种最多保留 ${scale} 位小数。`);
  const minor = `${match[1]}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "");
  if (!minor || /^0+$/.test(minor)) throw new Error("金额必须大于 0。");
  return minor;
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: PageMeta }> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new Error(payload?.error?.message ?? "操作失败，请稍后重试。");
  }
  return { data: payload.data, meta: payload.meta };
}

function Pager({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  return (
    <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>共 {meta.total} 条，第 {meta.page}/{Math.max(meta.pageCount, 1)} 页</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" aria-label="上一页" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}><ChevronLeft size={16} /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="下一页" disabled={meta.page >= meta.pageCount} onClick={() => onPage(meta.page + 1)}><ChevronRight size={16} /></Button>
      </div>
    </footer>
  );
}

export default function FinanceSettlementWorkbench({ capabilities }: { capabilities: FinanceWorkbenchCapabilities }) {
  const [activeTab, setActiveTab] = useState<"statements" | "counterparties" | "payments">("statements");
  const [search, setSearch] = useState("");
  const [statementStatus, setStatementStatus] = useState("");
  const [statementPage, setStatementPage] = useState(1);
  const [counterpartyPage, setCounterpartyPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [statementMeta, setStatementMeta] = useState(emptyMeta);
  const [counterpartyMeta, setCounterpartyMeta] = useState(emptyMeta);
  const [paymentMeta, setPaymentMeta] = useState(emptyMeta);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCounterpartyForm, setShowCounterpartyForm] = useState(false);
  const [showStatementForm, setShowStatementForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<Statement | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [allocationPayment, setAllocationPayment] = useState<Payment | null>(null);
  const [matchLine, setMatchLine] = useState<StatementLine | null>(null);

  const [counterpartyForm, setCounterpartyForm] = useState({ code: "", name: "", type: "LOGISTICS_PROVIDER" });
  const [statementForm, setStatementForm] = useState({ counterpartyId: "", statementNo: "", type: "COD_REMITTANCE", currency: "EUR", currencyScale: "2", amount: "", note: "" });
  const [paymentForm, setPaymentForm] = useState({ counterpartyId: "", paymentNo: "", direction: "PAYABLE", currency: "EUR", currencyScale: "2", amount: "", note: "" });
  const [lineForm, setLineForm] = useState({ amount: "", description: "", orderNo: "", trackingNo: "" });
  const [matchForm, setMatchForm] = useState({ referenceType: "ORDER", referenceNo: "", amount: "", reason: "" });
  const [allocationForm, setAllocationForm] = useState({ statementId: "", amount: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const statementParams = new URLSearchParams({ page: String(statementPage), pageSize: "20" });
      if (search.trim()) statementParams.set("q", search.trim());
      if (statementStatus) statementParams.set("status", statementStatus);
      const statementRequest = request<Statement[]>(`/api/mvp/finance/statements?${statementParams}`);
      const counterpartyRequest = capabilities.canReadCounterparties
        ? request<Counterparty[]>(`/api/mvp/finance/counterparties?page=${counterpartyPage}&pageSize=20`)
        : Promise.resolve(null);
      const paymentRequest = capabilities.canReadPayments
        ? request<Payment[]>(`/api/mvp/finance/payments?page=${paymentPage}&pageSize=20`)
        : Promise.resolve(null);
      const [statementResult, counterpartyResult, paymentResult] = await Promise.all([statementRequest, counterpartyRequest, paymentRequest]);
      setStatements(statementResult.data);
      setStatementMeta(statementResult.meta ?? emptyMeta);
      if (counterpartyResult) {
        setCounterparties(counterpartyResult.data);
        setCounterpartyMeta(counterpartyResult.meta ?? emptyMeta);
      }
      if (paymentResult) {
        setPayments(paymentResult.data);
        setPaymentMeta(paymentResult.meta ?? emptyMeta);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "财务数据加载失败。");
    } finally {
      setLoading(false);
    }
  }, [capabilities.canReadCounterparties, capabilities.canReadPayments, counterpartyPage, paymentPage, search, statementPage, statementStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const statementSummary = useMemo(() => ({
    total: statementMeta.total,
    reconciling: statements.filter((row) => row.status === "RECONCILING" || row.status === "EXCEPTION").length,
    approved: statements.filter((row) => row.status === "APPROVED").length,
    payments: paymentMeta.total,
  }), [paymentMeta.total, statementMeta.total, statements]);

  async function openStatement(id: string) {
    setSelectedLoading(true);
    setError("");
    try {
      const result = await request<Statement>(`/api/mvp/finance/statements/${id}`);
      setSelectedStatement(result.data);
      setMatchLine(null);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "结算单详情加载失败。");
    } finally {
      setSelectedLoading(false);
    }
  }

  async function submitCounterparty(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await request<Counterparty>("/api/mvp/finance/counterparties", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(counterpartyForm),
      });
      setCounterpartyForm({ code: "", name: "", type: "LOGISTICS_PROVIDER" });
      setShowCounterpartyForm(false);
      setNotice("结算对象已创建。它仍需要由管理员按角色配置相应权限。");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建结算对象失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitStatement(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const totalAmountCents = moneyFromDecimal(statementForm.amount, statementForm.currencyScale);
      const result = await request<Statement>("/api/mvp/finance/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...statementForm, totalAmountCents }),
      });
      setStatementForm({ counterpartyId: "", statementNo: "", type: "COD_REMITTANCE", currency: "EUR", currencyScale: "2", amount: "", note: "" });
      setShowStatementForm(false);
      setNotice("结算单草稿已创建。请先逐行录入并完成对账，再进行审批和过账。");
      await load();
      await openStatement(result.data.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建结算单失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const amountCents = moneyFromDecimal(paymentForm.amount, paymentForm.currencyScale);
      await request<Payment>("/api/mvp/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...paymentForm, amountCents }),
      });
      setPaymentForm({ counterpartyId: "", paymentNo: "", direction: "PAYABLE", currency: "EUR", currencyScale: "2", amount: "", note: "" });
      setShowPaymentForm(false);
      setNotice("付款草稿已创建。审批、核销和过账会按独立权限逐步放行。");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建付款草稿失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitLine(event: FormEvent) {
    event.preventDefault();
    if (!selectedStatement) return;
    setSaving(true);
    setError("");
    try {
      const amountCents = moneyFromDecimal(lineForm.amount, String(selectedStatement.currencyScale));
      await request<StatementLine>(`/api/mvp/finance/statements/${selectedStatement.id}/lines`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lineForm, amountCents }),
      });
      setLineForm({ amount: "", description: "", orderNo: "", trackingNo: "" });
      setNotice("结算明细已加入草稿。关联订单或运单时，系统会校验当前组织范围。");
      await load();
      await openStatement(selectedStatement.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "新增结算明细失败。");
    } finally {
      setSaving(false);
    }
  }

  async function runStatementAction(command: string) {
    if (!selectedStatement) return;
    const needsReason = command === "void" || command === "mark_exception";
    const reason = needsReason ? window.prompt(command === "void" ? "请填写作废原因：" : "请填写异常说明：") : "";
    if (needsReason && !reason?.trim()) return;
    setSaving(true);
    setError("");
    try {
      await request<Statement>(`/api/mvp/finance/statements/${selectedStatement.id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, reason }),
      });
      setNotice("结算单状态已更新，并已记录审计日志。");
      await load();
      await openStatement(selectedStatement.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "结算单状态更新失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitMatch(event: FormEvent) {
    event.preventDefault();
    if (!selectedStatement || !matchLine) return;
    setSaving(true);
    setError("");
    try {
      const amountCents = moneyFromDecimal(matchForm.amount, String(selectedStatement.currencyScale));
      await request<Reconciliation>(`/api/mvp/finance/statements/${selectedStatement.id}/lines/${matchLine.id}/reconciliations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...matchForm, amountCents }),
      });
      setMatchForm({ referenceType: "ORDER", referenceNo: "", amount: "", reason: "" });
      setMatchLine(null);
      setNotice("匹配建议已创建，仍需要具备对账处理权限的人员确认。")
      await openStatement(selectedStatement.id);
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : "创建匹配建议失败。");
    } finally {
      setSaving(false);
    }
  }

  async function resolveMatch(lineId: string, reconciliationId: string, command: "confirm" | "reject" | "ignore") {
    if (!selectedStatement) return;
    const reason = command === "confirm" ? "" : window.prompt(command === "reject" ? "请填写拒绝原因：" : "请填写忽略候选原因：");
    if (command !== "confirm" && !reason?.trim()) return;
    setSaving(true);
    setError("");
    try {
      await request<Reconciliation>(`/api/mvp/finance/statements/${selectedStatement.id}/lines/${lineId}/reconciliations/${reconciliationId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, reason }),
      });
      setNotice(command === "ignore" ? "候选已忽略，但该明细仍需创建并确认新的匹配后才能审批。" : "对账处理结果已保存并写入审计日志。");
      await openStatement(selectedStatement.id);
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "处理对账建议失败。");
    } finally {
      setSaving(false);
    }
  }

  async function runPaymentAction(payment: Payment, command: string) {
    const needsReason = command === "void";
    const reason = needsReason ? window.prompt("请填写作废原因：") : "";
    if (needsReason && !reason?.trim()) return;
    setSaving(true);
    setError("");
    try {
      await request<Payment>(`/api/mvp/finance/payments/${payment.id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, reason }),
      });
      setNotice("付款状态已更新并写入审计日志。");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "付款状态更新失败。");
    } finally {
      setSaving(false);
    }
  }

  async function submitAllocation(event: FormEvent) {
    event.preventDefault();
    if (!allocationPayment) return;
    setSaving(true);
    setError("");
    try {
      const amountCents = moneyFromDecimal(allocationForm.amount, String(allocationPayment.currencyScale));
      await request<unknown>(`/api/mvp/finance/payments/${allocationPayment.id}/allocations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statementId: allocationForm.statementId, amountCents }),
      });
      setAllocationPayment(null);
      setAllocationForm({ statementId: "", amount: "" });
      setNotice("核销分配已保存。付款需要完成核销后才允许过账。");
      await load();
    } catch (allocationError) {
      setError(allocationError instanceof Error ? allocationError.message : "保存核销分配失败。");
    } finally {
      setSaving(false);
    }
  }

  const availableApprovedStatements = statements.filter((row) => row.status === "APPROVED");
  const selectedActions = selectedStatement
    ? [
      ...(selectedStatement.status === "DRAFT" && capabilities.canResolveReconciliation ? [["start_reconciliation", "开始对账"]] : []),
      ...(selectedStatement.status === "RECONCILING" && capabilities.canResolveReconciliation ? [["mark_exception", "标记异常"]] : []),
      ...(selectedStatement.status === "EXCEPTION" && capabilities.canResolveReconciliation ? [["resume_reconciliation", "恢复对账"]] : []),
      ...(selectedStatement.status === "RECONCILING" && capabilities.canApproveStatements ? [["approve", "审批通过"]] : []),
      ...(selectedStatement.status === "APPROVED" && capabilities.canPostStatements ? [["post", "确认过账"]] : []),
      ...(selectedStatement.status !== "VOIDED" && capabilities.canVoidStatements ? [["void", "作废"]] : []),
    ] as Array<[string, string]>
    : [];

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-white shadow-sm">
        <div className="border-b border-amber-100 bg-slate-950 px-5 py-4 text-white">
          <p className="text-xs font-semibold tracking-[0.16em] text-amber-300">FINANCE · SCOPE · AUDIT</p>
          <h1 className="mt-1 text-2xl font-bold">物流回款与结算</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">结算单、COD 回款、人工对账与付款核销独立于物流追踪。每一步均由当前业务上下文、动作权限和数据范围决定。</p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {([
            { label: "当前范围结算单", value: statementSummary.total, Icon: Landmark, hint: "结算单数据库分页总数" },
            { label: "本页对账/异常", value: statementSummary.reconciling, Icon: ClipboardCheck, hint: "需要处理的结算单" },
            { label: "本页待过账", value: statementSummary.approved, Icon: CheckCircle2, hint: "仅审批完成的记录" },
            { label: "当前范围付款", value: statementSummary.payments, Icon: WalletCards, hint: "付款记录数据库分页总数" },
          ] satisfies Array<{ label: string; value: number; Icon: LucideIcon; hint: string }>).map(({ label, value, Icon, hint }) => {
            return <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div><Icon className="text-amber-600" size={20} /></div><p className="mt-2 text-xs text-slate-400">{hint}</p></div>;
          })}
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="财务结算功能">
        {([
          { key: "statements", label: "结算单与对账", Icon: Landmark },
          { key: "counterparties", label: "结算对象", Icon: Building2 },
          { key: "payments", label: "付款与核销", Icon: CreditCard },
        ] satisfies Array<{ key: "statements" | "counterparties" | "payments"; label: string; Icon: LucideIcon }>).map(({ key, label, Icon }) => {
          const tab = key;
          const unavailable = (tab === "counterparties" && !capabilities.canReadCounterparties) || (tab === "payments" && !capabilities.canReadPayments);
          return <Button key={key} type="button" variant={activeTab === tab ? "default" : "outline"} disabled={unavailable} onClick={() => setActiveTab(tab)}><Icon size={16} />{label}</Button>;
        })}
      </nav>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button type="button" className="text-emerald-700" aria-label="关闭提示" onClick={() => setNotice("")}><X size={16} /></button></p>}

      {activeTab === "statements" && (
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
            <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={16} className="text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setStatementPage(1); }} placeholder="搜索结算单号、外部单号或结算对象" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
              <select aria-label="结算单状态筛选" value={statementStatus} onChange={(event) => { setStatementStatus(event.target.value); setStatementPage(1); }} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">全部状态</option>{statementStatuses.map((status) => <option key={status} value={status}>{statementStatusLabel[status]}</option>)}</select>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />刷新</Button>
              {capabilities.canCreateStatements && <Button type="button" onClick={() => setShowStatementForm(true)} disabled={!capabilities.canReadCounterparties}><Plus size={16} />新建结算单</Button>}
            </div>
          </div>
          {capabilities.canCreateStatements && !capabilities.canReadCounterparties && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前角色可以创建结算单，但没有读取结算对象的权限；请由管理员同时配置 <code>finance.counterparty.read</code> 后再操作。</p>}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">结算单</th><th className="px-4 py-3">对象 / 类型</th><th className="px-4 py-3">金额</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">明细 / 核销</th><th className="px-4 py-3">创建时间</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-4 py-14 text-center text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin" size={20} />正在加载结算单…</td></tr>
                : !statements.length ? <tr><td colSpan={7} className="px-4 py-14 text-center text-slate-400">当前授权范围内暂无结算单。</td></tr>
                  : statements.map((statement) => <tr key={statement.id} className="hover:bg-amber-50/30"><td className="px-4 py-3"><p className="font-semibold text-slate-950">{statement.statementNo}</p><p className="text-xs text-slate-400">{statement.currency} · {statement.currencyScale} 位小数</p></td><td className="px-4 py-3"><p className="font-medium text-slate-800">{statement.counterparty?.name ?? "—"}</p><p className="text-xs text-slate-400">{statementTypeLabel[statement.type] ?? statement.type}</p></td><td className="px-4 py-3 font-semibold text-slate-900">{statement.totalAmountLabel}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(statement.status)}`}>{statementStatusLabel[statement.status] ?? statement.status}</span></td><td className="px-4 py-3 text-slate-600">{statement.lineCount} 明细 · {statement.allocationCount} 核销</td><td className="px-4 py-3 text-xs text-slate-500">{new Date(statement.createdAt).toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right"><Button type="button" size="sm" variant="outline" onClick={() => void openStatement(statement.id)}>查看 / 对账</Button></td></tr>)}
            </tbody></table></div><Pager meta={statementMeta} onPage={setStatementPage} />
          </section>
        </section>
      )}

      {activeTab === "counterparties" && capabilities.canReadCounterparties && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><h2 className="font-bold text-slate-950">结算对象</h2><p className="mt-1 text-sm text-slate-500">物流商、仓储商和服务商等由配置创建，不写死在业务代码中。</p></div>{capabilities.canManageCounterparties && <Button type="button" onClick={() => setShowCounterpartyForm(true)}><Plus size={16} />新建结算对象</Button>}</div>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">编码</th><th className="px-4 py-3">名称</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">部门范围</th><th className="px-4 py-3">状态</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-400">正在加载…</td></tr> : !counterparties.length ? <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-400">暂无结算对象。</td></tr> : counterparties.map((row) => <tr key={row.id}><td className="px-4 py-3 font-mono text-xs text-violet-700">{row.code}</td><td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td><td className="px-4 py-3 text-slate-600">{row.type}</td><td className="px-4 py-3 text-slate-500">{row.departmentId ? "部门限定" : "当前业务板块"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.isActive ? "启用" : "停用"}</span></td></tr>)}</tbody></table></div><Pager meta={counterpartyMeta} onPage={setCounterpartyPage} /></section>
        </section>
      )}

      {activeTab === "payments" && capabilities.canReadPayments && (
        <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><h2 className="font-bold text-slate-950">付款与核销</h2><p className="mt-1 text-sm text-slate-500">付款必须先审批、按已批准结算单核销，再确认过账；不能静默删除历史。</p></div>{capabilities.canCreatePayments && <Button type="button" onClick={() => setShowPaymentForm(true)} disabled={!capabilities.canReadCounterparties}><Plus size={16} />新建付款草稿</Button>}</div><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[920px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">付款单</th><th className="px-4 py-3">对象 / 方向</th><th className="px-4 py-3">金额</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-400">正在加载…</td></tr> : !payments.length ? <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-400">当前授权范围内暂无付款记录。</td></tr> : payments.map((payment) => <tr key={payment.id}><td className="px-4 py-3"><p className="font-semibold text-slate-950">{payment.paymentNo}</p><p className="text-xs text-slate-400">{new Date(payment.createdAt).toLocaleString("zh-CN")}</p></td><td className="px-4 py-3"><p className="font-medium text-slate-800">{payment.counterparty?.name ?? "—"}</p><p className="text-xs text-slate-400">{payment.direction === "PAYABLE" ? "付款" : "收款"}</p></td><td className="px-4 py-3 font-semibold text-slate-900">{payment.amountLabel}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(payment.status)}`}>{paymentStatusLabel[payment.status] ?? payment.status}</span></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{payment.status === "DRAFT" && capabilities.canApprovePayments && <Button size="sm" type="button" variant="outline" onClick={() => void runPaymentAction(payment, "approve")}>审批</Button>}{payment.status === "APPROVED" && capabilities.canAllocatePayments && <Button size="sm" type="button" variant="outline" onClick={() => { setAllocationPayment(payment); setAllocationForm({ statementId: "", amount: "" }); }}>核销</Button>}{payment.status === "APPROVED" && capabilities.canPostPayments && <Button size="sm" type="button" onClick={() => void runPaymentAction(payment, "post")}>过账</Button>}{payment.status !== "VOIDED" && capabilities.canVoidPayments && <Button size="sm" type="button" variant="ghost" className="text-rose-700" onClick={() => void runPaymentAction(payment, "void")}>作废</Button>}</div></td></tr>)}</tbody></table></div><Pager meta={paymentMeta} onPage={setPaymentPage} /></section></section>
      )}

      {showCounterpartyForm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><form onSubmit={submitCounterparty} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">配置化主数据</p><h2 className="mt-1 text-xl font-bold text-slate-950">新建结算对象</h2></div><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={() => setShowCounterpartyForm(false)}><X size={18} /></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">编码<input required value={counterpartyForm.code} onChange={(event) => setCounterpartyForm({ ...counterpartyForm, code: event.target.value.toUpperCase() })} placeholder="例如 HONGYA" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 font-mono" /></label><label className="text-sm font-medium">名称<input required value={counterpartyForm.name} onChange={(event) => setCounterpartyForm({ ...counterpartyForm, name: event.target.value })} placeholder="例如 鸿亚物流" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium sm:col-span-2">类型<select value={counterpartyForm.type} onChange={(event) => setCounterpartyForm({ ...counterpartyForm, type: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="LOGISTICS_PROVIDER">物流服务商</option><option value="WAREHOUSE_PROVIDER">仓储服务商</option><option value="SERVICE_PROVIDER">其他服务商</option><option value="OTHER">其他</option></select></label></div><Button type="submit" disabled={saving} className="mt-5 w-full"><Building2 size={16} />{saving ? "保存中…" : "保存结算对象"}</Button></form></div>}

      {showStatementForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-4"><form onSubmit={submitStatement} className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">结算草稿</p><h2 className="mt-1 text-xl font-bold text-slate-950">新建物流回款 / 结算单</h2><p className="mt-1 text-sm text-slate-500">金额在浏览器中按文本精确换算为最小货币单位，不使用浮点金额。</p></div><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={() => setShowStatementForm(false)}><X size={18} /></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">结算对象<select required value={statementForm.counterpartyId} onChange={(event) => setStatementForm({ ...statementForm, counterpartyId: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="">请选择</option>{counterparties.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label><label className="text-sm font-medium">结算单号<input required value={statementForm.statementNo} onChange={(event) => setStatementForm({ ...statementForm, statementNo: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium">结算类型<select value={statementForm.type} onChange={(event) => setStatementForm({ ...statementForm, type: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3">{statementTypes.map((type) => <option key={type} value={type}>{statementTypeLabel[type]}</option>)}</select></label><label className="text-sm font-medium">币种<input required maxLength={12} value={statementForm.currency} onChange={(event) => setStatementForm({ ...statementForm, currency: event.target.value.toUpperCase() })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium">小数位<input required min="0" max="6" type="number" value={statementForm.currencyScale} onChange={(event) => setStatementForm({ ...statementForm, currencyScale: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium sm:col-span-2">结算总金额<input required inputMode="decimal" value={statementForm.amount} onChange={(event) => setStatementForm({ ...statementForm, amount: event.target.value })} placeholder="例如 299.90" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium sm:col-span-2">说明（可选）<textarea value={statementForm.note} maxLength={2000} onChange={(event) => setStatementForm({ ...statementForm, note: event.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label></div><Button type="submit" disabled={saving} className="mt-5 w-full"><FilePlus2 size={16} />{saving ? "保存中…" : "创建结算草稿"}</Button></form></div>}

      {showPaymentForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-4"><form onSubmit={submitPayment} className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">付款草稿</p><h2 className="mt-1 text-xl font-bold text-slate-950">新建付款 / 收款记录</h2></div><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={() => setShowPaymentForm(false)}><X size={18} /></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">结算对象<select required value={paymentForm.counterpartyId} onChange={(event) => setPaymentForm({ ...paymentForm, counterpartyId: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="">请选择</option>{counterparties.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label><label className="text-sm font-medium">付款单号<input required value={paymentForm.paymentNo} onChange={(event) => setPaymentForm({ ...paymentForm, paymentNo: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium">方向<select value={paymentForm.direction} onChange={(event) => setPaymentForm({ ...paymentForm, direction: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="PAYABLE">付款</option><option value="RECEIVABLE">收款</option></select></label><label className="text-sm font-medium">币种<input required maxLength={12} value={paymentForm.currency} onChange={(event) => setPaymentForm({ ...paymentForm, currency: event.target.value.toUpperCase() })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium">小数位<input required min="0" max="6" type="number" value={paymentForm.currencyScale} onChange={(event) => setPaymentForm({ ...paymentForm, currencyScale: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium sm:col-span-2">金额<input required inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} placeholder="例如 299.90" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium sm:col-span-2">说明（可选）<textarea value={paymentForm.note} maxLength={2000} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label></div><Button type="submit" disabled={saving} className="mt-5 w-full"><CreditCard size={16} />{saving ? "保存中…" : "创建付款草稿"}</Button></form></div>}

      {selectedStatement && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><div className="mx-auto my-6 w-full max-w-6xl rounded-2xl bg-white shadow-2xl"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs text-amber-700">{selectedStatement.statementNo}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(selectedStatement.status)}`}>{statementStatusLabel[selectedStatement.status] ?? selectedStatement.status}</span></div><h2 className="mt-2 text-xl font-bold text-slate-950">{selectedStatement.counterparty?.name ?? "结算对象"} · {selectedStatement.totalAmountLabel}</h2><p className="mt-1 text-sm text-slate-500">{statementTypeLabel[selectedStatement.type] ?? selectedStatement.type} · {selectedStatement.lineCount} 条明细 · {selectedStatement.allocationCount} 笔核销</p>{selectedStatement.exceptionReason && <p className="mt-2 text-sm text-rose-700">异常：{selectedStatement.exceptionReason}</p>}</div><div className="flex flex-wrap justify-end gap-2">{selectedActions.map(([command, label]) => <Button key={command} type="button" size="sm" variant={command === "void" ? "outline" : "default"} className={command === "void" ? "text-rose-700" : ""} disabled={saving} onClick={() => void runStatementAction(command)}>{label}</Button>)}<Button type="button" size="icon" variant="ghost" aria-label="关闭结算单详情" onClick={() => setSelectedStatement(null)}><X size={18} /></Button></div></header><div className="space-y-4 p-5">{selectedLoading ? <div className="py-14 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={20} />正在刷新详情…</div> : !selectedStatement.lineDetailsAvailable ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><ShieldAlert className="mr-2 inline" size={16} />当前角色可查看结算单摘要，但没有对账明细权限。请由管理员配置 <code>finance.reconciliation.read</code>。</div> : <><section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><div className="flex items-center gap-2"><BadgeDollarSign className="text-amber-600" size={18} /><div><h3 className="font-bold text-slate-900">结算明细</h3><p className="text-xs text-slate-500">每条明细单独匹配、确认和保留审计记录。</p></div></div>{selectedStatement.status === "DRAFT" && capabilities.canUpdateStatements && <form onSubmit={submitLine} className="mt-4 grid gap-3 lg:grid-cols-[140px_1fr_1fr_1fr_auto]"><input required inputMode="decimal" value={lineForm.amount} onChange={(event) => setLineForm({ ...lineForm, amount: event.target.value })} placeholder="金额" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /><input value={lineForm.orderNo} onChange={(event) => setLineForm({ ...lineForm, orderNo: event.target.value })} placeholder="订单号（可选）" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /><input value={lineForm.trackingNo} onChange={(event) => setLineForm({ ...lineForm, trackingNo: event.target.value })} placeholder="物流单号（可选）" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /><input value={lineForm.description} onChange={(event) => setLineForm({ ...lineForm, description: event.target.value })} placeholder="说明（可选）" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" /><Button type="submit" disabled={saving}>新增明细</Button></form>}</section><div className="space-y-3">{!selectedStatement.lines?.length ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">暂无明细。草稿必须明细金额合计等于结算总金额，才能开始对账。</div> : selectedStatement.lines.map((line) => <article key={line.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><p className="font-semibold text-slate-950">第 {line.lineNo} 条 · {line.amountLabel}</p><p className="mt-1 text-xs text-slate-500">{line.sourceReference ? `关联：${line.sourceReference}` : "尚未关联订单或运单"}{line.description ? ` · ${line.description}` : ""}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(line.reconciliationStatus)}`}>{reconciliationStatusLabel[line.reconciliationStatus] ?? line.reconciliationStatus}</span>{["RECONCILING", "EXCEPTION"].includes(selectedStatement.status) && capabilities.canMatchReconciliation && <Button type="button" size="sm" variant="outline" onClick={() => { setMatchLine(line); setMatchForm({ referenceType: "ORDER", referenceNo: "", amount: "", reason: "" }); }}>匹配</Button>}</div></div>{line.reconciliations.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{line.reconciliations.map((reconciliation) => <div key={reconciliation.id} className="flex flex-col justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs sm:flex-row sm:items-center"><span>{reconciliation.orderId ? `订单 ID: ${reconciliation.orderId}` : `运单 ID: ${reconciliation.shipmentId}`} · {reconciliation.amountCents} 最小单位</span><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 font-semibold ${statusClass(reconciliation.status)}`}>{reconciliation.status}</span>{reconciliation.status === "SUGGESTED" && capabilities.canResolveReconciliation && <><Button type="button" size="sm" variant="outline" onClick={() => void resolveMatch(line.id, reconciliation.id, "confirm")}>确认</Button><Button type="button" size="sm" variant="ghost" onClick={() => void resolveMatch(line.id, reconciliation.id, "reject")}>拒绝</Button><Button type="button" size="sm" variant="ghost" onClick={() => void resolveMatch(line.id, reconciliation.id, "ignore")}>忽略</Button></>}</div></div>)}</div>}</article>)}</div></>}</div></div></div>}

      {matchLine && selectedStatement && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4"><form onSubmit={submitMatch} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">人工匹配建议</p><h2 className="mt-1 text-xl font-bold">第 {matchLine.lineNo} 条明细 · {matchLine.amountLabel}</h2></div><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={() => setMatchLine(null)}><X size={18} /></Button></div><div className="mt-5 grid gap-4"><label className="text-sm font-medium">关联类型<select value={matchForm.referenceType} onChange={(event) => setMatchForm({ ...matchForm, referenceType: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="ORDER">订单号</option><option value="SHIPMENT">物流单号</option></select></label><label className="text-sm font-medium">{matchForm.referenceType === "ORDER" ? "订单号" : "物流单号"}<input required value={matchForm.referenceNo} onChange={(event) => setMatchForm({ ...matchForm, referenceNo: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium">匹配金额<input required inputMode="decimal" value={matchForm.amount} onChange={(event) => setMatchForm({ ...matchForm, amount: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium">说明（可选）<textarea value={matchForm.reason} onChange={(event) => setMatchForm({ ...matchForm, reason: event.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3" /></label></div><Button type="submit" disabled={saving} className="mt-5 w-full"><ClipboardCheck size={16} />{saving ? "保存中…" : "创建匹配建议"}</Button></form></div>}

      {allocationPayment && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4"><form onSubmit={submitAllocation} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">付款核销</p><h2 className="mt-1 text-xl font-bold">{allocationPayment.paymentNo} · {allocationPayment.amountLabel}</h2><p className="mt-1 text-sm text-slate-500">只允许核销同一结算对象、同币种且已批准的结算单。</p></div><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={() => setAllocationPayment(null)}><X size={18} /></Button></div><div className="mt-5 grid gap-4"><label className="text-sm font-medium">已批准结算单<select required value={allocationForm.statementId} onChange={(event) => setAllocationForm({ ...allocationForm, statementId: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="">请选择</option>{availableApprovedStatements.filter((statement) => statement.counterpartyId === allocationPayment.counterpartyId && statement.currency === allocationPayment.currency && statement.currencyScale === allocationPayment.currencyScale).map((statement) => <option key={statement.id} value={statement.id}>{statement.statementNo} · {statement.totalAmountLabel}</option>)}</select></label><label className="text-sm font-medium">本次核销金额<input required inputMode="decimal" value={allocationForm.amount} onChange={(event) => setAllocationForm({ ...allocationForm, amount: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label></div>{!availableApprovedStatements.length && <p className="mt-3 flex gap-2 text-sm text-amber-700"><CircleAlert size={16} />当前页面未加载可用的已批准结算单；可先切到结算单筛选后刷新。</p>}<Button type="submit" disabled={saving} className="mt-5 w-full"><CheckCircle2 size={16} />{saving ? "保存中…" : "保存核销分配"}</Button></form></div>}
    </div>
  );
}
