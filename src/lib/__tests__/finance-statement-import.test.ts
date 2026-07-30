import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseFinanceStatementTemplateConfiguration } from "@/lib/finance/import-template";
import { FinanceStatementWorkbookError, previewFinanceStatementWorkbook } from "@/lib/finance/import-workbook";

const configuration = parseFinanceStatementTemplateConfiguration({
  sheets: [
    {
      key: "statement_lines",
      sheetAliases: ["Statement"],
      headerScanRows: 5,
      dataStartOffset: 1,
      skipIfFirstCellMatches: ["总计"],
      statementType: "COD_REMITTANCE",
      currency: "EUR",
      currencyScale: 2,
      aliases: {
        sourceReference: ["业务单号"],
        trackingReference: ["物流单号"],
        amount: ["金额"],
        description: ["说明"],
      },
    },
  ],
});

async function workbookBytes(build: (sheet: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Statement");
  build(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("finance statement workbook preflight", () => {
  it("maps a configured later header row and keeps money exact", async () => {
    const bytes = await workbookBytes((sheet) => {
      sheet.addRow(["供应商账单"]);
      sheet.addRow(["业务单号", "物流单号", "金额", "说明"]);
      sheet.addRow(["ORD-001", "TRACK-001", "1,234.56", "正常"]);
    });

    const result = await previewFinanceStatementWorkbook(bytes, configuration, "SET-20260731");
    expect(result.totalRows).toBe(1);
    expect(result.readyRows).toBe(1);
    expect(result.sheets[0]?.headerRowNumber).toBe(2);
    expect(result.sheets[0]?.rows[0]).toMatchObject({
      status: "READY",
      sourceReference: "ORD-001",
      trackingReference: "TRACK-001",
      amountCents: BigInt("123456"),
    });
  });

  it("does not silently skip formula-only rows", async () => {
    const bytes = await workbookBytes((sheet) => {
      sheet.addRow(["业务单号", "物流单号", "金额", "说明"]);
      const row = sheet.addRow([]);
      row.getCell(1).value = { formula: '"ORD-001"', result: "ORD-001" };
      row.getCell(3).value = { formula: "29.99", result: 29.99 };
    });

    const result = await previewFinanceStatementWorkbook(bytes, configuration, "SET-20260731");
    expect(result.totalRows).toBe(1);
    expect(result.rejectedRows).toBe(1);
    expect(result.sheets[0]?.rows[0]?.issueCodes).toEqual(expect.arrayContaining([
      "SOURCE_REFERENCE_FORMULA_NOT_ALLOWED",
      "AMOUNT_FORMULA_NOT_ALLOWED",
    ]));
  });

  it("rejects unsafe scientific-notation source references and exact duplicate lines", async () => {
    const scientific = await workbookBytes((sheet) => {
      sheet.addRow(["业务单号", "金额"]);
      sheet.addRow(["8.828E+18", "29.99"]);
    });
    const scientificPreview = await previewFinanceStatementWorkbook(scientific, configuration, "SET-20260731");
    expect(scientificPreview.sheets[0]?.rows[0]?.issueCodes).toEqual(expect.arrayContaining([
      expect.stringMatching(/^SOURCE_REFERENCE_(SCIENTIFIC_NOTATION|NUMERIC_NOT_ALLOWED)$/),
    ]));

    const duplicate = await workbookBytes((sheet) => {
      sheet.addRow(["业务单号", "金额"]);
      sheet.addRow(["ORD-001", "29.99"]);
      sheet.addRow(["ORD-001", "29.99"]);
    });
    const duplicatePreview = await previewFinanceStatementWorkbook(duplicate, configuration, "SET-20260731");
    expect(duplicatePreview.readyRows).toBe(0);
    expect(duplicatePreview.rejectedRows).toBe(2);
    expect(duplicatePreview.sheets[0]?.rows.map((row) => row.issueCodes)).toEqual([
      expect.arrayContaining(["DUPLICATE_SOURCE_ROW"]),
      expect.arrayContaining(["DUPLICATE_SOURCE_ROW"]),
    ]);
  });

  it("fails closed when no configured sheet exists", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Unknown").addRow(["业务单号", "金额"]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(previewFinanceStatementWorkbook(bytes, configuration, "SET-20260731"))
      .rejects.toMatchObject({ code: "TEMPLATE_SHEET_NOT_FOUND" } satisfies Partial<FinanceStatementWorkbookError>);
  });
});
