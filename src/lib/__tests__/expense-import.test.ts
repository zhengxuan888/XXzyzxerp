import { describe, expect, it } from "vitest";
import { parseExpenseImportFile, validateExpenseImportRows } from "@/lib/expense-import";
describe("expense import", () => {
  it("converts decimal amount exactly", async () => {
    const [row] = await parseExpenseImportFile(Buffer.from("费用类别,金额,币种\n运费,12.34,EUR"), "csv");
    expect(row.amountCents).toBe(1234);
  });
  it("rejects missing order and invalid currency", () => {
    const [row] = validateExpenseImportRows([{ row: 2, orderNo: "NO", category: "运费", amountText: "10", amountCents: 1000, currency: "EU", paidAt: "", note: "" }], new Map());
    expect(row.action).toBe("REJECT");
    expect(row.errors.length).toBe(2);
  });
});
