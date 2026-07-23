import type { ChannelProviderAdapter } from "@/lib/inbox/provider";

export class DemoInboxAdapter implements ChannelProviderAdapter {
  readonly key = "DEMO";

  async pull(cursor?: string | null) {
    const sequence = Number(cursor ?? "1") + 1;
    return {
      nextCursor: String(sequence),
      messages: [
        {
          providerMessageKey: `demo-message-${sequence}`,
          providerThreadKey: "demo-thread-001",
          providerContactKey: "demo-contact-001",
          contactDisplayName: "演示咨询客户",
          subject: "商品配送咨询",
          text: sequence % 2 === 0 ? "可以帮我确认预计送达时间吗？" : "好的，我会留意物流更新，谢谢。",
          occurredAt: new Date(),
        },
      ],
    };
  }
}
