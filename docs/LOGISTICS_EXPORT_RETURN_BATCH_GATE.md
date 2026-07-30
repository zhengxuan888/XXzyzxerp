# 物流商导出与回传批次门禁

## 目标

把旧 ERP 中“导出给物流商、物流商回传单号、再发货”的日常操作保留为更安全、可配置、可追溯的流程。物流商名称、国家、模板列、回传列名、业务板块和部门都来自数据库配置，不以代码分支判断。

## 正式流程

```text
核单通过
  → 在待发货工作台选择明确订单
  → 选择已启用的物流商模板并创建导出批次
  → 下载私有导出文件；人工发送给物流商并标记“已发送”
  → 上传物流商回传表，并绑定原导出批次
  → 服务端逐行预检，输出可回填 / 警告 / 拒绝
  → 有权限人员确认回填物流单号
  → 订单仍为待发货，Shipment 仍为 PENDING
  → 上传出货凭证
  → 点击“确认发货”
  → 订单进入物流追踪 / 售后工作台
```

**回填运单号不等于确认发货。** 回传不会自动把订单改成已发货，也不会在未上传出货凭证时进入物流追踪。

## 配置方式

每个物流商模板可由有 `logistics_template.manage` 权限的人员在页面中配置：

- 模板编码、名称、承运商显示名、启用状态；
- 导出工作表名称；
- 导出列：标准订单字段，或 `custom:...` 自定义订单字段；
- 回传表表头扫描行数（1–20）；
- 原单号、物流单号、承运商、回传状态的列名别名；
- 模板版本。编辑配置会提升版本，后续批次快照新版本；旧批次保留原版本快照。

因此新增国家、物流商、模板或字段映射不需要修改角色、部门或业务板块代码。

## 数据与审计

每次导出会创建：

- `LogisticsExportBatch`：模板版本、订单数量、状态、发送备注；
- `LogisticsExportBatchItem`：订单快照、可用于回传匹配的行哈希；
- `LogisticsBatchArtifact`：私有导出文件、SHA-256、文件元数据；
- `LogisticsReturnImportBatch`：回传文件、原导出批次、预检/确认状态；
- `LogisticsReturnImportRow`：每一行的匹配、警告、拒绝或已导入结果。

导出、标记发送、预检回传、确认回填和原始文件读取均写入 Audit Log。相同回传文件在同一个导出批次中按 SHA-256 幂等，避免重复导入。

## 安全与权限

所有接口在服务端使用当前 Membership 的 Action + Scope 校验；不信任前端传来的业务板块、部门、订单或批次 ID。

| 动作 | 用途 |
| --- | --- |
| `logistics.export_batch.read` | 查看本人范围内的导出/回传批次 |
| `logistics.export_batch.create` | 从明确选择的订单创建导出批次 |
| `logistics.export_batch.dispatch` | 人工标记已发送给物流商 |
| `logistics.return_import.preview` | 上传并预检回传文件 |
| `logistics.return_import.confirm` | 确认写入已预检的物流单号 |
| `logistics.batch_artifact.read` | 下载范围内的私有原始文件 |

这些动作可通过 Role Permission、Membership、Access Grant 与 Delegation Rule 配置，不能仅靠前端隐藏按钮。

## 兼容边界

- 当前安全支持 `.xlsx` 与 `.xltx`；会校验文件签名、大小和随机私有存储键。
- 旧 `.xls` / `.xlt` 目前会明确拒绝，并提示先由人工在 Excel 中另存为 `.xlsx`。这是为了避免物流单号科学计数法、前导零和编码被静默破坏。
- 首批已审计的鸿亚回传表为“原单号 → 转单号”格式；西葡、东欧、罗马尼亚等模板字段更多且不同，必须先在模板管理中配置后使用。
- 本阶段不连接真实物流商、Ship24、旧服务器或生产数据库，也不自动向物流商发送文件。

## 验收证据（本地）

- `pnpm validate`：TypeScript、ESLint、95 个 Vitest 单测、Prisma schema 校验均通过。
- `pnpm build`：Next.js 生产构建通过。
- `pnpm exec playwright test e2e/logistics-batch.spec.ts --project=chromium`：物流批次页面入口与“回填运单号不等于确认发货”门禁通过。
- `pnpm exec prisma migrate deploy --schema prisma/schema.prisma`：仅本地 V2 数据库迁移成功。

## 上线前仍需业务确认

1. 每家真实物流商的 Excel 样表、列含义、匹配键和允许的字段格式；
2. 是否允许承运商回传同一订单多条运单、拆包或换单；
3. 哪些岗位可标记“已发送”、预检和确认回填；
4. 何时接入真实 Ship24 Key 与真实物流商传输方式。
