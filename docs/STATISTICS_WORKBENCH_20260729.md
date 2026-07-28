# 统计报表工作台（2026-07-29）

## 功能范围

- 保留旧 ERP 的期间订单、COD 金额、覆盖国家、日均开单、订单趋势、国家分布和员工排行。
- 支持自定义日期、近 7 天、近 30 天、部门、员工和分页筛选。
- 多币种金额分别统计，禁止无汇率配置时直接相加。
- 员工默认只看本人；上级仅能查看 `report.team.view` 授权范围内的下属。
- 部门和员工筛选项由服务端根据当前 Membership 动态返回。
- 新增数据库菜单“统计报表”及“数据与报表”导航分组，角色权限和菜单权限仍可独立配置。

## 权限动作

- `report.view`：查看本人统计。
- `report.team.view`：查看授权范围内的团队统计。

前端筛选不作为权限依据。API 对每个候选 Membership 执行 Action + Scope 校验，跨业务板块或越权筛选返回拒绝。

## 验证

- 销售演示账号：只能看到本人，API 返回 `CanViewTeam=false`。
- 创始人演示账号：可见 9 个授权 Membership，API 返回 `CanViewTeam=true`。
- Lint、TypeScript、Vitest、Prisma validate、Next.js production build 均通过。
- 本地服务健康检查及登录后统计 API 调用通过。

## 当前边界

- 单次统计查询最多读取 50,000 条订单；超出时页面提示缩小日期范围。
- 未实现文件导出，后续需增加独立 `report.export` 动作和异步导出任务。
- 未部署、未 Push、未连接生产数据。
