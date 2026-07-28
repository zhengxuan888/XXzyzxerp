import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import {
  ORDER_IMPORT_MAX_BYTES,
  ORDER_IMPORT_MAX_ROWS,
  parseOrderImportWorkbook,
  validateOrderImportRows,
} from "@/lib/order-batch-import";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);

  const permission = await checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "order.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
  });
  if (!permission.allowed) return fail("FORBIDDEN", "没有批量录入订单权限。", 403);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请上传 XLSX 文件。", 400);
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > ORDER_IMPORT_MAX_BYTES) {
    return fail("INVALID_FILE", "仅支持 10MB 以内 XLSX 文件。", 400);
  }
  const mode = text(form.get("mode")) || "preview";
  if (mode !== "preview" && mode !== "commit") {
    return fail("INVALID_MODE", "批量导入模式无效。", 400);
  }

  let rows;
  try {
    rows = await parseOrderImportWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return fail("PARSE_FAILED", error instanceof Error ? error.message : "文件解析失败。", 400);
  }
  if (rows.length === 0 || rows.length > ORDER_IMPORT_MAX_ROWS) {
    return fail("ROW_LIMIT", `文件必须包含 1-${ORDER_IMPORT_MAX_ROWS} 行订单。`, 400);
  }

  const requestedOrderNos = [...new Set(rows.map((row) => row.orderNo).filter(Boolean))];
  const [products, existingOrders] = await Promise.all([
    prisma.product.findMany({
      where: { businessUnitId: auth.membership.businessUnitId, isActive: true },
      select: { id: true, code: true, name: true },
    }),
    requestedOrderNos.length > 0
      ? prisma.order.findMany({
          where: {
            businessUnitId: auth.membership.businessUnitId,
            orderNo: { in: requestedOrderNos },
          },
          select: { orderNo: true },
        })
      : Promise.resolve([]),
  ]);
  const productMap = new Map(
    products.map((product) => [product.code.toLowerCase(), { id: product.id, name: product.name }]),
  );
  const existingOrderNos = new Set(existingOrders.map((order) => order.orderNo));
  const checked = validateOrderImportRows(rows, productMap, existingOrderNos);
  const valid = checked.filter((row) => row.errors.length === 0);
  if (mode === "preview") {
    return ok({
      total: checked.length,
      valid: valid.length,
      invalid: checked.length - valid.length,
      rows: checked,
    });
  }
  if (valid.length !== checked.length) return fail("VALIDATION_FAILED", "存在错误行，修正后才能确认导入。", 400, { rows: checked });

  let created: Array<{ id: string; orderNo: string }>;
  try {
    created = await prisma.$transaction(async (tx) => {
      const result: Array<{ id: string; orderNo: string }> = [];
      const batchId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
      for (const [index, row] of valid.entries()) {
        const contacts = [
          ...(row.email ? [{ contactEmail: row.email }] : []),
          ...(row.phone ? [{ contactPhone: row.phone }] : []),
        ];
        const customer = contacts.length > 0
          ? await tx.customer.findFirst({
              where: { businessUnitId: auth.membership.businessUnitId, OR: contacts },
              select: { id: true },
            })
          : null;
        const resolvedCustomer = customer ?? await tx.customer.create({
          data: {
            legalEntityId: auth.membership.legalEntityId,
            businessUnitId: auth.membership.businessUnitId,
            departmentId: auth.membership.departmentId,
            code: `EC-${batchId}-${index + 1}`,
            name: row.customerName,
            contactName: row.customerName,
            contactPhone: row.phone || null,
            contactEmail: row.email || null,
          },
          select: { id: true },
        });
        const order = await tx.order.create({
          data: {
            legalEntityId: auth.membership.legalEntityId,
            businessUnitId: auth.membership.businessUnitId,
            departmentId: auth.membership.departmentId,
            siteId: auth.membership.siteId,
            customerId: resolvedCustomer.id,
            orderNo: row.orderNo || `ORD-${batchId}-${index + 1}`,
            creatorUserId: auth.userId,
            ownedByMembershipId: auth.membership.id,
            shopId: row.shopId,
            status: "DRAFT",
            currency: row.currency,
            productValueCents: row.quantity * row.unitPriceCents,
            codAmountCents: row.codAmountCents,
            recipientName: row.customerName,
            recipientPhone: row.phone || null,
            recipientEmail: row.email || null,
            recipientCountryCode: row.country || null,
            recipientCity: row.city || null,
            recipientPostalCode: row.postalCode || null,
            recipientAddress: row.address || null,
            paymentMethod: row.paymentMethod || null,
            items: {
              create: {
                productId: row.productId!,
                productName: row.resolvedProductName!,
                quantity: row.quantity,
                unitPriceCents: row.unitPriceCents,
                subtotalCents: row.quantity * row.unitPriceCents,
              },
            },
          },
          select: { id: true, orderNo: true },
        });
        result.push(order);
      }
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("IMPORT_CONFLICT", "导入期间检测到重复订单号，请重新预览后再试。", 409);
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "mvp.orders",
    action: "order.batch_import",
    targetType: "order_batch",
    businessUnitId: auth.membership.businessUnitId,
    roleId: auth.membership.roleId,
    details: { count: created.length },
  });
  return ok({ imported: created.length, orders: created }, { status: 201 });
}
