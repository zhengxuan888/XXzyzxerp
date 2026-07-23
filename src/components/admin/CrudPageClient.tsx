"use client";

import { FormEvent, useState } from "react";
import { usePathname } from "next/navigation";

export type DataCellValue = string | number | boolean | null | Date | Record<string, unknown> | Array<unknown>;
export type DataRow = Record<string, DataCellValue>;

export type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "number" | "email" | "password" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
};

export type DataCell = {
  key: string;
  label: string;
  render?: (row: DataRow) => string;
};

export type CrudPageProps = {
  resource: string;
  canCreate: boolean;
  canDelete: boolean;
  apiBase?: string;
  rows: DataRow[];
  rowId?: string;
  createFields: FieldSpec[];
  dataColumns: DataCell[];
  listTitle: string;
};

const API_BASE = "/api/admin";

type FormBody = Record<string, string | number | boolean>;

export default function CrudPage({
  resource,
  canCreate,
  canDelete,
  apiBase,
  rows,
  rowId = "id",
  createFields,
  dataColumns,
  listTitle,
}: CrudPageProps) {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState<string | null>(null);
  const endpointBase = apiBase ?? API_BASE;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setLoadingCreate(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload: FormBody = {};
    for (const field of createFields) {
      const value = formData.get(field.key);
      if (value === null || value === "") continue;
      if (typeof value === "string" && field.type === "number") {
        const asNumber = Number(value);
        payload[field.key] = Number.isFinite(asNumber) ? asNumber : value;
      } else {
        payload[field.key] = typeof value === "string" ? value : String(value);
      }
    }

    const response = await fetch(`${endpointBase}/${resource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.error?.message || result?.error || "Create failed.");
      setLoadingCreate(false);
      return;
    }
    window.location.reload();
  }

  async function handleDelete(id: string) {
    if (!canDelete) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this record?");
    if (!confirmDelete) return;

    setLoadingDelete(id);
    const response = await fetch(`${endpointBase}/${resource}/${id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error?.message || payload?.error || "Delete failed.");
      setLoadingDelete(null);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">{listTitle}</h2>
        <p className="text-xs text-gray-500">Current path: {pathname}</p>
      </div>

      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-600">Create</h3>
        {!canCreate && <p className="text-sm text-gray-500">No permission to create.</p>}
        {canCreate ? (
          <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            {createFields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm text-gray-700">
                <span>{field.label}</span>
                {field.type === "select" ? (
                  <select name={field.key} className="rounded border border-gray-300 px-2 py-2" required={field.required}>
                    <option value="">Please select</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required={field.required}
                    name={field.key}
                    type={field.type ?? "text"}
                    placeholder={field.placeholder}
                    className="rounded border border-gray-300 px-2 py-2"
                  />
                )}
              </label>
            ))}
            <div className="md:col-span-2">
              <button
                disabled={loadingCreate}
                className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                type="submit"
              >
                {loadingCreate ? "Saving..." : "Create"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-600">List</h3>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {rows.length === 0 && <p className="text-sm text-gray-500">No records.</p>}
        {rows.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  {dataColumns.map((col) => (
                    <th key={col.key} className="border-b border-gray-200 px-3 py-2 font-medium">
                      {col.label}
                    </th>
                  ))}
                  <th className="border-b border-gray-200 px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row[rowId])} className="border-b border-gray-100 last:border-0">
                    {dataColumns.map((col) => (
                      <td key={`${String(row[rowId])}-${col.key}`} className="px-3 py-2 text-gray-700">
                        {col.render ? col.render(row) : String(row[col.key] ?? "")}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {canDelete ? (
                        <button
                          className="rounded border border-red-200 px-2 py-1 text-red-600 disabled:opacity-50"
                          onClick={() => handleDelete(String(row[rowId]))}
                          disabled={loadingDelete === row[rowId]}
                        >
                          {loadingDelete === row[rowId] ? "Deleting..." : "Delete"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">No permission</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
