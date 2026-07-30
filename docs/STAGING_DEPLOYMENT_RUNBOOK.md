# ERP V2 预发布部署运行手册

适用范围：择优臻选公司级 ERP V2 预发布环境。Facebook COD 是首个落地板块，不是系统边界。本文不授权生产部署、旧服务器修改、真实数据导入或 Git Push。

## 1. 发布输入与职责

- 发布物必须绑定已验收的 Git 提交哈希，构建一次后作为不可变版本使用。
- 预发布数据库、Redis、私有对象存储、域名、HTTPS 证书和 Secret 由创始人或指定运维人员提供。
- `.env.staging.example` 只描述键名；真实值通过服务器权限受控文件或 Secret Manager 注入，禁止写进镜像、日志和仓库。
- 发布前记录：提交哈希、镜像摘要、操作者、时间、数据库备份校验和、迁移清单。

## 2. 必需环境变量

| 变量 | 要求 |
|---|---|
| `NODE_ENV` | 预发布固定为 `production` |
| `APP_BASE_URL` | HTTPS 完整地址 |
| `PORT` | 应用内部监听端口，默认 3000 |
| `DATABASE_URL` | PostgreSQL 私网地址，启用 TLS |
| `REDIS_URL` | Redis 私网 TLS 地址（`rediss://`） |
| `SESSION_SECRET` | 至少 32 字符，使用密码学随机值 |
| `SESSION_TTL_SECONDS` | 300-86400；建议 28800 |
| `STORAGE_PROVIDER` | 经过评审的私有 S3/OSS 适配器，预发布禁止 `LOCAL_DEMO` |
| `SEED_FOUNDER_PASSWORD` | 默认不设置；仅经批准初始化空环境时一次性注入并立即轮换 |

配置文件落地后，仅执行不回显值的校验：

```powershell
pnpm run config:check:staging
```

## 3. Docker 与应用启动

当前 `compose.yaml` 只用于本地 PostgreSQL/Redis，不可原样当作预发布安全配置。预发布应使用私网服务、持久卷、备份、资源限制和只读 Secret。

本地基础设施验证：

```powershell
docker compose config --quiet
docker compose up -d
docker compose ps
```

应用发布顺序：

1. 核对提交哈希和构建产物摘要。
2. 按备份手册完成数据库与附件备份，并验证校验和。
3. 在同版本代码上执行 `pnpm exec prisma validate`。
4. 查看 `pnpm exec prisma migrate status`，确认待应用迁移仅来自当前发布。
5. 执行 `pnpm exec prisma migrate deploy`；预发布/生产禁止 `migrate dev`。
6. 执行 `pnpm run prisma:generate`，确保应用实例使用与本次 Schema 一致的 Prisma Client。
7. 启动一个新的应用实例，先不接收公网流量；不得复用迁移前仍在运行的旧进程。
8. 验证 `/api/health`、登录、权限菜单和关键只读页面。
9. 执行最小冒烟：测试用户登录、客户/商品读取、订单测试闭环、附件测试文件上传与删除。
10. 切换反向代理流量；保留上一不可变应用版本。

## 4. 种子策略

- `prisma/seed.ts` 只允许本地或全新空白预发布环境，不得在已有业务数据库重复执行。
- 预发布 Seed 只能使用虚构数据；运行前必须显式审批、设置一次性强密码，运行后立即轮换/停用演示账户。
- 生产默认不执行 Seed。组织、角色、菜单和动作通过受控初始化任务或后台配置建立。
- 旧 ERP 数据必须按 `GO_LIVE_CHECKLIST.md` 白名单选择和对账，不得借 Seed 导入。

## 5. 健康检查与验收

```powershell
Invoke-RestMethod https://erp-staging.example.com/api/health
```

预期包含 `ok=true` 和 `service=zyzxerp-v2`。健康接口通过不代表业务可用，还需检查：

- PostgreSQL、Redis、私有对象存储连接；
- 登录与 Session；
- 当前 Membership 上下文切换；
- 动态菜单与 API 权限一致；
- 订单、库存、物流、统一收件箱和附件冒烟；
- 审计日志写入。

## 6. 日志与故障定位

- 应用日志使用平台标准输出采集，必须脱敏；禁止记录 Cookie、JWT、密码、数据库 URL、附件内容和完整敏感字段。
- 日志至少带版本、请求 ID、用户 ID、Membership ID、业务板块 ID、路由、状态码和耗时。
- 依次排查：反向代理/证书 → 应用健康 → 环境变量校验 → PostgreSQL → Redis → 对象存储 → 权限与审计。
- `401` 检查 Session/时钟/Secret；`403/404` 检查 Membership、Action、Scope 和资源归属；`5xx` 检查同请求 ID 的应用与数据库日志。
- 迁移失败时立即停止流量切换，不得手工跳过或改迁移表；保存完整错误并按回滚手册处理。

## 7. 本地 Dry-run

预览服务运行时执行：

```powershell
pnpm run deploy:dry-run
```

它验证本地配置、Compose、Prisma、迁移状态、TypeScript、Lint、测试、生产构建和健康接口，不连接生产、不部署、不写入真实 Secret。
