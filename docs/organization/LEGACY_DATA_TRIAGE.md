# 旧 ERP 数据只读盘点

盘点时间：2026-07-24（Asia/Shanghai）

来源：旧服务器 `/home/ubuntu/zyzxerp` 本机 PostgreSQL 14 数据库。仅执行 Schema 和聚合查询；未修改、删除、回填或导出完整业务内容，未读取或回显密码、Token、完整电话、地址、证件或银行卡信息。

## 结论

旧库应继续视为 `UNTRUSTED LEGACY DATA`。数据量不大，但质量和关联完整性不足，不适合全量迁移。建议采用：

`默认不导入 → 业务负责人选择白名单 → 隔离 staging → 校验/去重 → 人工确认 → 使用 V2 新 ID 导入`

最低建议保留候选：

- 当前有效员工的最小资料和组织归属。
- 确认仍在使用的商品/SKU。
- 尚未完成跟踪、派送、签收或退回的订单。
- 这些订单的物流轨迹、人工备注和必要图片。
- 已确认真实有效且能与订单对账的 COD 批次/明细。

密码哈希、Session、Token、Secret、权限缓存、旧角色授权和服务器临时文件全部禁止迁移。

## 关键数据质量发现

### 订单与物流

- `orders`：1,127 行，创建时间 2026-07-10 至 2026-07-24；其中软删除 39 行。
- 87 行没有物流单号；1,027 行有轨迹；全部有物流单号的记录都有 `tracking_last_checked`。
- 轨迹事件合计 12,899 条；字段存在两套供应商结构，需要导入前标准化。
- 51 张订单有轨迹备注，共 84 条；所有备注值都是普通字符串。
- 1,958 条轨迹事件包含 `handled / handled_at / handled_by`。
- `after_sales_status` 1,127 行全部为空；`after_sales_remark` 和 `after_sales_feedback` 均没有有效数据。
- 订单业务状态与物流状态语义混杂：916 行 `order_status=shipped`，但物流状态中 758 行已送达、160 行异常。
- `sign_status` 包含 `signed`、`unsigned`，也包含无法直接解释的 `z`（151）和 `x`（114）。
- 10 组订单号重复，共 12 条额外重复记录；2 组物流单号重复，共 2 条额外重复记录。
- 93 张订单有第1张旧图片，逐级下降到5张订单有第8张图片；独立 `order_images` 仅20行、涉及3张订单，存在两套附件模型。

### 订单字段完整性

- 商品名称缺8行。
- SKU缺1,125行，只有2行具备SKU。
- 电话字段不为空，但34行包含空白字符，需要标准化。
- 地址缺12行；城市缺980行；邮编缺974行。
- 数量小于等于0共928行，禁止直接作为真实商品数量导入。
- 订单申报币种为空964行；COD币种相对完整（EUR 961、PLN 86、CZK 77、空3）。
- 国家字段存在非标准值：空值、`CZK`、`PLN`、`中国`、`CXL`、`DR`、`123`、全角 `ＰＴ` 等。

### 员工与组织

- `employees`：36行，启用26、停用10；全部36行含旧密码哈希，禁止复制。
- 发现1组重复用户名、1组重复员工编号。
- 2名员工没有 `department_id`。
- `departments`：7行，全部为顶级部门，全部没有经理外键。
- 员工表混合账号、身份、合同、证件、银行和绩效信息，迁移必须字段白名单化。

### 客户

- `customers`：945行，集中创建于2026-07-11至07-13。
- 16组重名、18组标准化电话重复、24组邮箱重复。
- 电话均非空；邮箱缺5行、地址缺15行。
- 旧客户和订单的外键完整性较弱，需要按实际业务重新建立。

### 商品与库存

- `inventory_items`：84行；无负数量、无重复有效SKU、无空SKU。
- `inventory_transactions` 和 `inventory_logs` 均为0行，因此旧库存数量缺少可审计的流水证据。
- 商品表混入 Amazon、仓位、库存和商品主数据字段；V2 应拆分 Product/SKU、Warehouse/Site、Balance、Transaction。

