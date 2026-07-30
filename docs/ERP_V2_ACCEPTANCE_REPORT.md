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
2. 售前“可看订单但不可看物流单号/金额”等字段级权限尚未形成完整独立 Action 矩阵；当前无订单读取权限的账号被整体拒绝。正式拆分岗位前必须完成字段级 DTO。
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
