# ERP V2 全量验收与加固报告

日期：2026-07-24
范围：择优臻选公司级 ERP V2 Full MVP；当前以 Facebook COD 首个业务板块验证通用组织隔离能力
证据来源：`COZE_LEGACY_BUG_ANALYSIS.md`、`EMPLOYEE_FEEDBACK_REQUIREMENTS.md`、当前源码、PostgreSQL 本地库、Vitest 与 Playwright。
边界：未连接真实渠道、未导入旧生产数据、未部署、未 Push。

## 结论

本轮关闭了两个会直接影响上线的基础问题：

1. 中文用户名被写入 HTTP Header，导致请求在 Proxy 阶段发生 ByteString 异常并返回 500。
2. 部分 `ALL` Scope 列表 API 会忽略当前业务上下文并跨业务板块读取数据。

修复后，中文账号可正常登录和访问；受限账号的菜单、页面直链和 API 同时拒绝。客户、商品、订单、库存、物流、费用和统一收件箱采用服务端分页、当前业务板块过滤及稳定唯一二级排序。

## Gate 与证据

| Gate | 自动化证据 | 结果 |
|---|---|---:|
| 中文用户名登录 | JWT 中文编码单测；`测试员工_中文` Playwright 登录 | 通过 |
| Session 签发/验签 | 正常 Token 与篡改 Token 单测 | 通过 |
| 生产 Session Secret | 生产环境缺失 `SESSION_SECRET` 时主动失败 | 通过 |
| 无权限菜单 | 受限账号不存在统一收件箱菜单 | 通过 |
| 页面详情直链 | 受限账号访问 `/admin/inbox` 重定向工作台 | 通过 |
| API 无权限拒绝 | 受限账号 `/api/mvp/inbox` 返回 403 | 通过 |
| 业务板块隔离 | 核心业务 API 强制使用当前 Membership 的 `businessUnitId` | 通过 |
| 部门隔离 | Permission 与 Inbox Scope 单测覆盖同板块跨部门拒绝 | 通过 |
| Access Grant | 生效开放、撤销/到期关闭、超范围转授权拒绝单测 | 通过 |
| 客户分页/搜索 | 统一 `{ok,data,meta}`、`createdAt + id`、`q` | 通过 |
| 商品分页/搜索 | 统一 `{ok,data,meta}`、`createdAt + id`、`q` | 通过 |
| 订单分页/筛选 | 当前板块、`createdAt + id`、`q/status` | 通过 |
| 库存分页 | 当前板块、`updatedAt + id` | 通过 |
| 物流分页/筛选 | 当前板块、`createdAt + id`、`q/status` | 通过 |
| 费用分页/筛选 | 当前板块、`createdAt + id`、`category` | 通过 |
| 收件箱分页/筛选 | 当前板块/部门 Scope、`lastMessageAt + id`、`status` | 通过 |
| 分页重复 | 核心 API 第 1/2 页 ID 不重复 Playwright | 通过 |
| 金额精度 | 非负安全整数单测；费用小数分值 API 返回 400 | 通过 |
| 库存防负 | PostgreSQL 条件扣减；双请求争抢库存只有一个成功；余额永不为负 | 通过 |
| 库存幂等 | 相同 idempotency key 并发提交返回同一流水且只扣一次库存 | 通过 |
| 订单状态机 | happy path、非法跳转和终态回退单测 | 通过 |
| 库存预占/释放 | SKU、数量、缺余额、不足和预留状态单测 | 通过 |
| 订单并发预占 | 两个订单争抢最后库存仅一个成功；同一订单重复提交不重复占库、流水或审计 | 通过 |
| 物流状态 | 事件类型、异常原因、时间和状态映射单测 | 通过 |
| 消息去重 | PostgreSQL 集成测试：重复消息只保留一条 | 通过 |
| 消息失败重试 | Provider 失败写 `RETRYABLE`、`nextRetryAt` 和游标错误 | 通过 |
| 非法分派 | 不同部门分派拒绝单测；API 再验目标 Membership | 通过 |
| 收件箱审计 | 同步、状态、分派、标签和客户关联写 `InboxAuditEvent` | 通过 |
| 空/加载/错误 | 通用列表空状态；收件箱加载态与模拟 503 错误态 Playwright | 通过 |
| 移动端 | 登录、订单录入、统一收件箱无页面级水平溢出 | 通过 |
| 图片安全上传 | PNG/JPEG/WebP/PDF 的 MIME、签名、扩展名和大小单测/Playwright | 通过 |
| 图片预览与失败 | 商品图片真实预览、模拟 404 占位和重试按钮 Playwright | 通过 |
| 附件越权 | 受限账号上传返回 403；内容读取无权与不存在统一 404 | 通过 |
| 附件删除与审计 | 确认删除、对象删除、记录软删除和 Audit Log | 通过 |

