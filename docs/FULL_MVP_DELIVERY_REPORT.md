# ERP V2 Full MVP 交付报告

日期：2026-07-23

项目：`zyzxerp-v2`

边界：Facebook COD 部门 ERP V2；未连接旧生产库、未导入旧数据、未部署、未 push。

## 当前结论

独立 V2 的组织权限基础、核心业务页面和订单—库存—发货—物流闭环已形成可构建的 MVP。权限与菜单由数据库配置，业务代码不依赖具体角色名、部门名或业务板块名。当前代码已通过 Prisma 校验、TypeScript、Lint、19 个单元测试和 Next.js 生产构建。

本机已安装 Docker Desktop，并完成 PostgreSQL 容器启动、初始 migration、虚构 Seed、真实登录和核心页面浏览器验收。真实 PostgreSQL 并发超卖压力测试仍待补充，不能把单元测试等同于完整并发证明。

## 已完成范围

- 登录、Session、退出、主 Membership 解析和业务上下文切换。
- Legal Entity、Business Unit、Department、Site、User、Membership。
- Role、Action、Scope、Menu、Menu Permission、Access Grant、Delegation Rule。
- 动态菜单；Grant 生效后开放，撤销/到期后菜单与 API 同时关闭。
- 客户、商品、SKU、订单、库存、发货、物流事件、费用、审批、考勤、请假、公告、文档元数据、审计。
- 订单显式状态机；状态跳跃和终态修改被拒绝。
- 金额按最小货币单位安全整数处理，数据库增加非负约束。
- 库存余额、预留、流水和幂等键；订单提交预留，发货消耗，取消释放。
- 原子条件扣减、Serializable 事务、数据库非负约束共同防止负库存和并发超卖。
- 库存不足、缺少 SKU、缺少库存余额、预留不一致均明确失败，不静默跳过。
- 订单和物流列表统一使用分页元数据、稳定二级排序 `createdAt + id` 和 `{ok,data,meta/error}` 协议。
- 物流事件保留发生时间、事件类型、备注、异常原因和严重度。
- Docker Compose、`.env.example`、初始 migration、Seed、README 和回滚说明。

## 权限安全控制

- Session 中的 Membership 必须有效且未到期。
- API 从当前 Membership 推导组织上下文，不信任请求体中的业务板块归属。
- Department Scope 现在必须匹配目标部门，不能只匹配业务板块。
- 员工列表按有效 Membership 的业务板块过滤。
- 创建 Membership 前校验 Legal Entity、Business Unit、Department、Site 的一致归属。
- 分配角色时逐项校验目标角色的每个 Action 是否属于授权人可转授权限子集。
- Access Grant 校验目标 Action、Scope、组织范围、Delegation Rule、有效期和授权人能力。
- Membership 停用、Grant 撤销采用可审计软失效，不直接删除历史证据。
- 未发现源码中以 `FACEBOOK_COD`、`general_manager` 或“总经理”进行权限判断。

## 测试与构建证据

| Gate | 结果 | 证据 |
|---|---:|---|
| Prisma validate | 通过 | `prisma/schema.prisma` valid |
| Prisma Client generate | 通过 | Prisma Client 6.19.3 |
| TypeScript | 通过 | `tsc -p tsconfig.json` |
| ESLint | 通过 | `eslint` |
| Unit tests | 通过 | 7 个测试文件，19 个测试 |
| Next.js build | 通过 | 43 个页面/接口路由生成成功 |
| 敏感字符串扫描 | 通过 | 未发现已知 Token、服务器密码进入 V2 |
| Docker/PostgreSQL 启动 | 通过 | PostgreSQL 16 Alpine 容器 health=`healthy` |
| Migration/Seed 实库执行 | 通过 | `202607230001_initial` 已应用；虚构 Seed 成功 |
| 浏览器页面操作验收 | 通过（基础） | founder 登录成功；Dashboard、库存、订单、物流、客户、Membership 页面可打开 |
| 浏览器控制台检查 | 通过（修复后） | 修复服务端 render 函数跨 Client Component 边界问题后核心页面无新增错误 |
| PostgreSQL 并发超卖集成测试 | 未执行 | 已有原子 SQL 设计与单元门禁，仍需实库并发验证 |

