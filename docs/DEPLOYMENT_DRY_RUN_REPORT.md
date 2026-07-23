# ERP V2 上线准备 Dry-run 报告

执行日期：2026-07-24（Asia/Shanghai）

执行范围：本地 ERP V2、Docker PostgreSQL/Redis；未连接旧服务器、生产数据库、真实对象存储或真实渠道。

## 执行命令

```powershell
pnpm run deploy:dry-run
```

## 结果

| Gate | 结果 | 证据摘要 |
|---|---|---|
| 本地配置校验 | 通过 | 未输出 Secret |
| 预发布占位模板防误用 | 通过 | `.env.staging.example` 被校验器按预期拒绝 |
| Docker Compose 配置 | 通过 | 配置可解析 |
| PostgreSQL | 通过 | `postgres:16-alpine`，healthy |
| Redis | 通过 | `redis:7-alpine`，healthy |
| Prisma validate | 通过 | Schema valid |
| Prisma migrate status | 通过 | 6 个迁移，数据库已是最新 |
| TypeScript / ESLint | 通过 | 无错误 |
| Vitest | 通过 | 12 个文件、33 项测试通过 |
| Production build | 通过 | Next.js 编译、类型检查和 48 个静态页面生成成功 |
| 健康检查 | 通过 | `/api/health` 返回 `ok=true`、`service=zyzxerp-v2` |

本轮未重新执行 Playwright；安全图片 Gate 的最近一次完整验收记录为 12 项 Playwright 通过，证据见 `ERP_V2_ACCEPTANCE_REPORT.md`。

## Dry-run 发现并修复

1. 现有本地 `.env` 创建较早，缺少后来增加的非敏感本地默认项。校验器最初误判为缺失。
2. 已改为本地模式读取 `.env.example` 安全基线，再由 `.env` 覆盖；预发布模式不继承本地默认值，仍要求所有配置显式提供。
3. Windows PowerShell 5 对无 BOM UTF-8 脚本中的中文字符串解析异常。Dry-run 脚本的机器执行消息改为 ASCII，避免参数边界被错误解析；中文说明保留在文档。

## 本次未执行

- 未运行 `prisma migrate deploy`，因为本地 6 个迁移均已应用；只读检查已确认最新。
- 未执行 Seed，避免重复写入现有本地演示数据。
- 未部署、未 Push、未修改旧 ERP、未导入旧数据。
- 未创建、读取或写入任何真实 Secret。
- 未验证真实域名/HTTPS、私有对象存储、恶意软件扫描、监控告警或外部备份；这些仍是上线前外部 Gate。
