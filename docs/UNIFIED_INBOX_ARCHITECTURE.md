# 统一收件箱本地骨架

## 边界

本批只提供可插拔消息采集和内部处理骨架，未连接微信、WhatsApp、Facebook、独立站或任何真实第三方账号。`providerKey`、渠道连接、菜单、角色和权限均为数据库配置，不在业务代码中按具体平台名称分支。`DEMO` 仅是本地适配器种子，可删除替换。

## 数据模型

- `ChannelConnection`：渠道连接与组织归属；配置中不得保存明文凭据。
- `ContactIdentity`：外部身份的规范化映射。
- `Conversation` / `Message`：会话和消息事实。
- `ConversationCustomerLink`：客户或线索关联；当前 MVP 可关联客户，`linkType` 为未来线索模型保留。
- `ConversationAssignment`：当前及历史分派。
- `InboxTag` / `ConversationTag`：板块内可配置标签。
- `DeliveryAttempt` / `SyncCursor`：同步幂等、重试和游标。
- `InboxAuditEvent`：同步、状态、分派、标签和客户关联审计。

所有核心数据至少带 `businessUnitId`；渠道和会话同时带 `departmentId`。服务端从 Session 的有效 Membership 推导查询范围，不接受客户端提交组织归属。

## Provider Adapter

`ChannelProviderAdapter` 只定义标准消息拉取契约。新增真实渠道时应单独实现适配器，并在密钥管理系统中保存 OAuth/Token；数据库只保存安全引用或非敏感配置。标准处理链路：

`adapter.pull → DeliveryAttempt → ContactIdentity upsert → Conversation upsert → Message upsert → SyncCursor`

`Message(conversationId, providerMessageKey)` 和 `DeliveryAttempt(channelConnectionId, idempotencyKey)` 双重唯一约束保证重复推送或重复拉取不会重复入库。失败标记为 `RETRYABLE` 并记录下一次重试时间，不静默丢弃。

### 飞书接入

`src/lib/inbox/feishu-adapter.ts` 提供飞书事件到统一 `ProviderMessage` 的标准化适配器，`/api/webhooks/feishu` 提供事件订阅入口。入口只接受配置的 `FEISHU_VERIFICATION_TOKEN`，按请求头中的 `x-feishu-connection-id` 找到数据库中的 `providerKey=FEISHU` 且启用的渠道连接，再复用统一幂等同步链路；不保存 App Secret，也不自动向飞书发送消息。配置真实应用前必须在飞书后台完成事件订阅、消息权限、HTTPS 回调和回调重试策略验证。

## 权限动作

- `inbox.read`
- `inbox.sync.demo`
- `inbox.manage`
- `inbox.assign`
- `inbox.customer.link`

每个 API 动作都执行 Membership + Action + Scope；分派还会再次验证目标 Membership 与会话的业务板块、部门归属。前端按钮是否显示不作为授权依据。

## 本地运行与回滚

```powershell
docker compose up -d
pnpm exec prisma migrate deploy
pnpm run db:seed
pnpm dev
```

本迁移只新增表、枚举和关系索引，不修改旧业务表字段，属于 expand-only 迁移。回滚应用代码时旧表可保留不使用；若在确认无数据后需要彻底回滚，应先备份，再在独立迁移中按外键逆序删除新表，禁止手工修改生产库。

## 接入真实渠道前必须提供

- 渠道官方 API 文档、应用 ID、回调与权限 Scope。
- 合法账号主体、数据处理目的和员工可见字段。
- Webhook 验签、Token 轮换、限流和错误码规则。
- 消息保留期限、删除请求、附件安全扫描和敏感信息遮罩策略。
- 发消息权限、模板审批、客服工作时间和失败补偿规则。
