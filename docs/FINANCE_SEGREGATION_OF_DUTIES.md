# 财务岗位分离（四眼原则）

状态：本地实现与验证完成；未部署、未 Push、未连接任何生产或外部金融系统。

## 目标

财务权限决定某人能否执行动作；本规则再确保同一员工不能借由多岗位、切换业务上下文或误配权限，独自完成“制单 → 审批 → 过账”的关键链路。

规则不判断角色名称、部门名称或业务板块名称。每个业务板块都可在数据库中保存自己的 `FinanceControlPolicy`，并由 Action + Scope + Membership 决定谁能查看或修改。

## 默认与配置

没有独立配置行的业务板块采用最严格默认值：

| 受控对象 | 默认控制 |
| --- | --- |
| 结算单 | 制单人 ≠ 审批人；制单人 ≠ 过账人；审批人 ≠ 过账人 |
| 付款 | 制单人 ≠ 审批人；制单人 ≠ 过账人；审批人 ≠ 过账人 |
| 已批准付款核销调整 | 申请人 ≠ 审批人；申请人 ≠ 执行人；审批人 ≠ 执行人 |

管理员可在“财务内控”页面按业务板块配置十二个开关。允许关闭只是放宽岗位分离，不会自动授予新的业务操作权限。每次保存会写入 `AuditLog`。

配置动作：

- `finance.control_policy.read`
- `finance.control_policy.manage`

这两个动作只接受 `ALL` 或 `BUSINESS_UNIT` Scope；部门、站点、下属或个人 Scope 不能修改影响整个业务板块的财务规则。

## 服务端执行顺序

每次结算单或付款审批/过账均由服务端在 Serializable 事务内执行：

1. 依据当前 Membership 验证 Action + Scope。
2. 重新读取当前记录、状态和创建/审批 Membership。
3. 通过 Membership 关联取得其 `userId`，按**员工账号**而非 Membership ID 比较，阻止同一员工切换岗位上下文绕过。
4. 读取当前业务板块的 `FinanceControlPolicy`；没有配置时使用严格默认。
5. 在 CAS 状态更新前拒绝违反四眼原则的操作，并保留原有 Audit Log。

因此前端隐藏按钮、旧会话、手工构造 API 请求或不同 Membership 都不能跳过这道检查。

## 验证证据（2026-07-31 最新）

| Gate | 命令或实测 | 结果 |
| --- | --- | --- |
| 纯规则单元测试 | `finance-segregation-policy.test.ts` | 5/5 通过；覆盖严格默认、完整配置、制单/审批/过账分离与同一员工多 Membership 绕过拒绝 |
| 权限 Scope 门禁 | `permission.test.ts` | 14/14 通过；财务内控配置只接受 `ALL` 或 `BUSINESS_UNIT` Scope |
| 全量单元/集成测试 | `pnpm run test` | 34 个文件、124 项通过 |
| 类型/静态检查 | `pnpm run ts-check`、`pnpm run lint`、`pnpm exec prisma validate` | 全部通过 |
| 生产构建 | `pnpm run build` | 通过，包含 `/admin/finance-controls` 与 `/api/mvp/finance/control-policy` |
| 本机真实服务层 UAT | 临时创建第二个 Membership，并以同一 `userId` 尝试审批自己创建的结算单和付款 | 两次均被 `FINANCE_MAKER_CHECKER_REQUIRED` 拒绝；测试记录已清理 |

迁移 `202607310008_finance_control_policies` 已仅应用到本机 `erp_v2` 数据库。策略在每次状态变更的 Serializable 事务内读取，因此保存、撤销或修改规则后不依赖权限缓存刷新即可生效。

## 2026-07-31：内控配置原子变更

- `FinanceControlPolicy` 新增单调 `version`。保存时必须提交页面读取到的版本与 3–500 字的变更原因；旧版本写入返回 `409 FINANCE_CONTROL_POLICY_STALE`，不会覆盖他人的更新。
- 规则更新、版本递增和 `AuditLog` 写入均在同一个 PostgreSQL `Serializable` 事务中执行。审计写入失败时，规则更新会一起回滚。
- 审计详情保存变更原因、变更前后十二项开关和版本前后值；不记录任何凭据或敏感业务内容。
- 页面增加版本提示、变更原因输入与无改动禁用保存，避免无意义的配置写入。

