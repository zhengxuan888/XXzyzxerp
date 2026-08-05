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
    ["Unsuccessful (physical) delivery", "投递未成功"],
    ["Posting/collection", "邮件已交寄或揽收"],
    ["Your parcel has arrived at the depot Břeclav, Na Hrůdách 1147. We’re now preparing it for delivery.", "快件已到达配送站，正在准备派送"],
  ])("translates %s", (source, expected) => expect(translateTrackingDescription(source)).toBe(expected));

  it("leaves existing Chinese notes unchanged", () => {
    expect(translateTrackingDescription("从旧 ERP 物流追踪表导入")).toBe("从旧 ERP 物流追踪表导入");
  });

  it("does not invent unknown translations", () => {
    expect(translateTrackingDescription("Courier-specific text not reviewed yet")).toBeNull();
  });
});
