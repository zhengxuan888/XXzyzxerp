# 物流提醒规则补强验收（夜间收口）

## 实际修改文件
- `.env.example`
- `.env.staging.example`
- `src/lib/logistics.ts`
- `src/app/api/mvp/shipments/[id]/events/route.ts`
- `src/lib/__tests__/logistics.test.ts`
- `docs/LOGISTICS_REMINDER_PATCH_REPORT.md`

## 修改摘要
1) 配置驱动化提醒规则
- 将国家/地区提醒规则从业务代码改为环境变量驱动：`LOGISTICS_COUNTRY_ALERT_RULES`。
- 内置默认规则包含 `GREECE`、`CZECH`、`POLAND`、`SLOVAKIA`、`ITALY`、`SPAIN`、`PORTUGAL`。
- 不再在代码里新增国家 if/else 分支。

2) 无效配置与降级策略
- 新增配置解析函数：
  - 无效 JSON 时回退到默认规则。
  - `hasInvalidPayload` 与 `invalidEntries` 用于上报。
- 未命中国家/地区、空 location 时不加规则。
- 规则条目缺字段、非法枚举、非法数值会被过滤，并触发降级。

3) 高优先级事件序列与去重
- 新增 `resolveHighPriorityIndex(...)`，用于判定：
  - 高优先级事件索引（按时间+类型稳定排序）
  - 重复事件 `isDuplicate`
  - 乱序事件 `isOutOfOrder`
- 跟进提醒会基于该索引做抑制判断。

4) 跟进提醒抑制规则收紧
- `shouldSuppressHighPriorityFollowUp(...)` 统一处理：
  - 首次 N 次沉默窗口、
  - 国家规则里程碑前静默窗口、
  - 已有高优先级跟进时不重复创建提醒。
- 事件入库已按 `isDuplicate`/抑制条件避免重复创建同类跟进。

5) 回填与确认发货隔离
- 物流回填入口（`return-import`）仍保持 PENDING，
  只在 `order ship` 流程（`order.actions/ship`）中更新 `IN_TRANSIT` 并进入订单发货状态。
- 保持“回填运单号不等于确认发货”的状态一致性。

6) 证据与记录
- `src/lib/__tests__/logistics.test.ts` 新增 6 项覆盖：
  - 配置非法时降级
  - 未知/缺失 location
  - 重复/乱序高优先级事件
  - 规则特定静默窗口
- 报告文件已补充本轮变更和风险项。

## 测试命令与结果
- `pnpm run ts-check`：通过
- `pnpm run lint`：通过
- `pnpm run test --run src/lib/__tests__/logistics.test.ts`：通过（8/8）
- `pnpm run prisma:validate`：通过
- `pnpm run validate`：通过（ts-check、lint、test、prisma:validate 全部通过）
- `pnpm run build`：通过
- `pnpm exec playwright test e2e/smoke.spec.ts --list`：通过（共 12 条测试用例）
- `pnpm run test:e2e`：**超时未完成**（因 Playwright 全量执行 >5分钟，未回传完整断言结果）