## 2026-07-31：对账建议岗位分离与审批阻断

- 新增业务板块级开关 `requireReconciliationResolverDifferentFromCreator`，默认开启且缺失配置时仍严格拒绝。它按稳定 `userId` 比较，不能通过切换 Membership 绕过。
- 创建对账建议的员工不能自行确认、拒绝或忽略该建议；服务端在事务内再次读取建议、当前策略和创建人，再执行状态更新。
- “忽略”现在只忽略一个候选，不再把明细视为已对账。该明细回到未匹配状态，可提交新的候选，但在获得确认匹配前始终不能批准结算单。
- 结算单审批现在只接受所有明细均为 `MATCHED`；旧的 `IGNORED`、未匹配和金额差异都属于审批阻断项。

## 2026-07-31：付款核销四眼原则、幂等与不可变记录

- 新增两个业务板块级开关：`requirePaymentAllocatorDifferentFromCreator` 与 `requirePaymentAllocatorDifferentFromApprover`。缺少策略记录时按严格默认生效：付款制单人、审批人与核销人必须是不同的稳定 `userId`，切换 Membership 不能绕过。
- 核销不再限制“同一付款 + 同一结算单”只能一笔。每一次合法的部分核销都保存为独立、不可变的记录，因此先核销 `40/100` 后可以安全补录 `60/100`，不会卡住付款过账。
- 每笔核销要求前端传入一次性 `idempotencyKey`。网络重试使用同一键会返回同一条记录；同一键但金额或结算单不同则返回 `409 ALLOCATION_IDEMPOTENCY_KEY_REUSED`，不会重复入账。
- 数据库层新增 `(paymentId, idempotencyKey)` 唯一约束和不可变触发器，直接 `UPDATE` 或 `DELETE` 核销记录会被拒绝。仍处于 `APPROVED` 且未过账的核销可走下述受控替换流程；任何修正都不能抹掉原始财务事实。
- 已过账的付款和结算单不再接受直接“作废”状态转换，前端也不再展示该入口；已过账纠正尚未实现为直接写操作。

### 本地验证

| Gate | 证据 | 结果 |
| --- | --- | --- |
| 付款核销岗位分离 | `finance-segregation-policy.test.ts` | 制单人、审批人核销均被拒绝；第三人可执行，8/8 通过 |
| 已过账状态锁定 | `finance-state.test.ts` | `POSTED → void` 被状态机拒绝，6/6 通过 |
| 本地 PostgreSQL 核销 UAT | 临时事务内创建两笔 `40 + 60` 的同付款/同结算单核销、重放幂等键、尝试更新记录 | 多笔部分核销成功；重复键被唯一约束拒绝；不可变触发器拒绝更新；事务整体回滚，无演示数据残留 |
| 数据库迁移 | `202607310011_finance_payment_allocation_controls`、`202607310012_finance_payment_allocation_immutability` | 仅已应用到本机 `erp_v2`，数据库状态最新 |

### 尚未完成的边界

已批准但未过账的付款核销受控替换已具备实现；**已过账事实**的更正、总账冲销和会计分录仍未实现。上线前必须补齐独立的“已过账冲销/调整申请 → 不同员工审批 → 不同员工过账”流程、反向不可变会计效果、重复冲销拒绝和真实岗位 UAT；在此之前，已过账单据只能保留和审计，不能在系统内修正。

## 2026-07-31：已批准付款核销的受控替换

该流程只处理仍为 `APPROVED` 的付款核销错误，不是已过账事实的总账冲销，也不会修改或删除原核销记录。

### 流程与业务边界

1. 申请创建为 `PENDING`；审批/拒绝和取消均须通过对应的动态 Action + Scope 校验。申请可被 `APPROVED` 或 `REJECTED`，处于 `PENDING`/`APPROVED` 时可 `CANCELLED`；默认岗位分离要求审批人与申请人不同。
2. 仅 `APPROVED` 的申请可以 `APPLIED`。执行时原核销保留不变，为同一付款创建一条金额相同、指向**不同**且仍为 `APPROVED` 的替代结算单的新核销，并写入一条 `REVERSAL` 核销效果。
3. 本批仅支持整笔替换，不支持局部调整；替代结算单必须与原付款属于同一法人实体、业务板块、结算对象、币种和精度。
4. 申请、原付款、原结算单和替代结算单在申请、审批、执行时都会重新读取并确认仍为 `APPROVED`。任一对象已经 `POSTED` 或状态已变化，服务端拒绝执行。
5. `REJECTED` 与 `CANCELLED` 不产生财务效果；`APPLIED` 后原核销仍是审计事实，其有效金额由“原金额减去反向效果”计算，不能变为负数。

