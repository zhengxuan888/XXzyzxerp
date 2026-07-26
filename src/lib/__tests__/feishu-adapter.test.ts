import { describe, expect, it } from "vitest";
import { parseFeishuMessage } from "@/lib/inbox/feishu-adapter";

describe("飞书消息适配器", () => {
  it("把文本事件转换成统一收件箱消息", () => {
    const message = parseFeishuMessage({
      event: {
        message: {
          message_id: "om_demo_1",
          chat_id: "oc_demo_1",
          message_type: "text",
          content: JSON.stringify({ text: "你好，想咨询订单" }),
          create_time: "1720000000",
        },
        sender: { sender_id: { open_id: "ou_demo_1" }, name: "演示客户" },
      },
    });
    expect(message).toMatchObject({
      providerMessageKey: "om_demo_1",
      providerThreadKey: "oc_demo_1",
      providerContactKey: "ou_demo_1",
      text: "你好，想咨询订单",
      contentType: "text",
    });
  });

  it("缺少外部消息主键或发送人时安全忽略", () => {
    expect(parseFeishuMessage({ event: { message: { chat_id: "oc_demo_1" } } })).toBeNull();
    expect(parseFeishuMessage({ event: { message: { message_id: "om_demo_1", chat_id: "oc_demo_1" } } })).toBeNull();
  });

  it("拒绝空文本，避免无内容消息污染收件箱", () => {
    expect(parseFeishuMessage({
      event: {
        message: { message_id: "om_demo_1", chat_id: "oc_demo_1", content: JSON.stringify({ text: "  " }) },
        sender: { sender_id: { open_id: "ou_demo_1" } },
      },
    })).toBeNull();
  });
});
