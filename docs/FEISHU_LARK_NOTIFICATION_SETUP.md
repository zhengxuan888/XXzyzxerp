# 飞书 / Lark 通知接入准备

当前已提供可替换的通知适配器，但默认不连接任何外部账号。ERP 内提醒始终独立运行。

## 申请后需要提供的配置

- 飞书或 Lark 自定义机器人 Webhook URL
- 如机器人开启签名校验，提供机器人 Secret（只放在服务器环境变量，不提交 Git）
- 事件通知范围：订单核单、待发货、物流异常、派送提醒、审批待办等

本地配置项：

```env
FEISHU_BOT_WEBHOOK_URL=""
FEISHU_BOT_SECRET=""
```

代码通过 `feishuWebhookFromEnv()` 创建通知 Provider。未配置 Webhook 时返回 `null`，不会发起网络请求；接入时仍需在 ERP 服务端根据 Membership、部门和授权范围筛选收件人，不能把敏感订单或物流数据广播到无关群组。
