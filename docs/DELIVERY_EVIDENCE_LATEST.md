# ERP V2 最新交付证据

更新时间：2026-07-31

## 2026-07-31：资源中心收口与全量回归

本轮完成“资源中心 / 软件资产”统一台账的本地可运行闭环，并收口了真实浏览器回归中发现的菜单与权限一致性问题。

- 资源中心和软件资产均按法人、业务板块、部门、站点与 Membership 做服务端范围过滤；创建、编辑、流转、归档、历史、配置以及软件账号标识的读写均为独立 Action。
- 资源分类、状态、流转动作、排序和启停由数据库配置；没有按公司、部门、角色或业务板块名称写分支。
- 资产使用乐观版本锁和数据库 `CHECK` 约束，两个并发流转请求只允许一个成功，冲突请求返回 `409`。
- 修复了仪表盘快捷入口元数据被误当成权限条件、导致有权限员工看不到“订单管理”的问题；未知条件仍保持失败关闭。
- 业务负责人现在可只读查看角色定义；创建和修改全局角色注册表仍要求 `system.configuration.manage` 的 `ALL` Scope，避免越权授权。
- 修复了两个财务配置页重复渲染 `<main>` 的可访问性结构问题。

| Gate | 结果 |
|---|---:|
| `pnpm run test` | 43 文件 / 154 项通过 |
| `pnpm exec playwright test --project=chromium` | 33 / 33 通过 |
| `pnpm run ts-check` | 通过 |
| `pnpm run lint` | 通过 |
| `pnpm run prisma:validate` | 通过 |
| `pnpm run build` | 通过 |
| `pnpm exec prisma migrate status` | 41 个迁移，数据库 up to date |

本轮只使用本地 PostgreSQL 和虚构 Seed 数据；未部署、未 Push、未连接旧生产库、未导入旧数据、未接入真实第三方账号。

本批前一基线：`c22868d feat: harden scoped workbenches and order operations`

## 自动化门禁

- `pnpm run ts-check`：通过。
- `pnpm run lint`：通过。
- `pnpm run test`：17 个测试文件、54 个测试通过。
- `pnpm run test:e2e -- e2e/smoke.spec.ts`：13 个 Playwright 冒烟用例通过。
- `pnpm run prisma:validate`：通过。
- `pnpm run build`：通过，生成 56 个页面/API 路由。
- `pnpm run deploy:dry-run`：通过，包含配置、Docker、迁移、测试、构建和健康检查。

## 本地运行态

- PostgreSQL 16：healthy。
- Redis 7：healthy。
- Migration：无待应用迁移。
- 虚构 Seed：完成。
- `/api/health`、`/login`、`/admin/orders`、`/admin/shipments`：HTTP 200。

## 最新修复

物流跟进只在“仍有未到期的当前跟进”时抑制重复待办；历史已关闭或已到期的跟进不会阻止新物流轨迹再次生成售后任务。

## 尚未完成的上线门禁

以下项目不能用本地虚构数据代替：

1. 真实物流商模板导出、回传和订单匹配。
2. Ship24 Key、真实状态映射和官方 Webhook 联调。
3. 员工、售后、发货、财务、人事的实际 UAT。
4. 生产级数据库与附件备份恢复演练。

在上述门禁完成并获得负责人确认前，不切换旧 ERP、不导入旧生产数据、不部署生产。

## 2026-07-31：工作台、团队目标与列表安全加固

### 本轮完成

- 新增按业务板块保存的工作台卡片配置。拥有 `dashboard.configure` 动作的人员可在首页调整卡片显示、名称、说明、顺序、核心/概览区域，以及适用角色、部门或具体员工。
- 卡片配置不会放大数据权限：卡片数字和跳转页面仍由服务端按当前 Membership、Action、Scope 和有效临时授权计算；配置角色、部门、员工时也只接受当前业务板块的有效对象。
- 工作台订单与物流统计已复用订单/物流 Scope 查询计划，避免把其他部门或其他下属范围的数据计入数字。
- 订单列表已使用服务端筛选和稳定分页；支持销售、产品、目的地国家、日期和关键词组合筛选，避免通用表格二次分页。
- 团队目标按权限范围收紧：
  - 全业务板块目标仅接受 `ALL` / `BUSINESS_UNIT` 范围；
  - 部门目标仅接受 `ALL` / `BUSINESS_UNIT` / `DEPARTMENT` / `DEPARTMENT_TREE` 范围；
  - `SUBORDINATES` 仅能查看下属的个人目标，不能被错误扩大成包含同部门其他人的部门汇总或全板块汇总。
- 新增本地迁移 `202607310018_dashboard_workbench_setting`，当前本地 `erp_v2` 已执行且 `prisma migrate status` 为 up to date。

### 本轮验证证据

| Gate | 结果 |
|---|---:|
| `pnpm run ts-check` | 通过 |
| `pnpm run lint` | 通过 |
| `pnpm run test` | 41 个文件、146 项通过 |
| `pnpm exec prisma validate` | 通过 |
| `pnpm run prisma:generate` | 通过 |
| `pnpm run build` | 通过，生成 87 条页面/API 路由 |
| `pnpm exec prisma migrate status` | 本地 schema up to date |
| 本地健康检查 | `GET /api/health` = 200 |

### 边界与后续

- 本轮没有连接旧生产数据库、没有导入旧数据、没有接入真实 Ship24/飞书/消息渠道账号、没有部署、没有 Push。
- 旧 ERP 的逐页面功能清单仍需继续按实际员工操作路径验收；后续优先补足已确认但尚未验收的页面交互，而不是删除旧功能。

## 2026-07-31：文档中心与附件范围安全

- 文档中心已从空页面收口为实际可用模块：上传、拖拽、粘贴截图、审核/退回、受控预览、软归档、分类、搜索、状态筛选与服务端分页。
- 文档查看、审核、归档和分类配置全部按 Membership + Action + Scope 服务端授权；分类配置仅接受 `BUSINESS_UNIT` / `ALL` 范围。
- 附件持久化后的部门边界不再使用访问者部门回退；内容和删除接口以附件保存的范围为准，并拒绝文档/附件绑定不一致的读取。
- DOCX 追加 ZIP64、条目、解压总量和压缩比防护；审核审计不记录原始备注；内容/预览审计不记录文件正文。

| Gate | 结果 |
|---|---:|
| `pnpm run test` | 46 个文件、163 项通过 |
| `pnpm run ts-check` / `pnpm run lint` | 通过 |
| `pnpm run prisma:validate` | 通过 |
| `pnpm run build` | 通过，92 条路由 |
| `pnpm exec prisma migrate status` | 42 个 migration，up to date |
| 全量 Playwright Chromium | 34 / 34 通过 |
| 文档中心定向 Playwright | 1 / 1 通过（含绑定篡改拒绝） |
| 本地浏览器 | 页面加载正常，控制台 error 为 0 |

本批未部署、未 Push、未连接生产数据库、未导入真实员工或业务数据、未接入真实对象存储或第三方账号。
