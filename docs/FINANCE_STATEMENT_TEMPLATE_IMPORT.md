# 财务账单模板与人工确认导入

本模块用于把合作方提供的账单工作簿安全地转成 **草稿结算单**。它不绑定任何物流商、国家、角色或中文表头；所有工作表名称、表头别名、币种和费用类型均保存为数据库模板配置。

## 操作流程

1. 有 `finance.statement_template.manage` 的人员建立或维护模板。
2. 有 `finance.statement_import.preview` 的人员选择模板、结算对象、结算单号前缀并上传 `.xlsx` / `.xltx`。
3. 系统私有预检：识别配置过的工作表和表头，逐行校验引用编号、金额、币种、重复和公式风险。
4. 有 `finance.statement_import.confirm` **和** `finance.statement.create` 的人员复核零警告、零错误的预检批次。
5. 系统在一个可串行化事务内生成 `DRAFT` 结算单与明细。
6. 对账、审批、过账和付款仍在独立流程中按其各自 Action 执行；本模块不会自动进行这些动作。

## 模板配置示例

```json
{
  "sheets": [
    {
      "key": "statement_lines",
      "sheetAliases": ["Sheet1"],
      "headerScanRows": 12,
      "dataStartOffset": 1,
      "skipIfFirstCellMatches": ["合计", "总计"],
      "statementType": "COD_REMITTANCE",
      "currency": "EUR",
      "currencyScale": 2,
      "statementNoSuffix": "",
      "aliases": {
        "sourceReference": ["业务单号"],
        "trackingReference": ["物流单号"],
        "amount": ["金额"],
        "description": ["说明"]
      }
    }
  ]
}
```

这是示例数据，不是程序逻辑。新增合作方、工作表、表头别名或费用账单，只需创建/修改模板，无需改代码。多工作表模板必须给每个工作表设置不同的 `statementNoSuffix`，以确保会生成不同的结算单号。

## 预检门禁

- 只允许 `.xlsx` / `.xltx`，最大 10 MB；旧式 `.xls` / `.xlt` 必须先由人工另存为 `.xlsx`。
- 文件签名、扩展名、路径与随机私有存储键必须一致。
- 只解析模板明确配置的工作表；未知工作表和未知表头不会被猜测。
- 来源单号、物流单号必须以 **文本** 单元格保存。数值、科学计数法和公式均会拒绝，避免前导零或长编号精度丢失。
- 金额使用严格十进制文本和 `BIGINT` 最小货币单位；不经过 JavaScript 浮点数。
- 缺少必填值、表头歧义、重复映射、重复来源行、过大工作簿和超长字段会产生逐行拒绝或整批拒绝。
- 预检原始文件会计算 SHA-256；同一结算对象和源文件不会静默重复预检。若模板版本、结算单号前缀或账单日期不同，系统返回冲突而不是复用错误结果。

## 权限与隔离

| 动作 | 作用 |
| --- | --- |
| `finance.statement_template.read` | 查看当前范围内模板 |
| `finance.statement_template.manage` | 新增、编辑、停用模板 |
| `finance.statement_import.read` | 查看预检历史和逐行结果 |
| `finance.statement_import.preview` | 上传并创建预检批次 |
| `finance.statement_import.confirm` | 确认干净的预检批次 |
| `finance.statement.create` | 在相同组织范围创建草稿结算单；确认导入时再次校验 |
| `finance.statement_artifact.read` | 下载私有保存的账单原件 |

每个读取、上传、确认和原件下载都使用当前 Membership 的公司、业务板块、部门、站点和有效授权范围。前端是否显示按钮不构成授权。

## 审计、保存与上线要求

- 模板版本、预检人、确认人、源文件哈希、逐行结果和生成的草稿结算单均写 Audit Log。
- 修改模板不会影响历史预检；历史批次保存模板版本快照。
- 本地开发使用受限的本地演示存储，仅用于演示和测试。预发布/生产前必须替换为加密对象存储，并确定保留期限、访问日志、删除策略与恶意软件扫描。
- 确认前会重新读取原文件并校验 SHA-256；源文件丢失或变化时必须重新预检。
- 账单中的姓名、地址、联系电话等个人信息不应在默认列表或审计摘要中回显。权限和脱敏策略应在上线 UAT 中专项复核。