## 旧系统问题 → V2 控制措施 → 测试证据

来源：`C:\Users\86150\Documents\New project\Projects\ERP\COZE_LEGACY_BUG_ANALYSIS.md`。该文档只用于架构避坑，不视为完整员工需求。

| 旧系统问题 | V2 控制措施 | 当前证据 |
|---|---|---|
| 中文用户名、员工 ID 和 UUID 混用 | Session 只保存 userId、username、membershipId；中文姓名仅为展示字段 | auth/session 类型检查与构建通过 |
| 部门、角色、菜单写死 | 组织、角色、动作和菜单全部数据库驱动 | Prisma 模型、动态菜单测试 |
| 仅前端隐藏按钮 | API 独立执行 Membership + Action + Scope 鉴权 | 同板块允许、跨板块/跨部门拒绝测试 |
| 越权新增员工或分配高权限角色 | 目标组织归属校验；目标角色每个 Action 必须可转授 | `assertGrantRule` 与越权 Scope 测试 |
| Grant 撤销/到期后仍可访问 | 每次决策检查 active、revokedAt、expiresAt；菜单与 API 共用有效 Action | Grant 生效/关闭菜单测试、过期 Grant 拒绝测试 |
| 订单状态可随意修改 | 显式状态转移表，终态不可回退 | 订单 happy path 和非法跳转测试 |
| 金额 string/float/toFixed 混乱 | 最小货币单位安全整数；API 和数据库双重非负约束 | 金额边界测试、migration CHECK |
| SKU 不一致、静默跳过、负库存 | SKU 必须属于订单商品和当前板块；库存事务明确失败；原子扣减和非负约束 | SKU/数量不变量测试、库存模型与 SQL 约束 |
| 并发超卖 | `updateMany` 条件扣减 + Serializable 事务 + 唯一幂等流水 | 代码与 schema 证据；实库并发测试待执行 |
| 列表无分页、排序不稳定 | 统一分页上限和元数据；`createdAt,id` 稳定排序 | 分页参数测试；订单/物流 API |
| API 响应格式混乱 | 成功、分页、失败使用统一 helper | `api-response` 测试 |
| 物流字段端到端丢失 | 严格解析并持久化 occurredAt、memo、异常原因和等级 | 物流字段完整性测试 |
| 前端空值造成异常 | 表格和详情页使用显式空态；API 拒绝无效数值 | 构建通过；浏览器回归待执行 |
| 发布后旧 JS/缓存 | 不可变构建版本、入口 HTML 不长缓存、版本化 CDN 清理和上一版本回滚 | README 策略；生产流水线待建设 |
| 密钥进入仓库 | `.env.example` 只含占位值，`.env` 被忽略，提交前敏感扫描 | 本轮扫描无命中 |

## 发布缓存与回滚方案

1. 每个构建绑定 Git 提交哈希，生成不可变应用版本。
2. 数据库采用 expand/contract 迁移：先加兼容字段，再切应用，最后单独清理旧字段。
3. 上线前备份数据库并执行 migration、Seed/配置校验和健康检查。
4. 静态带哈希资源可长期缓存；入口 HTML 和菜单/权限响应不得长缓存。
5. 应用异常时切换上一不可变版本；数据库优先前向修复，禁止未经验证直接逆向回滚。
6. 权限、菜单或 Grant 变更当前不使用持久缓存；未来若加缓存，必须绑定权限版本并主动失效。

## 尚未完成与真实风险

