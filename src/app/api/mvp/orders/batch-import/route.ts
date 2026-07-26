import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { requireAuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";

type ImportRow = { row: number; orderNo?: string; shopId: string; customerName: string; phone: string; email: string; address: string; country: string; city: string; postalCode: string; productCode: string; quantity: number; unitPriceCents: number; codAmountCents: number; currency: string; paymentMethod: string };
type Checked = ImportRow & { errors: string[]; productId?: string };
const text = (v: unknown) => String(v ?? "").trim();
const headers: Record<string, keyof ImportRow> = { orderno: "orderNo", 订单号: "orderNo", shopid: "shopId", 店铺id: "shopId", 客户姓名: "customerName", customername: "customerName", 姓名: "customerName", 电话: "phone", phone: "phone", 邮箱: "email", email: "email", 地址: "address", 收货地址: "address", 国家: "country", country: "country", 城市: "city", city: "city", 邮编: "postalCode", productcode: "productCode", 商品编码: "productCode", sku: "productCode", 数量: "quantity", quantity: "quantity", 单价分: "unitPriceCents", unitpricecents: "unitPriceCents", cod金额分: "codAmountCents", codamountcents: "codAmountCents", 币种: "currency", currency: "currency", 付款方式: "paymentMethod", paymentmethod: "paymentMethod" };

async function parseWorkbook(file: File): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("工作簿没有工作表");
  const map = new Map<number, keyof ImportRow>();
  ws.getRow(1).eachCell((cell, col) => { const key = headers[text(cell.value).toLowerCase().replace(/\s/g, "")]; if (key) map.set(col, key); });
  if (!map.has(0) && !map.has(1)) throw new Error("首行未识别到订单模板字段");
  const rows: ImportRow[] = [];
  ws.eachRow((r, n) => { if (n === 1) return; const item = {} as ImportRow; map.forEach((key, col) => { (item as Record<string, unknown>)[key] = text(r.getCell(col).value); }); item.row = n; item.quantity = Number(item.quantity); item.unitPriceCents = Number(item.unitPriceCents); item.codAmountCents = Number(item.codAmountCents || 0); item.currency = (item.currency || "EUR").toUpperCase(); rows.push(item); });
  return rows.filter((r) => Object.values(r).some((v) => text(v)));
}

async function checkRows(rows: ImportRow[], businessUnitId: string): Promise<Checked[]> {
  const codes = [...new Set(rows.map((r) => r.productCode).filter(Boolean))];
  const products = await prisma.product.findMany({ where: { businessUnitId, code: { in: codes }, isActive: true }, select: { id: true, code: true } });
  const productMap = new Map(products.map((p) => [p.code.toLowerCase(), p.id]));
  const orderNos = new Set<string>();
  return rows.map((r) => { const errors: string[] = []; if (!r.shopId) errors.push("店铺 ID 必填"); if (!r.customerName) errors.push("客户姓名必填"); if (!r.productCode || !productMap.has(r.productCode.toLowerCase())) errors.push("商品编码不存在或不属于当前业务板块"); if (!Number.isSafeInteger(r.quantity) || r.quantity <= 0) errors.push("数量必须为正整数"); if (!Number.isSafeInteger(r.unitPriceCents) || r.unitPriceCents < 0) errors.push("单价分必须为非负整数"); if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) errors.push("邮箱格式不正确"); if (r.orderNo && orderNos.has(r.orderNo)) errors.push("文件内订单号重复"); if (r.orderNo) orderNos.add(r.orderNo); return { ...r, errors, productId: productMap.get(r.productCode.toLowerCase()) }; });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request); if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await checkPermission({ userId: auth.userId, membershipId: auth.membership.id, actionKey: "order.create", targetBusinessUnitId: auth.membership.businessUnitId });
  if (!permission.allowed) return fail("FORBIDDEN", "没有批量录入订单权限。", 403);
  const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return fail("FILE_REQUIRED", "请上传 XLSX 文件。", 400); if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 10 * 1024 * 1024) return fail("INVALID_FILE", "仅支持 10MB 以内 XLSX 文件。", 400);
  let rows: ImportRow[]; try { rows = await parseWorkbook(file); } catch (e) { return fail("PARSE_FAILED", e instanceof Error ? e.message : "文件解析失败。", 400); }
  if (rows.length === 0 || rows.length > 500) return fail("ROW_LIMIT", "文件必须包含 1-500 行订单。", 400);
  const checked = await checkRows(rows, auth.membership.businessUnitId); const valid = checked.filter((r) => r.errors.length === 0); const mode = text(form.get("mode")) || "preview";
  if (mode !== "commit") return ok({ total: checked.length, valid: valid.length, invalid: checked.length - valid.length, rows: checked });
  if (valid.length !== checked.length) return fail("VALIDATION_FAILED", "存在错误行，修正后才能确认导入。", 400, { rows: checked });
  const created = await prisma.$transaction(async (tx) => { const result = []; for (const r of valid) { const customer = await tx.customer.findFirst({ where: { businessUnitId: auth.membership.businessUnitId, OR: [{ contactEmail: r.email || undefined }, { contactPhone: r.phone || undefined }].filter((x) => Object.values(x)[0]) }, select: { id: true } }); const c = customer ?? await tx.customer.create({ data: { legalEntityId: auth.membership.legalEntityId, businessUnitId: auth.membership.businessUnitId, departmentId: auth.membership.departmentId, code: `EC-${Date.now()}-${Math.floor(Math.random() * 100000)}`, name: r.customerName, contactName: r.customerName, contactPhone: r.phone || null, contactEmail: r.email || null }, select: { id: true } }); const order = await tx.order.create({ data: { legalEntityId: auth.membership.legalEntityId, businessUnitId: auth.membership.businessUnitId, departmentId: auth.membership.departmentId, siteId: auth.membership.siteId, customerId: c.id, orderNo: r.orderNo || `ORD-${Date.now()}-${Math.floor(Math.random() * 100000)}`, creatorUserId: auth.userId, ownedByMembershipId: auth.membership.id, shopId: r.shopId, status: "DRAFT", currency: r.currency, productValueCents: r.quantity * r.unitPriceCents, codAmountCents: r.codAmountCents, recipientName: r.customerName, recipientPhone: r.phone || null, recipientEmail: r.email || null, recipientCountryCode: r.country || null, recipientCity: r.city || null, recipientPostalCode: r.postalCode || null, recipientAddress: r.address || null, paymentMethod: r.paymentMethod || null, items: { create: { productId: r.productId!, productName: r.productCode, quantity: r.quantity, unitPriceCents: r.unitPriceCents, subtotalCents: r.quantity * r.unitPriceCents } } }, select: { id: true, orderNo: true } }); result.push(order); } return result; });
  await writeAuditLog({ actorUserId: auth.userId, actorMembershipId: auth.membership.id, module: "mvp.orders", action: "order.batch_import", targetType: "order_batch", businessUnitId: auth.membership.businessUnitId, roleId: auth.membership.roleId, details: { count: created.length } });
  return ok({ imported: created.length, orders: created }, { status: 201 });
}
