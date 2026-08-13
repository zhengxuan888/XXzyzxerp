import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import AddressComparison from "@/components/admin/AddressComparison";
import {
  CUSTOMER_ORIGINAL_ADDRESS_SOURCE,
  LEGACY_DERIVED_ADDRESS_SOURCE,
} from "@/lib/order-address";

const completeAddress = {
  recipientName: "María García",
  recipientPhone: "+34 612 345 678",
  recipientCountryCode: "ES",
  recipientRegion: null,
  recipientCity: "Madrid",
  recipientPostalCode: "28009",
  recipientDistrict: "Salamanca",
  recipientStreet: "Calle de Alcalá",
  recipientHouseNumber: "123, 4º B",
  recipientAddress: "Calle de Alcalá 123, 4º B",
  recipientFullAddress: "María García, Calle de Alcalá 123, 4º B, 28009 Madrid, España",
  recipientFullAddressSource: CUSTOMER_ORIGINAL_ADDRESS_SOURCE,
};

describe("AddressComparison", () => {
  it("treats region as optional and hides the original address when permission is absent", () => {
    const html = renderToStaticMarkup(<AddressComparison {...completeAddress} showOriginalAddress={false} />);

    expect(html).toContain("拆分字段完整");
    expect(html).toContain("州/省（可选）");
    expect(html).toContain("未填写（不影响导出）");
    expect(html).not.toContain("客户完整原始地址（核对后删除）");
    expect(html).not.toContain(completeAddress.recipientFullAddress);
  });

  it("renders the preserved original address separately for authorized reviewers", () => {
    const html = renderToStaticMarkup(<AddressComparison {...completeAddress} />);

    expect(html).toContain("员工拆分地址（发送物流）");
    expect(html).toContain("客户完整原始地址（核对后删除）");
    expect(html).toContain("原文已保留");
    expect(html).toContain(completeAddress.recipientFullAddress);
  });

  it("marks missing required logistics fields without treating the original address as structured data", () => {
    const html = renderToStaticMarkup(
      <AddressComparison {...completeAddress} recipientPhone={null} recipientPostalCode={null} />,
    );

    expect(html).toContain("缺少 电话、邮编");
    expect(html).toContain("原文已保留");
  });

  it("shows the constrained one-time capture form only to an authorized employee", () => {
    const authorizedHtml = renderToStaticMarkup(
      <AddressComparison
        {...completeAddress}
        recipientFullAddress={null}
        orderId="order-1"
        canCapture
      />,
    );
    const readOnlyHtml = renderToStaticMarkup(
      <AddressComparison {...completeAddress} recipientFullAddress={null} orderId="order-1" />,
    );

    expect(authorizedHtml).toContain("一次性补录完整原始地址");
    expect(authorizedHtml).toContain("maxLength=\"1000\"");
    expect(authorizedHtml).toContain("补录并锁定");
    expect(readOnlyHtml).not.toContain("补录并锁定");
    expect(readOnlyHtml).toContain("请联系有订单或物流维护权限的员工补录");
  });

  it("treats a legacy derived value as missing customer evidence while preserving it for warning", () => {
    const html = renderToStaticMarkup(
      <AddressComparison
        {...completeAddress}
        recipientFullAddress="Calle de Alcalá 123, 4º B"
        recipientFullAddressSource={LEGACY_DERIVED_ADDRESS_SOURCE}
        orderId="order-1"
        canCapture
      />,
    );

    expect(html).toContain("历史拆分值，需补录");
    expect(html).toContain("历史值：");
    expect(html).toContain("Calle de Alcalá 123, 4º B");
    expect(html).toContain("补录并锁定");
    expect(html).not.toContain("客户原文已保留");
  });
});
