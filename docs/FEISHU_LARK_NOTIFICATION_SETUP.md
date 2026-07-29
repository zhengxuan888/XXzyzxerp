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

代码通过 `feishuWebhookFromEnv()` 创建通知 Provider。未配置 Webhook 时返回 `null`，不会发起网络请求。启用签名校验时，系统按照飞书协议动态生成 `timestamp + sign`，Secret 不会作为消息字段发送，也不会进入仓库。

安全限制：

- 只接受 HTTPS 的 `open.feishu.cn` 或 `open.larksuite.com` 自定义机器人地址。
- 机器人 Webhook 与 Secret 只能由服务器环境变量或 Secret Manager 注入。
- 接入时仍需在 ERP 服务端根据 Membership、部门和授权范围筛选收件人，不能把客户电话、地址、完整订单信息广播到无关群组。
- 当前只完成安全发送适配器；在通知去重、重试和部门路由完成前，不自动发送真实物流提醒。

## 权限边界

- ERP 详情页始终重新验证当前员工的 Membership、Action 和数据 Scope；收到链接不代表有权打开。
- 群机器人无法按 ERP 员工逐人撤回可见性，因此群消息只包含业务待办摘要，不包含客户姓名、电话、邮箱、WhatsApp、地址、物流单号、COD 金额或商品明细。
- 机器人只能加入成员范围与 ERP 授权范围一致的专用工作群；群成员由飞书管理员维护。
- 如需精确到“某个员工能收到、另一个员工不能收到”，必须改用飞书自建应用的单聊消息，并配置 ERP Membership 与飞书用户 `open_id` 的映射。本项目保留通知 Provider 接口，但在取得 App ID、App Secret 和员工授权前不会假装实现这种能力。

## 队列与调度

物流工作台配置中可按当前业务板块开启“飞书物流提醒队列”，并选择是否仅入队高优先级轨迹。默认关闭。

```bash
pnpm run notifications:dispatch
```

建议在预发布环境每分钟运行一次派发脚本。相同 Ship24 事件通过 `dedupeKey` 只入队一次；发送失败按 1、2、4、8、16 分钟退避重试，最多 5 次后进入 `DEAD`，不会无限轰炸群聊。进程异常留下的 `PROCESSING` 记录超过 10 分钟后可被重新认领。
