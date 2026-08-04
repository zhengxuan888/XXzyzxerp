"use client";

import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";

import AttachmentPanel from "@/components/admin/AttachmentPanel";
import OrderWorkflowActions from "@/components/admin/OrderWorkflowActions";

type ReviewRow = {
  id: string;
  orderNo: string;
  employee: string;
  recipient: string;
  contact: string;
  phone: string;
  whatsapp: string;
  shopId: string;
  address: string;
  productSummary: string;
  country: string;
  amount: string;
  submittedAt: string;
  permissions: { approve: boolean; reject: boolean; cancel: boolean };
};

export default function OrderReviewQuickTable({ rows, reviewRejectReasons, voidReasons }: { rows: ReviewRow[]; reviewRejectReasons: string[]; voidReasons: string[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">订单号</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">录单人</th><th className="px-4 py-3">收件人</th><th className="px-4 py-3">商品</th><th className="px-4 py-3">国家</th><th className="px-4 py-3">货到付款金额</th><th className="px-4 py-3">提交时间</th><th className="px-4 py-3">操作</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const open = openId === row.id;
            return (
              <Fragment key={row.id}>
                <tr className={`border-t border-slate-100 ${open ? "bg-amber-50/40" : ""}`}>
                  <td className="px-4 py-3 font-semibold text-amber-800">{row.orderNo}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">待核单</span></td>
                  <td className="px-4 py-3">{row.employee}</td>
                  <td className="px-4 py-3"><p>{row.recipient}</p><p className="text-xs text-slate-400">{row.contact}</p></td>
                  <td className="px-4 py-3">{row.productSummary}</td>
                  <td className="px-4 py-3">{row.country}</td>
                  <td className="px-4 py-3 font-semibold">{row.amount}</td>
                  <td className="px-4 py-3">{row.submittedAt}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setOpenId(open ? null : row.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50" aria-expanded={open}>
                      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{open ? "收起" : "快速核单"}
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="border-t border-amber-100 bg-amber-50/20">
                    <td colSpan={9} className="p-4">
                      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.7fr)_minmax(620px,1.8fr)]">
                        <aside className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-slate-900">核对信息</h3>
                            <Link href={`/admin/orders/${row.id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-700">完整详情<ExternalLink size={13} /></Link>
                          </div>
                          <dl className="mt-3 space-y-3 text-sm">
                            <div><dt className="text-xs text-slate-400">比特窗口号（店铺 ID）</dt><dd className={`mt-0.5 font-medium ${row.shopId ? "text-slate-800" : "text-rose-600"}`}>{row.shopId || "未填写"}</dd></div>
                            <div><dt className="text-xs text-slate-400">收件人</dt><dd className="mt-0.5 font-medium text-slate-800">{row.recipient}</dd></div>
                            <div><dt className="text-xs text-slate-400">电话 / WhatsApp</dt><dd className="mt-0.5 break-all text-slate-700">{row.phone || "-"} / {row.whatsapp || "-"}</dd></div>
                            <div><dt className="text-xs text-slate-400">完整地址</dt><dd className="mt-0.5 text-slate-700">{row.address || "-"}</dd></div>
                            <div><dt className="text-xs text-slate-400">商品与金额</dt><dd className="mt-0.5 font-medium text-slate-800">{row.productSummary}<br />{row.amount}</dd></div>
                          </dl>
                        </aside>
                        <div className="space-y-3">
                          <AttachmentPanel targetType="ORDER" targetId={row.id} canUpload={false} canDelete={false} title="客户沟通图片" />
                          <OrderWorkflowActions
                            orderId={row.id}
                            currentStatus="SUBMITTED"
                            permissions={{ submit: false, reviewApprove: row.permissions.approve, reviewReject: row.permissions.reject, ship: false, cancel: row.permissions.cancel }}
                            reviewRejectReasons={reviewRejectReasons}
                            voidReasons={voidReasons}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
