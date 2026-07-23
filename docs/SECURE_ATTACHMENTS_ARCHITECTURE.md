# 安全图片与附件架构

## 范围

本批实现本地可运行的商品图片和统一收件箱附件闭环，不连接生产对象存储。存储只依赖 `StorageAdapter`，当前实现为 `LOCAL_DEMO`；未来 S3、OSS 或其他后端必须实现同一 `put/get/delete/exists` 契约，不允许业务 API 直接依赖供应商 SDK。

## 威胁模型与控制

| 风险 | 控制 |
|---|---|
| 伪造 `Content-Type` | 服务端检查文件魔数/签名，声明 MIME 必须与真实签名一致 |
| 危险扩展名 | 扩展名白名单并与真实 MIME 对应；拒绝 EXE、脚本、SVG 和未知格式 |
| 路径穿越 | 客户端文件名不参与存储路径；存储键为 UUID + 固定扩展名；Adapter 再验证键格式和最终绝对路径 |
| 超大文件/内存耗尽 | 图片最大 5MB，PDF 最大 10MB；在读取 ArrayBuffer 前先检查 `File.size` |
| 跨板块/跨部门枚举 | 服务端从 Session Membership 推导业务板块；目标资源归属 + Action + Scope 双重校验；无权读取与不存在统一返回 404 |
| 可执行内容被浏览器解释 | 仅允许 PNG/JPEG/WebP/PDF；返回 `nosniff`、私有不缓存和沙箱 CSP |
| 文件名冲突/覆盖 | 安全随机 UUID 存储键，Local Adapter 使用独占创建 `wx` |
| 数据库失败留下孤儿 | 存储成功但数据库失败时立即删除对象 |
| 删除不可追溯 | 对象删除、附件记录软删除，并写 Audit Log |
| 存储对象丢失 | 内容接口返回 404；前端显示失败占位和重试按钮 |

## 数据模型

`Attachment` 保存：

- `legalEntityId`、`businessUnitId`、`departmentId`
- `targetType`、`targetId`
- 原始显示名和不可预测 `storageKey`
- MIME、规范扩展名、大小、SHA-256
- 存储 Provider、状态、上传人及 Membership
- 删除时间与审计关联证据

当前目标类型只有 `PRODUCT` 和 `CONVERSATION`。目标类型不是任意客户端字符串：服务端必须先解析目标资源，并验证其业务板块和部门归属。

## 权限动作

- `attachment.read`
- `attachment.create`
- `attachment.delete`

前端只用于改善体验，所有内容读取、上传和删除均在 API 再次执行 Membership + Action + Scope。

## 本地存储

本地文件位于项目根目录 `.local-storage/`，已被 Git 忽略。目录仅用于开发演示，不是共享盘、备份或生产存储。

生产适配器上线前必须增加：

- 私有 Bucket、服务端加密和密钥轮换
- 短时签名 URL 或受控代理读取
- 病毒/恶意文档扫描与隔离状态
- 生命周期、合法保留、删除证明和备份恢复
- 分片上传、并发限制、可观测性与成本告警

## 回滚

迁移 `20260723224949_secure_attachments` 为 expand-only。应用回滚后新表可保留不用；Local Demo 文件可在确认无业务价值后清理。生产环境不得通过回滚应用直接删除对象或附件记录。