### 物流账单与 COD

- `logistics_bills`：346行，集中创建于2026-07-05约1小时内。
- 340行缺物流单号，346行全部缺 `order_id`；有2组重复物流单号。
- 在没有负责人对账前，建议默认不迁移，仅加密归档。
- `cod_remittance_batches` 12行、`cod_remittance_items` 1,545行，是较大的财务事实候选，但必须先验证订单关联、币种、金额和状态。

### 售后、备注和审计

- `aftersales_daily` 9行，日期2026-07-04至07-12；`aftersales_targets` 0行。
- `customer_followups` 0行；旧库没有形成结构化客户跟进记录。
- 物流人工备注嵌在 `orders.tracking_notes` JSON 中，没有独立作者、时间、处理结论或下次跟进时间。
- `audit_logs` 897行，只覆盖2026-07-05至07-09，而订单持续到07-24；新业务操作没有完整审计覆盖。
- 审计中21行缺 `user_id`。

### 权限

- `role_permissions`：354行，11种角色、68个菜单键。
- `role_action_permissions`：398行，11种角色、44个动作。
- 旧权限按角色名称和菜单分散维护，不含 V2 组织 Membership、Scope 和委托边界；不得整体复制。
- 可将动作名称作为需求参考，角色与授权关系必须在 V2 重新配置。

## 全表清单

### 核心业务与配置

| 表 | 行数 | 建议 | 理由 |
| --- | ---: | --- | --- |
| orders | 1,127 | 待决定/白名单 | 核心事实，但缺SKU、数量、地址结构，状态混乱 |
| customers | 945 | 待决定/去重 | 可能有用，但重复和集中批量创建明显 |
| employees | 36 | 仅最小字段白名单 | 当前员工有用；安全/身份字段禁止复制 |
| departments | 7 | 参考后重建 | 组织结构浅且经理缺失 |
| inventory_items | 84 | 待决定 | SKU相对干净，但库存无流水证据 |
| order_images | 20 | 随订单白名单 | 仅3张订单，且旧订单另有8个图片字段 |
| logistics_bills | 346 | 默认仅归档 | 大部分无单号且全部无订单关联 |
| cod_remittance_batches | 12 | 待财务确认 | 财务事实候选 |
| cod_remittance_items | 1,545 | 随确认批次 | 必须与批次、订单和金额对账 |
| settings | 7 | 只作参考 | V2配置模型不同 |
| role_permissions | 354 | 不迁移 | 只提取需求 |
| role_action_permissions | 398 | 不迁移 | 只提取动作候选 |
| audit_logs | 897 | 加密归档 | 审计覆盖不完整，不导入V2主审计链 |

### 员工运营与财务

| 表 | 行数 | 建议 |
| --- | ---: | --- |
| attendance_records | 14 | 待人事确认 |
| leave_requests | 0 | 不迁移 |
| overtime_requests | 0 | 不迁移 |
| daily_reports | 9 | 仅归档/待确认 |
| daily_goals | 6 | 仅归档/待确认 |
| employee_salaries | 26 | 敏感，默认不迁移 |
| salaries | 64 | 敏感，默认不迁移 |
| salary_structures | 4 | 参考后重建 |
| monthly_payrolls | 64 | 敏感，默认归档 |
| fb_payrolls | 64 | 敏感，默认归档 |
| department_budgets | 21 | 待财务确认 |
| expense_claims | 6 | 待财务确认 |
| payment_records | 5 | 待财务确认 |
| invoices | 15 | 待财务确认 |
| bank_accounts | 9 | 高敏感，禁止默认迁移 |
| employee_loans | 0 | 不迁移 |
| employee_loan_repayments | 0 | 不迁移 |
| commission_details | 0 | 不迁移 |
| employee_certificates | 0 | 不迁移 |
| employee_documents | 0 | 不迁移 |
| employee_exams | 0 | 不迁移 |
| employee_rewards_punishments | 0 | 不迁移 |
| employee_skills | 0 | 不迁移 |
| employee_training | 0 | 不迁移 |

