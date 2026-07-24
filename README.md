# 择优臻选 ERP V2

择优臻选公司级 ERP V2，可通过配置服务多个公司、业务板块和部门。组织、Membership、角色、动作、Scope、菜单和临时授权均由数据库配置，不依赖角色名或业务板块名称判断。Facebook COD 是首个落地板块和演示数据，不是系统边界。

## 本地运行

要求 Node.js 20+、pnpm 10+、PostgreSQL 16。推荐使用 Docker：

```powershell
Copy-Item .env.example .env
docker compose up -d
pnpm install
pnpm run prisma:generate
pnpm run prisma:migrate:dev
pnpm run db:seed
pnpm dev
```

上线准备与本地 dry-run：

```powershell
pnpm run config:check:local
pnpm run deploy:dry-run
```

预发布配置以 `.env.staging.example` 为键名模板，真实值只能在服务器或 Secret Manager 注入。相关门禁见：

- `docs/STAGING_DEPLOYMENT_RUNBOOK.md`
- `docs/BACKUP_ROLLBACK_RUNBOOK.md`
- `docs/GO_LIVE_CHECKLIST.md`
- `docs/DEPLOYMENT_DRY_RUN_REPORT.md`

打开 `http://localhost:3000/login`。Seed 默认演示账号为 `founder`，密码来自 `SEED_FOUNDER_PASSWORD`；未设置时仅本地使用 `ChangeMe#2026`，任何共享或正式环境必须替换。

## 质量门禁

```powershell
pnpm lint
pnpm ts-check
pnpm test
pnpm run prisma:validate
pnpm build
```

## 安全边界

- 所有业务 API 从已验签 Session 的当前 Membership 推导组织上下文，不信任请求体中的组织 ID。
- 敏感接口同时校验 Action、Scope 和 Membership；前端菜单隐藏不视为鉴权。
- Access Grant 必须满足 Delegation Rule，撤销或到期后菜单和 API 同时失效。
- 金额以最小货币单位整数保存；库存使用数据库事务、条件更新和幂等流水，禁止负库存与静默跳过。
- `.env`、真实密码、Token、Session、旧生产数据不得提交。

## 发布与回滚

构建产物应绑定 Git 提交哈希并作为不可变版本发布。切换版本前执行迁移备份和健康检查；应用回滚切换到上一不可变版本。数据库迁移必须优先采用向前兼容的 expand/contract 策略，不依赖自动降级脚本。发布后若客户端仍加载旧资源，先确认入口 HTML 未被长缓存，再按版本清理 CDN 缓存。

当前任务不授权生产部署、push 或旧系统清理。
