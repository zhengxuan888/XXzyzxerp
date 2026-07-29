# Ship24 自动同步运行手册

## 配置

```env
SHIP24_ENABLED="true"
SHIP24_API_KEY="由 Secret Manager 注入"
SHIP24_API_BASE_URL="https://api.ship24.com"
SHIP24_SYNC_INTERVAL_MINUTES="30"
```

同步脚本不会在没有 `SHIP24_ENABLED=true` 或没有 API Key 时运行。间隔建议 30 分钟，需要降低频率时设置为 60。

## 执行

```bash
pnpm ship24:sync
```

生产环境使用系统调度器执行，不把脚本常驻在 Web 请求进程中：

- Linux cron 建议每 5 分钟触发一次：`*/5 * * * * cd /srv/erp-v2 && pnpm ship24:sync >> /var/log/erp-v2/ship24-sync.log 2>&1`
- 脚本会读取每个业务板块在 ERP“物流追踪 → 配置工作台”中设置的同步间隔（默认 30 分钟），未到期的记录自动跳过。
- 未点击“确认发货”的 `PENDING` 物流记录不会提交给 Ship24。
- Windows 任务计划：每 30 分钟运行 `pnpm ship24:sync`，工作目录指向 V2 项目。

## 安全与失败处理

- API Key 只放 Secret Manager 或服务器受限环境变量，不进入 Git、日志和前端。
- 每条事件使用 `source + externalEventKey` 幂等写入，重复同步不重复创建轨迹。
- 单个物流失败不会阻断其他物流；失败会输出脱敏错误和订单/物流 ID。
- 真实启用前必须确认 Ship24 账户套餐、限流、Webhook 签名格式和允许来源。
- 脚本不会自动联系客户；提醒和售后待办由 ERP 内部规则处理。
