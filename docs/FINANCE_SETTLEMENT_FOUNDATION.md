# 财务结算基础（Finance Settlement Foundation）

更新时间：2026-07-31
状态：已具备本地财务结算基础；本轮“已批准付款核销受控替换”待最终门禁与财务 UAT；未部署、未 Push。

## 本批范围与边界

本批把旧 ERP 中“物流回款、COD 回款账单、对账管理、付款记录”的基础能力放入独立的财务结算模块。物流运营继续负责订单导出、物流单号回传、确认发货和物流追踪；不能因此获得供应商账单、回款金额或付款核销的写入权限。

本批仅在本机 V2 Docker 数据库验证：没有连接旧 ERP、旧服务器、银行、支付渠道、真实物流商或任何真实财务数据。

## 已落地的模型与迁移

已验证的本地迁移：`202607310004_finance_settlement_foundation`、`202607310005_finance_integrity_hardening`、`202607310006_finance_statement_imports`、`202607310007_finance_statement_import_cancellation`、`202607310008_finance_control_policies`。

本地 `erp_v2` 另已应用 `202607310013_finance_payment_allocation_adjustments`、`202607310014_harden_finance_allocation_adjustment_guards` 与 `202607310015_freeze_finance_allocation_adjustment_approval_facts`。它们只在本地环境验证，绝不等同于已部署生产或已完成真实财务岗位验收。

- `FinanceCounterparty`：物流商、仓储商或其他结算对象。
- `FinanceStatement` / `FinanceStatementLine`：供应商账单或 COD 回款结算单及逐行明细。
- `FinanceReconciliation`：订单/运单的人工匹配建议与处理结果。
- `FinancePayment` / `FinancePaymentAllocation`：付款或收款草稿、审批、核销与过账。
- `FinancePaymentAllocationAdjustment` / `FinancePaymentAllocationEffect`：对仍为 `APPROVED` 的付款核销发起受控整笔替换，以及保留原核销事实的 `REVERSAL` 效果。

所有核心记录都绑定法人实体和业务板块，必要时绑定部门、站点和 Membership。金额使用 PostgreSQL `BIGINT` 最小货币单位；API 仅以整数文本传输，不使用 JavaScript 浮点数作为资金事实。迁移包含外键、索引、关键唯一约束和状态枚举。财务事实的组织外键使用 `RESTRICT`，管理员停用组织不会级联删除已形成的结算、对账或付款事实。

## 权限、菜单与审计

核心财务 Action（角色、菜单、Scope 与附加授权的关系均由数据库配置）包括：

- `finance.counterparty.read` / `finance.counterparty.manage`
- `finance.statement.read` / `finance.statement.create` / `finance.statement.update`
- `finance.reconciliation.read` / `finance.reconciliation.match` / `finance.reconciliation.resolve`
- `finance.settlement.approve` / `finance.settlement.post` / `finance.settlement.void`
- `finance.payment.read` / `finance.payment.create` / `finance.payment.approve` / `finance.payment.post` / `finance.payment.void` / `finance.payment.allocate`
- `finance.allocation_adjustment.read` / `finance.allocation_adjustment.request` / `finance.allocation_adjustment.approve` / `finance.allocation_adjustment.apply` / `finance.allocation_adjustment.cancel`
- `finance.pii.read`（为后续独立敏感字段门禁预留；本批没有新增此类字段）
- `finance.control_policy.read` / `finance.control_policy.manage`

菜单 `finance-settlements` 的路径是 `/admin/finance-settlements`，依赖 `finance.statement.read`；菜单 `finance-allocation-adjustments` 的路径是 `/admin/finance-allocation-adjustments`，依赖 `finance.allocation_adjustment.read`。服务端从当前 Membership 计算业务板块、部门、站点、下属层级和条件 Scope；RolePermission 与未到期的 Access Grant 共同编译为可访问范围。角色名、部门名和业务板块名均不参与硬编码判断。每次鉴权同时校验用户、Membership、法人实体和业务板块仍处于有效状态且组织链一致；停用或跨法人错误归属的旧会话会被服务端拒绝。

**默认拒绝：** 此迁移不会给任何现有角色插入 RolePermission、MenuPermission、AccessGrant 或 DelegationRule。管理员必须在角色权限中显式授予相应 Action 和菜单可见性，页面与 API 才会同时开放。这样不会把财务数据误开给物流、销售或旧角色。

所有结算对象、结算单、逐行对账、付款、核销和状态改变的写操作都会写入 Audit Log。服务端会拒绝跨业务板块读取、没有 Scope 的写入，以及已过期/被撤销授权。

### 财务岗位分离

`FinanceControlPolicy` 为每个业务板块保存制单、审批、过账的岗位分离规则。缺失配置时采用严格默认：结算单和付款均要求制单人、审批人、过账人为不同员工。服务端在 Serializable 状态变更事务内按 `userId` 比较，而不是只比较 Membership，因此同一员工无法通过切换多个岗位上下文绕过。策略本身由 `finance.control_policy.read` / `finance.control_policy.manage` 动态授权，且仅接受业务板块级或全局 Scope；详见 [FINANCE_SEGREGATION_OF_DUTIES.md](FINANCE_SEGREGATION_OF_DUTIES.md)。

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