## 本轮修复

### 1. 中文用户名 Header 崩溃

旧行为：Proxy 把 `session.username` 写入 `x-username`。中文字符不能直接转换为 Header ByteString，所有受保护请求返回 500。
修复：彻底移除显示名 Header；服务端身份只使用已验签 Session、稳定 `userId` 和 `membershipId`。用户名继续作为 JWT 数据和 UI 展示字段。
回归：中文账号登录、菜单、API 403 和页面直链测试通过。

### 2. 当前业务上下文泄漏

旧行为：客户、商品、订单、物流、费用在 `ALL` Scope 时使用空过滤或全表过滤，可能把不同业务板块混进同一列表。
修复：普通业务列表和订单详情始终绑定当前 Membership 的 `businessUnitId`。跨板块汇总必须另建独立 Action 和接口，本轮没有开放。

### 3. 列表契约不统一

旧行为：客户、商品、费用返回裸数组且无服务端分页；部分列表只有单字段排序。
修复：核心七类列表统一分页元数据，增加唯一 ID 二级排序和必要筛选；最大分页大小受服务端限制。

### 4. 费用金额静默取整

旧行为：费用接口对小数 `amountCents` 使用 `Math.floor`，会静默改变资金事实。
修复：复用 `normalizeMoneyCents`，只接受非负安全整数，不合法输入返回 `INVALID_MONEY_CENTS`。

### 5. Provider 拉取失败无重试证据

旧行为：Adapter 在返回消息前失败时，不会创建 DeliveryAttempt 或更新 SyncCursor。
修复：每批拉取增加幂等 Batch Attempt；失败记录 `RETRYABLE`、错误码、摘要、下一次重试时间和游标错误状态。

## 测试命令

```powershell
pnpm run db:seed
pnpm run validate
pnpm run test:e2e
pnpm run build
pnpm exec prisma migrate status
git diff --check
```

最终数字以本报告提交前最后一次完整运行输出为准。

最终执行结果：

- Vitest：12 个测试文件、33 项测试通过，其中包含真实 PostgreSQL 消息幂等、失败重试及附件签名/大小/路径安全测试。
- Playwright Chromium：12 项测试通过，新增正常上传预览、404 占位重试、删除、伪造类型、超限和跨部门越权拒绝。
- TypeScript、ESLint、Prisma validate：通过。
- Next.js production build：通过，48 个页面生成成功；路由清单包含安全附件上传、删除和受控内容读取接口。
- Prisma migrate status：6 个迁移全部为最新状态。

## 剩余风险

1. Local Demo 存储不是生产对象存储；正式使用前仍需私有 Bucket、加密、病毒扫描、生命周期和删除证明。
2. 物流单号、物流轨迹、轨迹维护和附件已拆分独立 Action，并在订单详情、物流列表、物流详情直链和 API 同时执行；员工额外 Access Grant 生效后开放、撤销后立即关闭。后续若需拆分订单金额等更多字段，继续沿用字段级 DTO 规则。
3. 公告、文档、审批、考勤、请假已统一为服务端分页协议，并增加稳定唯一二级排序与翻页不重复验收；后续新增列表必须复用同一协议。
4. 真实物流商、真实消息渠道、生产附件存储和邮件 SMTP 都未接入，因此只验证本地契约和错误处理，不代表第三方可靠性已通过。
5. 库存已通过真实 PostgreSQL 双请求并发、幂等与负库存测试；预发布阶段仍需更高并发压测和故障注入。
6. 部署原子切换、CDN 缓存失效、数据库备份恢复和生产监控只能在预发布环境验证，本地构建不能替代。

## 上线前门禁

- 使用全新高强度 `SESSION_SECRET`，禁止使用本地演示密码。
- 为销售、核单、仓库、售后、财务分别建立演示账号并逐角色验收字段级 DTO。
- 将 Local Demo Storage 替换为经过安全评审的私有对象存储，并完成恶意文件扫描。
- 在预发布 PostgreSQL 执行并发库存、迁移、备份恢复和回滚演练。
- 建立不可变构建版本、健康检查、审计告警和权限缓存失效监控。
- 真实渠道必须完成 Webhook 验签、Token 轮换、限流、数据保留和隐私审批。
- 全部 Gate 通过后，由创始人单独授权 Push 和部署；本报告不构成生产部署授权。
## 2026-07-31 财务内控配置一致性补充

