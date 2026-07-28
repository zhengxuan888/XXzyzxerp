# 旧 ERP → ERP V2 最新功能对照审计

审计日期：2026-07-27  
范围：订单录入、员工订单可见性、核单、发货、物流追踪、售后  
方式：只读检查旧仓库 `zyzxerp` 与 V2 源码；未连接生产、未修改旧 ERP。

## 结论

V2 已有订单、核单、发货、物流和售后页面及基础 API，但目前仍不是旧 ERP 的逐项等价替换。旧 ERP 的录单页已经包含 Excel 批量导入、智能文本/地址辅助、图片拖拽上传与预览；V2 已有部分智能地址辅助和订单模板，但客户沟通凭证仍提示在订单详情页上传，尚未完全恢复旧 ERP 的“录单页内上传并预览”体验。旧 ERP 还允许物流回填接口直接改变订单状态为 shipped，这是已识别的旧缺陷；V2 的目标规则应保持“回填运单号 ≠ 确认发货”。

## 逐模块对照

| 模块 | 旧 ERP 证据 | V2 当前证据 | 对照结论 |
|---|---|---|---|
| 手工录单 | `src/app/(dashboard)/order-entry/page.tsx:327-456,1074-1507`；订单号、店铺、物流渠道、商品/SKU、收件人、邮箱、WhatsApp、COD、备注均在同一页 | `src/components/admin/OrderEntryForm.tsx:197-316`；包含订单号占位、店铺 ID、商品、收件人、COD、邮箱/WhatsApp | 基础字段已覆盖；需继续逐字段核验必填、默认值和错误提示 |
| 客户模型 | 旧录单允许手工填写客户资料，客户档案不是前置必选 | V2 `src/app/api/mvp/orders/route.ts:180-247` 支持可选历史客户匹配，无匹配时按当前业务范围创建客户 | 业务方向一致；不能改成固定客户下拉 |
| 客户沟通凭证 | 旧页 `order-entry/page.tsx:457-516,1459-1507` 直接拖拽/选择图片并显示预览 | V2 `OrderEntryForm.tsx:179-180` 只提示创建后到详情页上传；附件能力位于详情附件模块 | 功能存在但操作路径不等价；待单页上传、预览、提交核单闭环 |
| Excel 批量录单 | 旧页 `order-entry/page.tsx:549-618,895-920`；支持 Excel 选择、解析和批量订单 | V2 已增加订单页上传/预览/逐行错误/确认导入 UI 和批量 API；全部通过后才以单事务写入，并预检当前业务板块商品、文件/数据库重复订单号 | 代码闭环完成；专项 4/4、TypeScript、Lint、Prisma、Build 通过。PostgreSQL 未运行，数据库集成与员工页面验收仍待完成 |
| 智能文本/地址 | 旧页 `order-entry/page.tsx:668-771,942-1048` | V2 `OrderEntryForm.tsx:269` 有智能地址辅助区 | 已恢复基础能力；需补齐旧版解析字段和人工确认提示的回归测试 |
| 员工自己的订单 | 旧 `src/app/api/orders/route.ts:44-70,109-182,196-204` 对普通员工强制当前 employee_id，并提供状态统计 | V2 订单页显示“我的订单”统计；API 为 Membership 范围查询 | 方向一致；需验证普通员工不能通过 employeeId 读取他人订单，及统计与列表同一范围 |
| 核单 | 旧 `fulfillment-review/page.tsx:143-188,260-598`；审核中/退回，退回原因必填，支持详情和导出 | V2 `src/app/admin/order-review/page.tsx`、`src/app/api/mvp/approvals/[id]/review/route.ts` | 已有基础流程；需对照重复/重复订单标签、作废原因、附件前置条件 |
| 核单状态 | 旧 `src/app/api/orders/[id]/review/route.ts:19-73` 仅 pending/reviewing 可审核，approve/reject 分支 | V2 使用显式动作 API | 需增加状态机非法迁移测试，避免通用更新绕过核单 |
| 待发货 | 旧 `src/app/api/orders/pending-ship/route.ts:5-97`；权限不足 403，限定 confirmed/待发货范围 | V2 `src/app/admin/shipping/page.tsx` 与订单动作 API | 页面存在；需验证普通录单员工不可读待发货队列 |
| 发货凭证与确认 | 旧 `src/app/api/orders/[id]/ship/route.ts:21-68` 物流单号或凭证校验后更新 shipped | V2 设计为上传凭证后点击确认发货，动作独立 | V2 规则更安全；必须保留“回填运单号不能自动确认发货”测试 |
| 物流商模板导出 | 旧 `logistics-tracking/page.tsx:583-721` 支持模板映射、导出 | V2 有订单模板/物流模板页面及 shipment APIs | 需用用户提供的五种模板做字段映射验收，不能把承运商写死 |
| 回传物流单号 | 旧 `logistics-tracking/page.tsx:723-809` 通过订单号/物流单号匹配，显示未匹配清单 | V2 `src/app/api/mvp/shipments/return-import/route.ts` | 已有能力；需核验重复订单、空单号、错误行和幂等行为 |
| 物流轨迹 | 旧 `logistics-tracking/page.tsx:316-1061,1712-1944`；筛选、Ship24、事件、未处理、单条备注、处理标记、48 小时未更新 | V2 `src/app/admin/shipments/page.tsx`、`[id]/page.tsx`、events/annotation APIs | 基础模型已存在；需逐项确认国家提醒规则、异常待办、事件备注/标签、权限拆分 |
| 物流权限 | 旧页面含物流单号、轨迹、事件处理入口；权限在旧代码/接口中分散 | V2 计划拆分 `shipment.tracking_no.view`、`shipment.timeline.view` 等 | 需完成后端 Action + Scope 测试，员工只见“运输中”时不得读单号/轨迹 |
| 售后 | 旧 `src/app/(dashboard)/aftersales/page.tsx`、`manager/aftersales/*`、`api/aftersales*` 有跟踪统计、日报 | V2 shipment follow-ups API 与物流页面存在 | 需补售后工作台的客户联系方式、每条轨迹跟进、标签和高优先级提醒回归 |

## 已确认的旧 ERP 风险（V2 不得复制）

1. `src/app/api/orders/route.ts:511-532`：更新 tracking_number 时可能自动把 `order_status` 改为 `shipped`。V2 必须保持运单号回填与确认发货分离。
2. 旧权限和角色判断分散在页面/API；V2 必须由 Membership + Action + Scope + Access Grant 统一计算。
3. 旧物流页面包含较多前端状态和承运商模板分支；V2 应将模板、国家提醒和菜单权限配置化。

## 交付前 Gate（按旧功能逐项验收）

- [ ] 录单页同屏完成客户资料、图片/PDF 上传、预览、删除、提交核单。
- [ ] Excel 批量导入支持模板、预览、逐行错误、确认写入、失败行不写入。代码与构建已完成，待 PostgreSQL 集成和员工页面验收后勾选。
- [ ] 智能地址解析覆盖旧字段，并保留人工核对。
- [ ] 普通员工只能看本人订单和统计；上级按配置查看下属。
- [ ] 核单退回原因、作废原因、重复订单标记和审计完整。
- [ ] 物流商模板可配置扩展；回传单号幂等匹配，回填不等于发货。
- [ ] 发货凭证 + 确认发货后才进入物流追踪。
- [ ] 物流单号、轨迹、轨迹备注、售后跟进分别做后端权限校验。
- [ ] 国家/地区提醒规则配置化，未知国家和乱序事件安全降级。

本报告仅记录差异与证据，不代表上述待办已经全部完成。
