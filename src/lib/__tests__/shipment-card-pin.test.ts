import { describe, expect, it } from "vitest";

import { sortPinnedShipmentCards } from "@/lib/logistics/shipment-card-pin";

describe("shipment card pin ordering", () => {
  it("moves personal pins first and orders multiple pins newest first", () => {
    const rows = [
      { id: "critical", isPinned: false, pinnedAt: null },
      { id: "older-pin", isPinned: true, pinnedAt: "2026-08-09T01:00:00.000Z" },
      { id: "high", isPinned: false, pinnedAt: null },
      { id: "newer-pin", isPinned: true, pinnedAt: "2026-08-09T02:00:00.000Z" },
    ];

    expect(sortPinnedShipmentCards(rows).map((row) => row.id)).toEqual([
      "newer-pin",
      "older-pin",
      "critical",
      "high",
    ]);
  });

  it("restores the caller's dynamic order when a card is unpinned", () => {
    const dynamicOrder = [
      { id: "critical", isPinned: false, pinnedAt: null },
      { id: "normal", isPinned: false, pinnedAt: null },
      { id: "older", isPinned: false, pinnedAt: null },
    ];

    expect(sortPinnedShipmentCards(dynamicOrder).map((row) => row.id)).toEqual([
      "critical",
      "normal",
      "older",
    ]);
  });

  it("orders pins before pagination so a pin from a later page enters page one", () => {
    const filteredRows = [
      { id: "first", isPinned: false, pinnedAt: null },
      { id: "second", isPinned: false, pinnedAt: null },
      { id: "later-page-pin", isPinned: true, pinnedAt: "2026-08-09T03:00:00.000Z" },
    ];

    const firstPage = sortPinnedShipmentCards(filteredRows).slice(0, 2);

    expect(firstPage.map((row) => row.id)).toEqual(["later-page-pin", "first"]);
  });

  it("is stable for equal pin times and never mutates the filtered input", () => {
    const filteredRows = [
      { id: "visible-b", isPinned: true, pinnedAt: "2026-08-09T02:00:00.000Z" },
      { id: "visible-a", isPinned: true, pinnedAt: "2026-08-09T02:00:00.000Z" },
    ];
    const before = [...filteredRows];

    expect(sortPinnedShipmentCards(filteredRows).map((row) => row.id)).toEqual(["visible-b", "visible-a"]);
    expect(filteredRows).toEqual(before);
  });
});