- 需要在真实 PostgreSQL 上运行两个并发下单/预留请求，证明只有一个成功并核对余额、预留和流水。
- 已完成桌面端核心页面基础浏览器验收；仍需补充移动端布局、403/404、关键表单提交和完整业务数据闭环。
- 通用后台其余列表仍需逐步迁移到统一分页响应，当前优先完成订单、库存和物流核心接口。
- 需要员工继续提供实际使用问题，尤其售后物流追踪工作量、员工可见字段和异常处理习惯。
- 当前 Seed 是虚构演示配置；上线前必须建立正式配置审批和首次管理员激活流程。

## 员工反馈待办

- 售后只应看到完成工作所需的物流摘要，具体运输内部状态与敏感字段按 Action 单独配置。
- 物流异常需要围绕“待处理、责任人、下一步动作、截止时间、处理结果”减轻售后工作，而不是单纯追加轨迹。
- 继续收集订单录入、审核、发货、追踪各岗位的实际点击路径和重复录入点，追加到本追踪矩阵。

## 下一步验收顺序

1. 补充真实 PostgreSQL 数据库集成/并发测试。
2. 用虚构数据完成创建客户、商品、SKU、库存、订单、发货和物流异常的全链路验收。
3. 完成移动端、403/404 和响应式验收。
4. 修复实际验收问题后重新执行全部 Gate。
5. 仅在创始人明确授权后 push 或部署；旧系统继续保留不动。

## 2026-07-24 销售履约闭环收口

### 已完成

- 新增独立动作：`order.submit`、`order.review`、`order.ship`。
- 核单支持通过和驳回；驳回必须填写原因并释放已预占库存。
- 发货在 Serializable 事务内完成库存出库、订单状态变化、物流单创建和初始轨迹写入。
- 发货必须填写承运商与物流单号；重复单号和并发重复发货返回冲突。
- 发货后物流单自动进入正常跟踪并安排下一次跟进。
- 物流异常进入需要处理；送达或取消进入关闭状态；物流事件同步订单状态。
- 售后人工跟进记录与供应商轨迹分离，支持工作状态、备注和下次跟进时间。
- 通用订单更新接口不再接受 `status` 或 `deliveredAt`，防止绕过流程动作。
- 只有草稿订单允许物理删除；进入流程后保留业务与审计记录。
- 首页根据当前 Membership 的有效 Action 动态显示录单、核单、发货、物流和售后队列，不依赖角色名称。

### 浏览器真实操作证据

使用本地虚构 Seed 数据完成：

1. 打开动态岗位工作台。
2. 打开订单录入与订单列表。
3. 草稿订单提交核单。
4. 核单通过进入待发货。
5. 填写承运商和物流单号确认发货。
6. 自动创建物流单及 `SHIPMENT_CREATED`、`PICKED_UP` 轨迹。
7. 打开物流详情并追加正常运输的售后跟进备注。

未连接或修改旧生产数据库，未导入旧服务器业务数据，未部署生产，未 push。

### 验证结果

- Docker PostgreSQL、Redis：healthy。
- 本地 migration `202607240001_sales_workflow`：成功应用。
- Prisma validate、TypeScript、ESLint、Next.js production build：通过。
- Vitest：8 个测试文件、22 项测试通过。

### 尚未完成

- 销售、核单、仓库、售后四个独立演示账号及逐角色浏览器验收。
- 真实物流商自动同步、三工作日未更新规则、派送优先级和批量处理。
- 附件/聊天截图、智能地址识别、物流转单多运输段及物流账单/COD 对账。
- 财务、行政、人事部门正式岗位试用和配置验收。

部门试用与配置范围见 `docs/DEPARTMENT_TRIAL_AND_CONFIGURATION_PLAN.md`。

## 2026-07-24 ZC UI 统一与订单邮箱验收

### UI 统一成果

