import { describe, expect, it } from "vitest";

import { prepareGeneratedSpreadsheetArtifact, prepareReturnSpreadsheetArtifact } from "@/lib/logistics-spreadsheet";

const zipHeader = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
const legacyXlsHeader = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

describe("logistics spreadsheet artifacts", () => {
  it("accepts a modern workbook and gives it a private random storage key", () => {
    const artifact = prepareReturnSpreadsheetArtifact("provider-return.xlsx", zipHeader);
    expect(artifact.storageKey).toMatch(/^[a-f0-9-]{36}\.xlsx$/);
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not pretend classic XLS/XLT files are parsed safely", () => {
    expect(() => prepareReturnSpreadsheetArtifact("legacy.xls", legacyXlsHeader)).toThrow("LEGACY_XLS_CONVERSION_REQUIRED");
    expect(() => prepareReturnSpreadsheetArtifact("wrong.xlsx", legacyXlsHeader)).toThrow("LEGACY_XLS_CONVERSION_REQUIRED");
  });

  it("keeps generated export names and file signatures constrained to XLSX", () => {
    expect(prepareGeneratedSpreadsheetArtifact("batch.xlsx", zipHeader).mimeType).toContain("spreadsheetml");
    expect(() => prepareGeneratedSpreadsheetArtifact("batch.csv", zipHeader)).toThrow("XLSX_ARTIFACT_NAME_REQUIRED");
  });
});
