"use client";

import { ChevronLeft, ChevronRight, Eye, FileSearch, LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";

import { zh } from "@/lib/i18n";

export type DataCellValue = string | number | boolean | null | Date | Record<string, unknown> | Array<unknown>;
export type DataRow = Record<string, DataCellValue>;

export type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "number" | "email" | "password" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
};

export type DataCell = {
  key: string;
  label: string;
  render?: (row: DataRow) => string;
  linkPath?: string;
  type?: "text" | "image";
};

export type CrudPageProps = {
  resource: string;
  canCreate: boolean;
  canUpdate?: boolean;
  canDelete: boolean;
  apiBase?: string;
  rows: DataRow[];
  rowId?: string;
  createFields: FieldSpec[];
  dataColumns: DataCell[];
  listTitle: string;
  createLabel?: string;
  rowClassName?: (row: DataRow) => string;
  showCreate?: boolean;
  detailPath?: string;
  deleteConfirmation?: string;
  /**
   * Some high-volume pages already query and paginate on the server. Passing
   * their metadata here prevents this generic table from paginating the same
   * page of rows a second time (which made page-size and total counts lie).
   */
  serverPagination?: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

const API_BASE = "/api/admin";
const DEFAULT_PAGE_SIZE = 20;
type FormBody = Record<string, string | number | boolean>;

function displayValue(value: DataCellValue) {
  if (value instanceof Date) return value.toLocaleString("zh-CN");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return zh(String(value ?? ""));
}

function StatusPill({ value }: { value: DataCellValue }) {
  const text = displayValue(value);
  const normalized = String(value ?? "").toUpperCase();
  const tone =
    /DELIVERED|COMPLETED|APPROVED|ACTIVE|RESOLVED/.test(normalized)
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : /EXCEPTION|REJECTED|CANCEL/.test(normalized)
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : /PENDING|SUBMITTED|WAITING|NEEDS_ATTENTION/.test(normalized)
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-slate-100 text-slate-700 ring-slate-200";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}>{text || "-"}</span>;
}

export default function CrudPage({
  resource,
  canCreate,
  canUpdate = false,
  canDelete,
  apiBase,
  rows,
  rowId = "id",
  createFields,
  dataColumns,
  listTitle,
  createLabel = "新建",
  rowClassName,
  showCreate = true,
  detailPath,
  deleteConfirmation = "确定删除该记录吗？删除后无法恢复。",
  serverPagination,
}: CrudPageProps) {
  const [error, setError] = useState<string | null>(null);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState<string | null>(null);
  const [loadingUpdate, setLoadingUpdate] = useState(false);
  const [editingRow, setEditingRow] = useState<DataRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const endpointBase = apiBase ?? API_BASE;
  const isServerPaginated = Boolean(serverPagination);

  const filteredRows = useMemo(() => {
    if (isServerPaginated) return rows;
    const term = keyword.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      dataColumns.some((column) => {
        const rendered = column.render ? column.render(row) : displayValue(row[column.key]);
        return rendered.toLowerCase().includes(term);
      }),
    );
  }, [dataColumns, isServerPaginated, keyword, rows]);

  const pageCount = serverPagination?.pageCount ?? Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = serverPagination?.page ?? Math.min(page, pageCount);
  const visibleRows = isServerPaginated
    ? rows
    : filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const displayedTotal = serverPagination?.total ?? filteredRows.length;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setLoadingCreate(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload: FormBody = {};
    for (const field of createFields) {
      if (field.type === "checkbox") {
        payload[field.key] = formData.get(field.key) === "on";
        continue;
      }
      const value = formData.get(field.key);
      if (value === null || value === "") continue;
      if (typeof value === "string" && field.type === "number") {
        const asNumber = Number(value);
        payload[field.key] = Number.isFinite(asNumber) ? asNumber : value;
      } else {
        payload[field.key] = typeof value === "string" ? value : String(value);
      }
    }

    try {
      const response = await fetch(`${endpointBase}/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error?.message || result?.error || "保存失败，请稍后重试");
        return;
      }
      window.location.reload();
    } catch {
      setError("网络连接失败，请稍后重试");
    } finally {
      setLoadingCreate(false);
    }
  }

  async function handleDelete(id: string) {
    if (!canDelete) return;
    if (!window.confirm(deleteConfirmation)) return;

    setLoadingDelete(id);
    setError(null);
    try {
      const response = await fetch(`${endpointBase}/${resource}/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message || payload?.error || "删除失败");
        return;
      }
      window.location.reload();
    } catch {
      setError("网络连接失败，请稍后重试");
    } finally {
      setLoadingDelete(null);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || !editingRow) return;
    setLoadingUpdate(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload: FormBody = {};
    for (const field of createFields) {
      if (field.type === "checkbox") {
        payload[field.key] = data.get(field.key) === "on";
        continue;
      }
      const value = data.get(field.key);
      if (value === null || value === "") continue;
      payload[field.key] = field.type === "number" ? Number(value) : String(value);
    }
    const id = String(editingRow[rowId]);
    try {
      const response = await fetch(`${endpointBase}/${resource}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error?.message || result?.error || "修改失败");
        return;
      }
      window.location.reload();
    } catch {
      setError("网络连接失败，请稍后重试");
    } finally {
      setLoadingUpdate(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">{zh(listTitle)}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{displayedTotal}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">支持搜索、筛选和分页。</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!isServerPaginated && <label className="flex h-10 min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
              <Search size={16} className="text-slate-400" />
              <input
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="搜索当前列表"
                aria-label="搜索当前列表"
              />
              {keyword && <button type="button" aria-label="清除搜索" onClick={() => setKeyword("")}>{"✕"}</button>}
            </label>}
            {showCreate && canCreate && (
              <button
                type="button"
                onClick={() => setShowForm((value) => !value)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-200 hover:bg-violet-700"
              >
                <Plus size={17} /> {createLabel}
              </button>
            )}
          </div>
        </div>

        {showCreate && !canCreate && (
          <p className="border-b border-slate-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">当前模块缺少创建权限。</p>
        )}

        {showCreate && canCreate && showForm && (
          <form className="grid grid-cols-1 gap-4 border-b border-slate-200 bg-slate-50/70 p-5 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreate}>
            {createFields.map((field) => (
              <label key={field.key} className="space-y-1.5 text-sm text-slate-700">
                <span className="font-medium">{zh(field.label)}{field.required && <b className="ml-1 text-rose-500">*</b>}</span>
                {field.type === "checkbox" ? (
                  <input type="checkbox" name={field.key} defaultChecked />
                ) : field.type === "select" ? (
                  <select name={field.key} className={inputClass} required={field.required}>
                    <option value="">请选择</option>
                    {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{zh(option.label)}</option>)}
                  </select>
                ) : (
                  <input required={field.required} name={field.key} type={field.type ?? "text"} placeholder={field.placeholder} className={inputClass} />
                )}
              </label>
            ))}
            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
              <button
                disabled={loadingCreate}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                type="submit"
              >
                {loadingCreate && <LoaderCircle size={16} className="animate-spin" />}
                {loadingCreate ? "保存中..." : "保存"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">取消</button>
            </div>
          </form>
        )}

        {error && <p role="alert" className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</p>}

        {visibleRows.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><FileSearch size={22} /></span>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">{!isServerPaginated && keyword ? "未匹配到任何结果" : "当前无记录"}</h3>
              <p className="mt-1 text-xs text-slate-500">{!isServerPaginated && keyword ? "请检查筛选条件" : "请先创建记录。"}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-xs font-semibold text-slate-500">
                  {dataColumns.map((column) => <th key={column.key} className="whitespace-nowrap border-b border-slate-200 px-4 py-3">{zh(column.label)}</th>)}
                  <th className="sticky right-0 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
                  const id = String(row[rowId]);
                  const fallbackClass =
                    String(row.isOverdue ?? "").toUpperCase() === "YES" || String(row.isOverdue ?? "").toUpperCase() === "TRUE"
                      ? "bg-rose-50/30"
                      : "";
                  const highlightClass = typeof row.__rowClassName === "string"
                    ? row.__rowClassName
                    : rowClassName
                      ? rowClassName(row)
                      : fallbackClass;
                  return (
                    <tr key={id} className={`group hover:bg-violet-50/30 ${highlightClass}`}>
                      {dataColumns.map((column) => (
                        <td key={`${id}-${column.key}`} className="max-w-80 whitespace-nowrap px-4 py-3 text-slate-700">
                          {column.type === "image" && typeof row[column.key] === "string" && row[column.key] ? (
                            <Image unoptimized width={56} height={56} src={String(row[column.key])} alt="商品图片" className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain p-1" />
                          ) : column.linkPath ? (
                            <Link className="block truncate font-semibold text-violet-700 hover:text-violet-900 hover:underline" href={column.linkPath.replace("{id}", id)}>
                              {column.render ? column.render(row) || "-" : displayValue(row[column.key]) || "-"}
                            </Link>
                          ) : column.render ? <span className="block truncate">{column.render(row) || "-"}</span> : /status/i.test(column.key) ? <StatusPill value={row[column.key]} /> : <span className="block truncate">{displayValue(row[column.key]) || "-"}</span>}
                        </td>
                      ))}
                      <td className="sticky right-0 whitespace-nowrap bg-white px-4 py-3 text-right group-hover:bg-[#fbfaff]">
                        {detailPath && (
                          <Link className="mr-1 inline-flex size-8 items-center justify-center rounded-lg text-violet-600 hover:bg-violet-100" href={`${detailPath}/${id}`}>
                            <Eye size={16} />
                          </Link>
                        )}
                        {canUpdate && (
                          <button
                            type="button"
                            className="mr-1 inline-flex size-8 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50"
                            onClick={() => setEditingRow(row)}
                            title="编辑"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="inline-flex size-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                            onClick={() => handleDelete(id)}
                            disabled={loadingDelete === id}
                            title="删除"
                          >
                            {loadingDelete === id ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isServerPaginated && <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span>{safePage} / {pageCount} 页，共 {filteredRows.length} 条</span>
            <label className="flex items-center gap-1">
              <span>每页</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                aria-label="每页显示条数"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>条</span>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={safePage === 1}
              className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              aria-label="上一页"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={safePage === pageCount}
              className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              aria-label="下一页"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>}
      </section>
      {editingRow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={() => setEditingRow(null)}>
          <form onSubmit={handleUpdate} onMouseDown={(event) => event.stopPropagation()} className="grid max-h-[90vh] w-full max-w-3xl grid-cols-1 gap-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl md:grid-cols-2">
            <h3 className="text-lg font-bold md:col-span-2">编辑记录</h3>
            {createFields.map((field) => (
              <label key={field.key} className="space-y-1.5 text-sm text-slate-700">
                <span className="font-medium">{zh(field.label)}</span>
                {field.type === "checkbox" ? (
                  <input type="checkbox" name={field.key} defaultChecked={Boolean(editingRow[field.key])} />
                ) : field.type === "select" ? (
                  <select name={field.key} className={inputClass} required={field.required} defaultValue={String(editingRow[field.key] ?? "")}>
                    <option value="">请选择</option>
                    {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{zh(option.label)}</option>)}
                  </select>
                ) : (
                  <input name={field.key} type={field.type ?? "text"} required={field.required} className={inputClass} defaultValue={String(editingRow[field.key] ?? "")} />
                )}
              </label>
            ))}
            <div className="flex gap-2 md:col-span-2">
              <button disabled={loadingUpdate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{loadingUpdate && <LoaderCircle size={15} className="animate-spin" />}保存修改</button>
              <button type="button" onClick={() => setEditingRow(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm">取消</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