### 售后、任务、文档和通知

| 表 | 行数 | 建议 |
| --- | ---: | --- |
| aftersales_daily | 9 | 仅归档/参考 |
| aftersales_targets | 0 | 不迁移 |
| customer_followups | 0 | 不迁移 |
| tasks | 1 | 默认不迁移 |
| task_logs | 3 | 随任务归档 |
| task_templates | 2 | 只作需求参考 |
| task_comments | 0 | 不迁移 |
| task_notifications | 0 | 不迁移 |
| notifications | 18 | 不迁移 |
| notification_confirmations | 6 | 不迁移 |
| messages | 0 | 不迁移 |
| documents | 0 | 不迁移 |
| document_reads | 0 | 不迁移 |
| work_logs | 0 | 不迁移 |
| approvals | 39 | 待决定/仅归档 |
| approval_actions | 0 | 不迁移 |

### 资产、商品扩展与投放

| 表 | 行数 | 建议 |
| --- | ---: | --- |
| company_assets | 0 | 不迁移 |
| asset_cost_records | 0 | 不迁移 |
| asset_stock_records | 0 | 不迁移 |
| asset_transfer_records | 0 | 不迁移 |
| software_assets | 0 | 不迁移 |
| borrow_agreement_templates | 1 | 只作参考 |
| product_comments | 0 | 不迁移 |
| product_images | 0 | 不迁移 |
| product_listings | 3 | 待业务确认 |
| fb_listings | 3 | 待业务确认 |
| sales_records | 0 | 不迁移 |
| traffic_creatives | 0 | 不迁移 |
| traffic_daily_reports | 1 | 仅归档 |
| traffic_kpi_targets | 0 | 不迁移 |
| interviews | 0 | 不迁移 |
| holidays | 84 | 参考后重新导入标准日历 |

### 缓存、临时与备份性质数据

| 表 | 行数 | 建议 |
| --- | ---: | --- |
| _backup_bulk_update_20260718 | 179 | 加密只读归档，不导入 |
| _backup_shipping_status_20260718 | 444 | 加密只读归档，不导入 |
| order_delete_logs | 0 | 不迁移 |
| inventory_transactions | 0 | 不迁移 |
| inventory_logs | 0 | 不迁移 |

## 售后物流备注迁移原则

旧数据中84条轨迹备注值得作为候选证据保留，但不能直接塞入 V2 的新跟单表。

建议转换：

1. 每个白名单订单先导入物流轨迹，使用 `legacy_source_id` 和供应商事件键去重。
2. 旧 `tracking_notes` 的键尝试匹配标准化轨迹事件。
3. 备注值导入为 `LogisticsFollowUp.note`，来源标记 `LEGACY_IMPORT`。
4. 旧数据没有可靠作者/时间时保持为空或标记“未知”，禁止伪造。
5. `handled` 字段作为历史处理线索，不自动等同于 V2 已解决。
6. 新物流同步只能追加/更新供应商轨迹，不能覆盖人工跟单记录。

## 默认禁止导入

- 密码哈希、Token、Secret、Session、权限缓存。
- 员工身份证、护照、银行卡、证件照片等非当前业务必需高敏感数据。
- 停用/测试账号，除非人事负责人明确确认。
- 空表、缓存、通知、临时任务和旧备份表。
- 无法关联订单的物流账单。
- 数量、金额、币种、国家或组织归属无法确认的数据。

## 数据快照与清理边界

旧系统在V2验收前保持不变。未来下线前：

- 创建加密只读数据库快照和文件清单。
- 记录校验和、创建时间、保管人和恢复测试结果。
- 明确保留期限与销毁审批。
- 未获得创始人单独书面确认，不删除旧库或服务器文件。
