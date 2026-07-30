# 财务结算基础（Finance Settlement Foundation）

更新时间：2026-07-31
状态：本地 V2 验证完成，等待财务角色配置与 UAT；未部署、未 Push。

## 本批范围与边界

本批把旧 ERP 中“物流回款、COD 回款账单、对账管理、付款记录”的基础能力放入独立的财务结算模块。物流运营继续负责订单导出、物流单号回传、确认发货和物流追踪；不能因此获得供应商账单、回款金额或付款核销的写入权限。

本批仅在本机 V2 Docker 数据库验证：没有连接旧 ERP、旧服务器、银行、支付渠道、真实物流商或任何真实财务数据。

## 已落地的模型与迁移

本地迁移：`202607310004_finance_settlement_foundation`、`202607310005_finance_integrity_hardening`。

- `FinanceCounterparty`：物流商、仓储商或其他结算对象。
- `FinanceStatement` / `FinanceStatementLine`：供应商账单或 COD 回款结算单及逐行明细。
- `FinanceReconciliation`：订单/运单的人工匹配建议与处理结果。
- `FinancePayment` / `FinancePaymentAllocation`：付款或收款草稿、审批、核销与过账。

所有核心记录都绑定法人实体和业务板块，必要时绑定部门、站点和 Membership。金额使用 PostgreSQL `BIGINT` 最小货币单位；API 仅以整数文本传输，不使用 JavaScript 浮点数作为资金事实。迁移包含外键、索引、关键唯一约束和状态枚举。财务事实的组织外键使用 `RESTRICT`，管理员停用组织不会级联删除已形成的结算、对账或付款事实。

## 权限、菜单与审计

迁移写入 18 个稳定的财务 Action：

- `finance.counterparty.read` / `finance.counterparty.manage`
- `finance.statement.read` / `finance.statement.create` / `finance.statement.update`
- `finance.reconciliation.read` / `finance.reconciliation.match` / `finance.reconciliation.resolve`
- `finance.settlement.approve` / `finance.settlement.post` / `finance.settlement.void`
- `finance.payment.read` / `finance.payment.create` / `finance.payment.approve` / `finance.payment.post` / `finance.payment.void` / `finance.payment.allocate`
- `finance.pii.read`（为后续独立敏感字段门禁预留；本批没有新增此类字段）

菜单 `finance-settlements` 的路径是 `/admin/finance-settlements`，依赖 `finance.statement.read`。服务端从当前 Membership 计算业务板块、部门、站点、下属层级和条件 Scope；RolePermission 与未到期的 Access Grant 共同编译为可访问范围。角色名、部门名和业务板块名均不参与硬编码判断。每次鉴权同时校验用户、Membership、法人实体和业务板块仍处于有效状态且组织链一致；停用或跨法人错误归属的旧会话会被服务端拒绝。

**默认拒绝：** 此迁移不会给任何现有角色插入 RolePermission、MenuPermission、AccessGrant 或 DelegationRule。管理员必须在角色权限中显式授予相应 Action 和菜单可见性，页面与 API 才会同时开放。这样不会把财务数据误开给物流、销售或旧角色。

所有结算对象、结算单、逐行对账、付款、核销和状态改变的写操作都会写入 Audit Log。服务端会拒绝跨业务板块读取、没有 Scope 的写入，以及已过期/被撤销授权。

## 已实现状态与业务约束

### 结算单

`DRAFT → RECONCILING → APPROVED → POSTED`

对账中可以标记异常并恢复：`RECONCILING → EXCEPTION → RECONCILING`；作废必须填写原因并保留审计记录。

- 只有草稿可以新增明细。
- 开始对账前，明细金额合计必须等于结算单总额。
- 批准前，每一行必须是 `MATCHED` 或经理由确认的 `IGNORED`。
- 对账建议/处理都在 Serializable 事务中重新验证结算单状态；已完成或已忽略的明细不能再次新增建议。
- 同一订单或运单只能在同一“业务板块 + 结算对象 + 结算类型”中确认一次；不同结算类型可以各自保留一条事实。结算单作废时，其已确认对账会转为 `VOIDED` 并保留审计记录，而不是物理删除。
- `SELF` 创建权限只能写入当前 Membership 自己的部门和站点，不能借由前端提交的部门/站点字段伪造归属；`SUBORDINATES` 只用于读取/管理下属事实，不能借此创建经理名下的下属单位事实。

### 付款与核销

`DRAFT → APPROVED → POSTED`，并支持带原因的审计作废。

- 只有已批准付款可核销。
- 只能核销到同一结算对象、同一币种/精度且已批准的结算单。
- 过账前，全部核销金额必须等于付款总额。

## 页面与接口

`/admin/finance-settlements` 提供三个工作区：

1. 结算单：列表、筛选、稳定分页、草稿创建、逐行录入、对账、审批、过账、作废。
2. 结算对象：查询与创建。
3. 付款与核销：付款草稿、批准、核销、过账、作废。

三个列表统一使用 `createdAt desc, id desc` 的稳定排序和服务端分页。BigInt 在 DTO 中转换为字符串，避免 JSON 序列化丢失精度。

## 本次验证证据

以下均在本机 V2 环境执行：

| Gate | 结果 |
| --- | --- |
| `pnpm prisma:validate` | 通过 |
| `pnpm exec prisma migrate status` | 通过；26 个迁移均已应用到本机 V2 数据库 |
| `pnpm ts-check` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm test` | 31 个测试文件、111 项测试通过 |
| 财务定向测试 | 4 个文件、28 项测试通过（金额、状态机、Scope/Grant、停用组织拒绝、SELF 创建归属） |
| 未登录财务 API | 结算单、结算对象、付款接口均返回 HTTP 401 |
| Docker | PostgreSQL 16 与 Redis 7 均为 healthy |

## 尚未完成（不得误当作本批能力）

- 物流商/银行账单 Excel 或 CSV 模板、预检、确认导入、文件哈希、原文件下载与导入幂等。
- 自动匹配、汇率、金额容差、账单附件/凭证和付款核销到单条账单明细。
- 银行、支付、真实物流商、Ship24 或旧 ERP 的真实数据接入。
- `finance.pii.read` 对未来敏感字段的实际 UI/API 门禁。
- 跨范围财务 API/流程 Playwright 或真实财务 UAT。
- 旧数据迁移；旧系统数据仍视为不可信，只能按白名单、隔离 staging、人工确认后导入。

## 下一批建议

在财务负责人确认权限矩阵后，优先实现“物流商结算模板配置 → 上传预检 → 错误清单 → 人工确认导入 → 对账异常工作台”，并继续保持模板、字段映射、菜单、卡片和角色权限全部配置驱动。
