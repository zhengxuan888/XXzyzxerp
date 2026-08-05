import { describe, expect, it } from "vitest";
import { translateTrackingDescription } from "@/lib/tracking-translation";

describe("translateTrackingDescription", () => {
  it.each([
    ["Almacenado temporalmente", "临时存储"],
    ["Incidencia en el reparto", "派送中出现问题"],
    ["Cambio nueva fecha de entrega", "更改新的交货日期"],
    ["Em entrega - O envio saiu para entrega. Será entregue durante o dia.", "快件正在派送，预计当天送达"],
    ["Não entregue - A entrega do envio não foi conseguida. - Motivo: O destinatário não atendeu.", "快件未送达：收件人未应答"],
    ["Em trânsito - Chegou ao centro operacional", "快件运输中，已到达运营中心"],
  ])("translates %s", (source, expected) => expect(translateTrackingDescription(source)).toBe(expected));

  it("does not invent unknown translations", () => {
    expect(translateTrackingDescription("Courier-specific text not reviewed yet")).toBeNull();
  });
});