| Gate | 证据 | 结果 |
| --- | --- | --- |
| 内控配置并发保护 | `FinanceControlPolicy.version` + `updateMany` compare-and-swap | 旧版本不会覆盖新版本，返回 409 |
| 内控配置审计原子性 | 配置更新与 `writeAuditLog(..., tx)` 同一个 Serializable 事务 | 审计失败时配置回滚 |
| 输入责任 | `finance-segregation-policy.test.ts` | 6/6 通过，缺版本、无理由和非法版本均拒绝 |

本轮仅迁移本地 `erp_v2` 数据库的 `202607310009_finance_control_policy_versions`；没有部署、Push、连接生产或外部账号。

## 2026-07-31 对账岗位分离补充

| Gate | 证据 | 结果 |
| --- | --- | --- |
| 对账自处理拒绝 | 本地真实服务层 UAT | 同一员工对自己创建的建议执行忽略，返回 `FINANCE_RECONCILIATION_MAKER_CHECKER_REQUIRED`，记录保持 `SUGGESTED` |
| 忽略不放行 | `transitionStatement` 审批前检查 | 只有全部明细 `MATCHED` 才可批准；`IGNORED` 不再被视为已完成 |
| 回滚与清理 | UAT 临时结算对象/结算单/明细/建议均已删除并复核 | 通过 |

迁移 `202607310010_finance_reconciliation_controls` 仅应用于本地 `erp_v2` 数据库。未部署、未 Push、未连接生产或外部账号。

## 2026-07-31 验收收口补充

### 本轮完成

- 核单权限继续按动作拆分验证：销售不能核单通过，核单员退回或作废必须填写原因，发货人员不能越权作废待发货订单。
- 角色矩阵覆盖销售、核单、发货、售后、财务、人事和业务负责人；菜单、页面直链、API 与数据字段权限保持一致。
- 修复统一收件箱嵌套 `main` 导致的可访问性语义冲突，平台管理员全部动态菜单页面均存在唯一主内容区。
- Playwright 使用受控并发与稳定超时；`test:e2e` 在执行浏览器验收前先完成生产构建。
- 新增独立 `tsconfig.check.json`，类型门禁不再被运行中的 `.next/dev` 临时缓存污染，严格模式与生产路由类型仍保留。

### 验证证据

| Gate | 命令 | 结果 |
|---|---|---|
| 单元/集成测试 | `pnpm run test` | 24 个文件、77 项全部通过 |
| 角色与越权矩阵 | `pnpm exec playwright test e2e/role-matrix.spec.ts --reporter=line` | 10/10 通过 |
| 动态菜单全路由 | `pnpm exec playwright test e2e/menu-routes.spec.ts --reporter=line` | 1/1 通过 |
| TypeScript | `pnpm run ts-check` | 通过 |
| ESLint | `pnpm run lint` | 通过 |
| Prisma Schema | `pnpm run prisma:validate` | 通过 |
| 数据库迁移状态 | `pnpm exec prisma migrate status` | 20 个迁移，数据库为最新状态 |
| 生产构建 | `pnpm run build` | 通过；71 个页面/API 路由生成成功 |
| 本地健康检查 | `GET /api/health` | `ok: true` |

### 当前边界

- 本轮没有部署、Push、连接真实 Ship24/飞书/消息渠道，也没有导入旧生产数据。
- 旧系统仍应保持可用；正式替换前仍需员工按销售、核单、发货、售后、财务、人事角色完成真实业务 UAT。
- Ship24、飞书、对象存储、SMTP、域名 HTTPS、备份恢复和生产监控需要在预发布环境使用用户提供的正式资源验证。

---
## 2026-07-31 依赖安全与完整浏览器回归

### 安全加固

- 将 Next.js 实际使用的 `sharp` 从 0.34.5 固定到 0.35.3，修复 libvips 继承的 High 级漏洞。
- 将 Next.js 的 `postcss` 从 8.4.31 固定到 8.5.25，修复路径穿越、任意文件读取及 CSS 输出风险。
- 将 ExcelJS 依赖链的 `uuid` 固定到 11.1.1，修复缓冲区边界问题。
- `brace-expansion` 自动解析到兼容旧 minimatch API 的安全回移版本 1.1.18、2.1.4 和 5.0.9；源码已确认包含最大展开数、总字符数和深递归保护。
- 审计数据库仅将 `>=5.0.8` 标为修复，因此对 `GHSA-mh99-v99m-4gvg` 做精确忽略；其他漏洞仍由 `pnpm audit --prod --audit-level high` 阻断。
- 三个发布时间不足默认门槛的安全补丁版本使用精确 `minimumReleaseAgeExclude`，未放宽其他包的供应链发布时间策略。

