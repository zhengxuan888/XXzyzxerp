import { NextRequest } from "next/server";

import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { financeErrorResponse } from "@/lib/finance/http";
import { financeStatementImportBatchDto, previewFinanceStatementImport } from "@/lib/finance/import-service";
import { MAX_PRIVATE_SPREADSHEET_BYTES } from "@/lib/logistics-spreadsheet";

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("FILE_REQUIRED", "请先选择账单工作簿。", 400);
  if (!file.size || file.size > MAX_PRIVATE_SPREADSHEET_BYTES) {
    return fail("FILE_SIZE_LIMIT_EXCEEDED", "上传账单大小必须介于 1 B 和 10 MB 之间。", 400);
  }
  try {
    const result = await previewFinanceStatementImport(
      { userId: auth.userId, membership: auth.membership },
      {
        templateId: form.get("templateId"),
        counterpartyId: form.get("counterpartyId"),
        statementNoPrefix: form.get("statementNoPrefix"),
        externalReference: form.get("externalReference"),
        periodStart: form.get("periodStart"),
        periodEnd: form.get("periodEnd"),
        issuedAt: form.get("issuedAt"),
        file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      },
    );
    return ok({ ...financeStatementImportBatchDto(result.batch), idempotent: result.idempotent });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