- 统一登录页、顶部导航、侧栏、移动端抽屉、岗位工作台、列表、表单、详情、状态标签、空状态和错误状态。
- 顶部导航采用白色背景，侧栏按数据库动态菜单生成；当前页面、业务上下文和账号信息清晰可见。
- 工作台按当前 Membership 的有效 Action 显示岗位入口，不按角色名称写死页面。
- 订单、物流详情沿用同一套间距、圆角、色彩、按钮和状态层级，售后跟单与承运商轨迹明确分区。
- 当前使用 ZC 字母识别标记和公司名称；正式公司 Logo 原图尚未提供，因此未伪造官方 Logo。

### 订单邮箱能力

- 订单模板可配置“客户邮箱必填”，默认演示模板已启用。
- 订单录入支持邮箱格式、常见拼写、一次性邮箱、MX 和 SMTP 可达性检测，不发送验证码。
- 检测结果区分“较可信、无法确认、无效”，避免仅凭格式或域名存在就声称邮箱一定真实。
- 订单保存邮箱检测状态和检测时间，订单详情可追溯。
- 新增 migration：`202607240002_order_email_validation`，仅应用于 V2 本地数据库。

### 本轮验证证据

| Gate | 结果 |
|---|---:|
| TypeScript | 通过 |
| ESLint | 通过 |
| Vitest | 8 个文件、22 项通过 |
| Prisma validate | 通过 |
| Next.js production build | 通过，45 个页面/API 路由生成成功 |
| Playwright Chromium | 3 项通过 |
| 桌面端登录、工作台、订单录入 | 通过 |
| 移动端登录页水平溢出检查 | 通过 |

Playwright 覆盖登录后岗位工作台与核心入口、订单模板/客户邮箱/订单列表，以及移动端登录页布局。此次仍未 push、未部署生产、未连接或写入旧生产数据库。

## 2026-07-24 统一收件箱本地骨架

- 新增数据库驱动的渠道连接、外部身份、会话、消息、客户关联、分派、标签、同步游标、失败重试和收件箱审计模型。
- 新增通用 `ChannelProviderAdapter` 和本地 `DEMO` 适配器；没有真实渠道名称判断、凭据或外部网络调用。
- 所有查询和操作从当前 Membership 推导 `businessUnitId` / `departmentId`，跨部门读取与分派由后端拒绝。
- 统一收件箱支持会话列表、消息时间线、状态、分派、标签、客户关联和演示消息拉取。
- 消息使用双层唯一约束和稳定幂等键；失败进入可重试状态并保留错误证据。
- 新增迁移 `20260723215042_unified_inbox_foundation`，为 expand-only，可在应用回滚时安全闲置新表。

验证：Prisma、TypeScript、ESLint 通过；9 个单元测试文件、26 项测试通过；Playwright 5 项通过，包含 Demo 消息→状态→客户关联闭环及统一收件箱移动端无页面级水平溢出。真实第三方账号、真实凭据、生产部署和 Push 均未执行。

## 2026-07-24 安全图片与附件 Gate

- 新增可替换 `StorageAdapter` 和本地 `LOCAL_DEMO` 实现，不依赖具体云厂商。
- 上传强制校验真实文件签名、声明 MIME、扩展名和大小；存储键使用安全随机 UUID，拒绝路径穿越和可执行内容。
- 附件记录绑定法人、业务板块、部门、目标资源、上传人和 Membership；读取、上传、删除均执行后端 Action + Scope。
- 商品详情和统一收件箱已接入图片/PDF附件；支持预览、404 失败占位、重试、确认删除和审计。
- 新增迁移 `20260723224949_secure_attachments`，仅应用于 V2 本地数据库。
- 最终验证：Vitest 12 个文件、33 项通过；Playwright Chromium 12 项通过；TypeScript、ESLint、Prisma validate、6 个迁移状态和 Next.js production build 全部通过。
- 当前仍使用本机私有目录的 `LOCAL_DEMO` 存储；生产上线前必须切换经过评审的私有对象存储，并补充恶意软件扫描、加密、生命周期和备份恢复策略。
