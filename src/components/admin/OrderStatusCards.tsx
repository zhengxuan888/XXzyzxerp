import Link from "next/link";

import type { OrderStatus } from "@prisma/client";

const cards: Array<{ status?: OrderStatus; label: string }> = [
  { label: "全部订单" },
  { status: "DRAFT", label: "待提交" },
  { status: "SUBMITTED", label: "待核单" },
  { status: "WAITING_SHIPMENT", label: "待发货" },
  { status: "SHIPPED", label: "在途" },
  { status: "DELIVERED", label: "已送达" },
  { status: "EXCEPTION", label: "异常" },
  { status: "COMPLETED", label: "已完成" },
  { status: "CANCELLED", label: "已结束" },
];

export default function OrderStatusCards({ groups, activeStatus }: { groups: Array<{ status: OrderStatus; count: number }>; activeStatus?: OrderStatus }) {
  const counts = new Map(groups.map((item) => [item.status, item.count]));
  const total = groups.reduce((sum, item) => sum + item.count, 0);
  return <nav className="grid gap-3 sm:grid-cols-3 xl:grid-cols-9">{cards.map((card) => {
    const active = card.status ? activeStatus === card.status : !activeStatus;
    return <Link key={card.label} href={card.status ? `/admin/orders?status=${card.status}` : "/admin/orders"} className={`rounded-2xl border p-4 shadow-sm transition ${active ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:border-amber-200"}`}><p className="text-xs text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{card.status ? counts.get(card.status) ?? 0 : total}</p></Link>;
  })}</nav>;
}