### 本轮验证证据

| Gate | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过；锁文件供应链策略通过 |
| Excel 导入解析定向测试 | 6 文件、16 项通过 |
| Excel 工作簿真实生成 | 通过 |
| Sharp 实际加载 | 0.35.3，libvips 8.18.3 |
| Vitest 全量 | 24 文件、77 项通过 |
| TypeScript / ESLint | 通过 |
| Prisma validate / migrate status | 通过；20 个迁移为最新状态 |
| Next.js production build | 通过；71 个页面/API 路由 |
| Playwright 完整回归 | 24/24 通过 |
| Docker Compose | PostgreSQL 与 Redis 均 healthy |
| 本地配置校验 | 通过且未输出 Secret |
| 本地健康检查 | `/api/health` 返回 `ok: true` |

完整浏览器回归使用单工作进程和 15 秒可见性等待，避免本地开发服务器冷启动被误判为业务失败。覆盖动态菜单全路由、七类角色、订单与核单越权、库存和金额、附件安全、中文账号、移动端、统一收件箱及服务端分页。

---
## 2026-07-31 本地备份恢复门禁

- 新增 `pnpm run backup:drill`，使用 PostgreSQL custom-format 备份恢复到唯一隔离库。
- 连续两次完成恢复演练；第二次对账 52 张表、20 个迁移和 16 个有效附件。
- 源库与恢复库行数差异为 0；附件缺失为 0；附件字节数/SHA-256 不一致为 0。
- 第二次备份大小 284,225 字节，SHA-256 为 `84F6663673DF6D2CE14DBEBE9D356223BF3C030801FE79783C82E88A0C253B1F`，恢复及对账耗时 30.01 秒。
- 演练隔离库、容器临时文件和主机临时备份均已自动清理。
- 生产加密、异地备份、对象存储版本恢复和最终 RTO/RPO 仍需在预发布环境验证并由创始人确认。

---

## 2026-07-31 财务四眼原则补充门禁

- 新增业务板块级 `FinanceControlPolicy`；未配置时以严格默认拒绝同一员工完成制单、审批、过账的任意冲突组合。
- 服务端按稳定 `userId` 而非 Membership ID 比对，故员工切换另一个岗位/Membership 也不能绕过；每次审批和过账都在 Serializable 事务内重新读取策略。
- 财务内控页面和 API 使用 `finance.control_policy.read/manage` 动作，且只接受 `ALL` / `BUSINESS_UNIT` Scope；未因任何角色名称、部门名称或业务板块名称写死规则。
- 验证：`pnpm run test` 34 个文件、124 项通过；`pnpm run ts-check`、`pnpm run lint`、`pnpm exec prisma validate`、`pnpm run build` 全部通过。
- 本机临时服务层 UAT：同一员工通过第二个 Membership 审批自己创建的结算单和付款，均被 `FINANCE_MAKER_CHECKER_REQUIRED` 拒绝；临时数据已清理。
- 本轮未部署、未 Push、未连接旧 ERP、生产数据库、银行、物流商或第三方账号。

仍需在后续财务批次补齐：对账建议人与确认人分离、付款核销人与过账人分离、已过账事实的受控冲销/复核、真实财务岗位矩阵 UAT。

---

## 2026-07-31 财务核销与已过账事实门禁

| Gate | 实际结果 |
| --- | --- |
| 付款核销岗位分离 | 默认要求核销人与付款制单人、审批人均不同；按 `userId` 校验，不能通过切换 Membership 绕过 |
| 分次核销 | 同一付款可向同一结算单记录多笔不可变部分核销，不再被旧的配对唯一约束卡住 |
| 幂等重试 | 付款级 `idempotencyKey` 重放返回原记录；同键不同内容返回 `409 ALLOCATION_IDEMPOTENCY_KEY_REUSED` |
| 数据库事实保护 | PostgreSQL 拒绝直接更新或删除核销记录；金额仍为正的 `BIGINT` 最小货币单位 |
| 已过账锁定 | 状态机和页面均不再提供 `POSTED → void`；防止已确认财务事实被直接篡改 |
| 本地真实数据库验证 | 两笔 `40 + 60` 分次核销、重复键拒绝、不可变触发器拒绝更新均通过；临时事务完整回滚 |