#### 已批准核销的受控替换

仅未过账的 `APPROVED` 付款核销可以发起替换申请，状态为 `PENDING → APPROVED → APPLIED`，或以 `REJECTED` / `CANCELLED` 结束。`APPLIED` 在同一 Serializable 事务内保留原核销、创建同一付款且金额相同的替代核销，并对原核销写入一条 `REVERSAL` 效果；V1 不支持局部调整。

原付款、原结算单和替代结算单都必须仍为 `APPROVED`，且替代结算单必须不同、组织/结算对象/币种/精度一致。服务端按原付款、原结算单和替代结算单三者分别执行 Action + Scope + Membership 校验；申请、审批、执行三人默认均为不同稳定 `userId`。原核销和反向效果均由数据库触发器保护为不可变，替代结算单的有效核销额在可重试的 Serializable 事务内重新计算，防止并发超额。

`POSTED` 付款或结算单一律不进入本流程；直接 `POSTED → void` 仍被拒绝。已过账更正、总账冲销和会计分录尚未实现，不能因本节的受控替换而视为已经具备。

## 页面与接口

`/admin/finance-settlements` 提供三个工作区：

1. 结算单：列表、筛选、稳定分页、草稿创建、逐行录入、对账、审批、过账、作废。
2. 结算对象：查询与创建。
3. 付款与核销：付款草稿、批准、核销、过账、作废。
4. 核销调整：仅对已批准未过账核销发起、审批、取消和执行受控替换；页面与 API 均按动态 Action + Scope 开放。

三个列表统一使用 `createdAt desc, id desc` 的稳定排序和服务端分页。BigInt 在 DTO 中转换为字符串，避免 JSON 序列化丢失精度。

## 本次验证证据

以下均在本机 V2 环境执行：

| Gate | 结果 |
| --- | --- |
| `pnpm run test` | 34 个测试文件、124 项测试通过 |
| `pnpm exec prisma validate` | 通过 |
| `pnpm run ts-check` | 通过 |
| `pnpm run lint` | 通过 |
| `pnpm run build` | 通过；路由包含财务内控页面与 API |
| 岗位分离定向测试 | 5 项测试通过；含同一员工切换 Membership 仍被拒绝 |
| 本机临时 UAT | 同一员工使用第二个 Membership 审批自己创建的结算单/付款，均返回 `FINANCE_MAKER_CHECKER_REQUIRED`；临时数据清理完成 |

上述证据为既有财务基础与岗位分离门禁；以下为本轮核销受控替换的独立最终证据。

### 2026-07-31 受控核销替换最终验证

- 本地迁移已到 `202607310015_freeze_finance_allocation_adjustment_approval_facts`，`prisma migrate status` 显示 36 个迁移全部为最新状态。
- 本地 PostgreSQL 回滚 UAT 完成了“已批准付款 + 原核销 + 不同的替代结算单 → 审批 → 执行 → 替代核销 + 反向效果”的完整链路。校验通过后事务主动回滚，调整、效果和核销行数均未留存。
- 替代结算单选项现在返回并显示可用余额，对不足以覆盖调整金额的选项做界面预防；服务端执行时仍在 Serializable 事务内重算余额，前端不是安全信任边界。
- 本批检查通过：35 个测试文件 / 131 项测试，TypeScript、ESLint、Prisma schema / 迁移状态及 Next.js 生产构建全部通过。
- 仍不接受 `POSTED` 付款或结算单的直接更正；需要独立的总账冲销与会计分录模块才能解决这一边界。

## 尚未完成（不得误当作本批能力）

- 真实物流商/银行账单的字段字典确认、模板配置和人工 UAT；当前已具备配置化模板、私有预检、确认导入、文件哈希、取消预检和幂等基础，但未接真实账单。
- 自动匹配、汇率、金额容差、账单附件/凭证和付款核销到单条账单明细（当前为付款到结算单级；已批准未过账核销可做受控整笔替换）。
- 已过账付款或结算单的更正、总账冲销与会计分录；当前仍安全拒绝直接作废或通过核销替换绕过过账锁定。
- 银行、支付、真实物流商、Ship24 或旧 ERP 的真实数据接入。
- `finance.pii.read` 对未来敏感字段的实际 UI/API 门禁。
- 跨范围财务 API/流程 Playwright 或真实财务 UAT。
- 旧数据迁移；旧系统数据仍视为不可信，只能按白名单、隔离 staging、人工确认后导入。

## 下一批建议

在财务负责人确认权限矩阵后，优先完成已批准核销受控替换的最终门禁与真实财务 UAT；其后独立实现已过账付款/结算单的更正、总账冲销和会计分录，并继续保持模板、字段映射、菜单、卡片和角色权限全部配置驱动。
