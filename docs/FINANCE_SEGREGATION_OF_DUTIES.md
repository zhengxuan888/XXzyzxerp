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

管理员可在“财务内控”页面按业务板块配置六个开关。允许关闭只是放宽岗位分离，不会自动授予新的业务操作权限。每次保存会写入 `AuditLog`。

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
- 审计详情保存变更原因、变更前后六项开关和版本前后值；不记录任何凭据或敏感业务内容。
- 页面增加版本提示、变更原因输入与无改动禁用保存，避免无意义的配置写入。

## 2026-07-31：对账建议岗位分离与审批阻断

- 新增业务板块级开关 `requireReconciliationResolverDifferentFromCreator`，默认开启且缺失配置时仍严格拒绝。它按稳定 `userId` 比较，不能通过切换 Membership 绕过。
- 创建对账建议的员工不能自行确认、拒绝或忽略该建议；服务端在事务内再次读取建议、当前策略和创建人，再执行状态更新。
- “忽略”现在只忽略一个候选，不再把明细视为已对账。该明细回到未匹配状态，可提交新的候选，但在获得确认匹配前始终不能批准结算单。
- 结算单审批现在只接受所有明细均为 `MATCHED`；旧的 `IGNORED`、未匹配和金额差异都属于审批阻断项。

## 当前边界与后续项

本批先覆盖结算单和付款的“制单/审批/过账”三段链路。后续应按同一模式增加：对账建议的创建人与确认人分离、核销人与付款过账人分离、已过账事实的受控冲销/作废双人复核，以及可配置的金额阈值审批。

这些后续项没有在本批被宣称为已完成；在上线前需由财务负责人确认实际岗位矩阵和例外处理流程。