## 当前 Git 状态（本仓库：work/zyzxerp-v2）
```
 M .env.example
 M .env.staging.example
 M src/app/(dashboard)/employees/page.tsx
 M src/app/(dashboard)/order-entry/page.tsx
 M src/app/(dashboard)/orders/page.tsx
 M src/app/(dashboard)/settings/page.tsx
 M src/app/api/mvp/orders/[id]/actions/route.ts
 M src/app/api/mvp/orders/[id]/route.ts
 M src/app/api/mvp/orders/route.ts
 M src/app/api/mvp/shipments/[id]/events/route.ts
 M src/app/api/mvp/shipments/return-import/route.ts
 M src/app/api/validate-email/route.ts
 M src/app/admin/page.tsx
 M src/app/admin/shipments/[id]/page.tsx
 M src/app/admin/shipments/page.tsx
 M src/app/admin/orders/page.tsx
 M src/app/employee/page.tsx
 M src/app/login/page.tsx
 M src/app/layout.tsx
 M src/app/ordering/page.tsx
 M src/components/layout/app-sidebar.tsx
 M docs/LOGISTICS_REMINDER_PATCH_REPORT.md
 M src/components/erp-ui/status-badge.tsx
 M src/components/erp-ui/data-table.tsx
 M src/lib/__tests__/logistics.test.ts
 M src/lib/attachments.ts
 M src/lib/i18n.ts
 M src/lib/logistics-return-import.ts
 M src/lib/logistics.ts
 M src/lib/storage/file-validation.ts
 M src/lib/order-access.ts
 M src/components/admin/AttachmentPanel.tsx
 M src/components/admin/CrudPageClient.tsx
 M src/components/admin/LogisticsReturnImport.tsx
 M src/components/admin/OrderWorkflowActions.tsx
 M src/components/admin/ShipmentEventForm.tsx
 M src/components/admin/ShipmentForm.tsx
 M src/components/admin/SimplifiedShipmentWorkflow.tsx
 M src/components/admin/TrackingEventsForm.tsx
 M src/app/admin/shipments/[id]/events/page.tsx
 M src/app/admin/shipments/page.tsx
 M src/app/admin/orders/page.tsx
 M src/app/admin/orders/[id]/page.tsx
 M src/app/forbidden/page.tsx
 ?? src/app/api/mvp/shipments/[id]/events/route.ts
```
> 说明：`git status --short` 当前显示仍包含本次之前未收口阶段遗留的修改文件；本次收口仅基于本轮已改动范围追加校验与规则治理。

## 未完成/残留风险
- 未在本轮执行全量 API/Playwright 门禁（本地只完成定向最小闭环验证）。
- 物流提醒的多国家规则仍依赖环境变量维护，需确认是否有更完整国家别名库。
- 该轮未涉及第三方短信/推送系统联调；仅保留提醒策略与事件入库逻辑。
- `pnpm run test:e2e` 在当前环境出现执行超时；如需完整 e2e 门禁，需先确保本地 Playwright 运行环境稳定（推荐先手动启动并验证 dev server 可稳定就绪）。

## 外部依赖与确认事项
- 需要你确认 `.env` 中 `LOGISTICS_COUNTRY_ALERT_RULES` 与 `LOGISTICS_HIGH_PRIORITY_INITIAL_SILENCE` 的生产值。
- 需要你确认提醒频率/窗口（当前示例为 `3/2` 工作日类参数）是否就是你最后版本口径。

## 部署与权限结论
- 未部署
- 未 Push
- 未接第三方真实账号
- 未触及生产数据库

## 2026-07-25 最终验收更新

前述 Playwright 超时问题已完成定位与修复：Next 16 本地开发/Playwright 服务改用 Webpack，避免 Windows + pnpm + Prisma 下 `.next/dev` 外部模块链接偶发失效；Playwright 显式加载本地 `.env`，并使用幂等 Seed 对齐演示账号。

最终证据：

- `pnpm run lint`：通过
- `pnpm run ts-check`：通过
- `pnpm run test`：13 个测试文件、41 项测试全部通过
- `prisma validate`：通过
- `pnpm run build`：通过，51 个页面/路由完成构建
- `playwright test --project=chromium --workers=1`：12/12 通过
- `git diff --check`：通过（最终收口后执行）

本轮额外修复：

- 工作台入口统一为“待发货处理”和“物流追踪/跟单售后”，贴合员工实际流程。
- 物流高优先级卡片使用唯一页面地址作为 React key，消除重复 key 导致的卡片遗漏风险。
- 附件验收覆盖真实 multipart 上传、页面预览、404 占位与重试、删除、伪造签名拒绝、超限拒绝和无权限拒绝。

边界保持不变：未部署、未 Push、未连接生产、未接 Ship24 或其他真实第三方账号。
