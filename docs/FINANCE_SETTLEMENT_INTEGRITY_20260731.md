# 财务结算完整性加固记录（2026-07-31）

## 本次目的

在不接入旧 ERP、银行、支付、物流商或任何真实财务数据的前提下，为 V2 本地财务结算基础补齐上线前的 P0 保护。此次只作用于 V2 本地/测试迁移，不部署、不 Push。

## 已加固的控制

| 风险 | 控制措施 | 验证方式 |
| --- | --- | --- |
| 停用公司/业务板块后，旧会话仍可访问 | 每次服务端鉴权校验 User、Membership、Legal Entity、Business Unit 均有效，并校验 Membership 与业务板块法人一致 | 权限单测覆盖停用业务板块、停用法人实体时拒绝访问 |
| 停用业务上下文仍能被切换或显示 | 上下文切换接口复用同一有效组织校验；侧栏仅显示组织链完整且有效的 Membership | 无效上下文不能重新签发会话，菜单不再列出 |
| `SELF` 权限可伪造部门/站点归属 | 财务创建动作按 Scope 重新校验；SELF 只允许当前 Membership、部门和站点，SUBORDINATES 不能用于创建 | 财务 Scope 单测覆盖同部门/站点允许、跨部门、跨站点和伪造 owner 拒绝 |
| 同一订单/运单重复进入同一结算领域 | `FinanceReconciliation` 写入结算领域，数据库局部唯一索引阻止同一业务板块、结算对象、结算类型的重复已确认订单/运单 | Serializable 服务层重检 + PostgreSQL partial unique index |
| 作废时抹掉对账事实 | 作废会将已确认对账转为 `VOIDED`，写审计日志；不物理删除 | 状态机和服务层约束 |
| 删除组织连带删除财务事实 | 财务组织外键由级联删除改为 `RESTRICT`；管理删除继续采用软停用 | V2 migration `202607310005_finance_integrity_hardening` |
| 已付款核销被直接作废破坏账实 | 存在核销分配的结算单或付款不允许直接作废；需要后续受控冲销流程 | 服务端返回冲突，保留事实与审计 |

## 重要业务边界

- 同一订单可分别出现在例如 COD 回款与运费结算中；但同一结算对象、同一结算类型中不能重复“已确认”。
- 这是一项严格的安全默认值，不支持隐式拆分/部分二次结算。若未来确有业务需要，必须新增可审计的调整/冲销模型，而不能放松唯一约束。
- 跨表法人、业务板块、币种与结算对象一致性目前由服务层事务校验；本批没有引入数据库触发器。导入功能上线前仍需增加 staging 预校验和人工确认。
- 财务菜单与 Action 仍保持默认拒绝：只有获得相应 `MenuPermission` 与 Action 的人员才同时看到页面并可调用 API。

## 本地验证证据

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run src/lib/__tests__/permission.test.ts src/lib/__tests__/finance-access.test.ts src/lib/__tests__/finance-money.test.ts src/lib/__tests__/finance-state.test.ts` | 4 文件，28/28 通过 |
| `pnpm test` | 31 文件，111/111 通过 |
| `pnpm ts-check` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm prisma:validate` | 通过 |
| `pnpm exec prisma migrate deploy` | 已应用至本机 V2 PostgreSQL；未连接任何旧库或生产库 |

## 尚未开放

- 物流商/银行账单 Excel 或 CSV 导入、模板识别、自动匹配、差异容忍、原件保管与回滚。
- 真实支付、银行、Ship24、飞书或物流商连接。
- 财务专用 PII 字段展示与 `finance.pii.read` 的 UI/API 门禁。
- 调整单、冲销单、退款和付款撤销后的受控反向分录。
- 财务负责人 UAT、真实权限矩阵确认和选择性旧数据迁移。