本轮迁移 `202607310011_finance_payment_allocation_controls` 与 `202607310012_finance_payment_allocation_immutability` 仅应用到本机数据库。未部署、未 Push、未连接旧 ERP、生产数据库、银行或第三方账号。

### 上线前仍阻断的财务能力

已批准但未过账的付款核销现已具备受控替换实现；但**已过账**付款或结算单发生错误时，系统仍安全拒绝直接作废或用核销替换绕过过账锁定。“已过账冲销/调整申请 → 独立审批 → 会计过账 → 反向不可变会计效果”与总账分录尚未实现。完成该独立能力并通过财务岗位 UAT 前，财务模块仍不可视为已完全替换旧系统。

---

## 2026-07-31 已批准付款核销受控替换（本地最终门禁完成，真实财务 UAT 待补）

本节仅覆盖 `APPROVED` 且未过账的付款核销替换；不改变已过账事实，也不等同于总账冲销。

| Gate | 当前实现控制 | 本轮最终证据状态 |
| --- | --- | --- |
| 状态机 | `PENDING → APPROVED → APPLIED`；可 `REJECTED`，通过取消 Action + Scope 校验的角色可将 `PENDING`/`APPROVED` 申请置为 `CANCELLED` | 本地回滚 UAT 与构建验证通过；真实岗位 UAT 待补 |
| 原事实保护 | 原 `FinancePaymentAllocation` 不可更新/删除；`APPLIED` 仅以独立 `REVERSAL` effect 抵销其有效金额 | 本地回滚 UAT 已验证；真实岗位 UAT 待补 |
| 替代核销 | 同一付款、相同金额、不同且已批准的替代结算单；组织、结算对象、币种与精度必须一致 | 本地回滚 UAT 已验证；真实岗位 UAT 待补 |
| 范围与菜单 | `finance.allocation_adjustment.*` Action、动态菜单和当前 Membership Scope 同时校验原付款、原结算单、替代结算单；不信任前端组织 ID | 服务端静态/单元门禁通过；跨范围端到端 UAT 待补 |
| 岗位分离 | 默认申请人 ≠ 审批人、申请人 ≠ 执行人、审批人 ≠ 执行人；按稳定 `userId` 比较，不能借 Membership 切换绕过 | 定向单元测试通过；真实岗位 UAT 待补 |
| 并发与容量 | 可重试 `Serializable` 事务重新读取状态和有效核销额；替代结算单超额或并发冲突受控拒绝 | 实现与类型/构建门禁通过；并发压测待补 |
| 审计与数据库守卫 | 申请、审批、拒绝、取消、执行写入 Audit Log；数据库触发器守卫状态迁移、组织事实、替代关联和 effect 不可变性 | 数据库触发器 UAT 通过；服务层 AuditLog 端到端 UAT 待补 |
| 已过账边界 | `POSTED` 付款/结算单拒绝进入本流程，`POSTED → void` 继续拒绝；总账冲销/会计更正未实现 | 已知阻断项，不能以本功能替代 |

当前工作树包含 `202607310013_finance_payment_allocation_adjustments`、`202607310014_harden_finance_allocation_adjustment_guards` 与 `202607310015_freeze_finance_allocation_adjustment_approval_facts`。本轮最终门禁已完成：三项迁移仅应用在本地 `erp_v2`，`pnpm run test` 为 35 个测试文件 / 131 项通过，`ts-check`、Lint、Prisma validate、迁移状态与构建均通过。

### 2026-07-31 财务核销调整受控替换收口

| Gate | 结果 |
| --- | --- |
| 数据库回滚 UAT | 完整调整链路成功，审批事实篡改被触发器拒绝，事务回滚后无测试数据残留 |
| 角色/菜单默认策略 | 新 Action 与菜单默认为拒绝，需管理员以角色权限、菜单权限或有效协作授权显式开启 |
| 替代结算单体验 | 后端分页、稳定排序；显示可用余额并在切页后保留已选择的选项 |
| `POSTED` 边界 | 未实现总账冲销/会计更正，仍拒绝直接修正已过账事实 |

Codex 内置浏览器与本机回环地址在当前环境隔离，不能以它替代用户本机浏览器的最终视觉 UAT；此前 shell 层本地健康检查正常。本批未部署、未 Push、未连接任何生产系统、旧 ERP 或第三方财务账号。

本轮未部署、未 Push、未连接旧 ERP、生产数据库、银行、支付渠道或任何第三方财务账号。

---