### 动态授权、范围与岗位分离

- 动作键为 `finance.allocation_adjustment.read`、`request`、`approve`、`apply`、`cancel`；菜单 `finance-allocation-adjustments` 与 `/admin/finance-allocation-adjustments` 仅以这些数据库配置的动作和菜单权限开放，不按角色、部门或业务板块名称硬编码。
- 迁移不会为任何角色自动新增 RolePermission、MenuPermission 或 Access Grant。管理员必须显式配置动作、菜单及可转授权范围。
- 每个读取和写入都按当前 Membership 的 Action + Scope + 组织归属校验原付款、原结算单和替代结算单；跨业务板块、跨部门无范围或无权限请求统一拒绝，避免通过 ID 枚举数据。
- `FinanceControlPolicy` 默认开启三项分离：`requireAllocationAdjustmentApproverDifferentFromRequester`、`requireAllocationAdjustmentApplierDifferentFromRequester`、`requireAllocationAdjustmentApplierDifferentFromApprover`。三者均按稳定 `userId` 比较，切换 Membership 不能绕过。

### 不可变性、并发与审计

- 原 `FinancePaymentAllocation` 继续由数据库不可变触发器保护；`FinancePaymentAllocationEffect` 仅允许插入一次有效 `REVERSAL`，不允许更新或删除。
- 数据库触发器同时校验申请状态迁移、组织/人员归属、替代核销与申请事实一致，并以延迟约束确保 `APPLIED` 申请恰有一条反向效果。
- 执行在可重试的 PostgreSQL `Serializable` 事务中重新计算替代结算单的有效核销额；容量不足或并发冲突会受控拒绝，不会让替代结算单超额核销。
- 申请、审批、拒绝、取消和执行均在同一事务写入 `AuditLog`，记录命令、前后状态、原核销、替代结算单/核销、金额与原因，不记录凭据。

### 本轮最终门禁

- 本地 `erp_v2` 已应用 `202607310013_finance_payment_allocation_adjustments`、`202607310014_harden_finance_allocation_adjustment_guards` 与 `202607310015_freeze_finance_allocation_adjustment_approval_facts`。最后一项迁移在数据库层冻结 `APPROVED` 后的审批人、审批时间和审批理由，不可在取消或执行时被篡改。
- 回滚式 PostgreSQL UAT 已验证：申请人、审批人与执行人为三名不同员工时，`PENDING → APPROVED → APPLIED` 能在同一事务写入替代核销与 `REVERSAL` 效果；故意篡改既有审批事实会被数据库拒绝；事务完整回滚，无演示财务数据残留。
- 完整门禁为 `pnpm run test` 35 个测试文件 / 131 项通过，`pnpm run ts-check`、`pnpm run lint`、`pnpm exec prisma validate`、`pnpm exec prisma migrate status` 和 `pnpm run build` 全部通过。
- 操作仍为默认拒绝：管理员必须在数据库驱动的角色、菜单与协作授权中显式配置 `finance.allocation_adjustment.*` 及对应菜单。本次没有为演示角色自动增权。
- 仍需在真实财务岗位 UAT 中补足 API 跨范围、权限矩阵与并发容量的端到端用例；`POSTED` 事实的总账冲销/更正仍是上线阻断项，并未因本次功能而解禁。

## 当前边界与后续项

本批已覆盖结算单和付款的“制单/审批/过账”三段链路、对账建议岗位分离、付款核销岗位分离，以及已批准核销的受控替换。后续重点是：已过账事实的受控冲销/作废双人复核与总账会计分录、真实岗位 UAT，以及可配置的金额阈值审批。

这些后续项没有在本批被宣称为已完成；在上线前需由财务负责人确认实际岗位矩阵和例外处理流程。
