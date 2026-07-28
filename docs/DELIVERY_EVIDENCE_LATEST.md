# ERP V2 最新交付证据

更新时间：2026-07-29

当前提交：`14749bf docs: record deployment dry run evidence`

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
