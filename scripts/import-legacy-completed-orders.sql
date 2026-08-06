\set ON_ERROR_STOP on

-- Imports the read-only legacy `orders` staging table into ERP V2 as completed
-- historical orders. It intentionally creates no Shipment or ShipmentEvent rows.
-- Run only after backing up ERP V2 and restoring the legacy table as public.orders.

begin;

create temporary table legacy_order_preflight as
select
  o.*,
  coalesce(nullif(btrim(o.customer_id), ''), nullif(lower(btrim(o.recipient_email)), ''),
    nullif(regexp_replace(coalesce(o.recipient_phone, ''), '\\D', '', 'g'), ''), o.id) as legacy_customer_key,
  row_number() over (partition by o.order_no order by o.created_at, o.id) as duplicate_rank
from public.orders o
where o.deleted_at is null;

create temporary table legacy_context as
select
  le.id as legal_entity_id,
  bu.id as business_unit_id,
  s.id as site_id,
  d.id as department_id,
  fallback_user.id as fallback_user_id,
  fallback_membership.id as fallback_membership_id
from "LegalEntity" le
join "BusinessUnit" bu on bu.code = 'FB-COD'
left join "Site" s on s."businessUnitId" = bu.id and s.code = 'DEFAULT_SITE'
left join "Department" d on d."businessUnitId" = bu.id and d.name = 'Facebook COD部'
join "User" fallback_user on fallback_user.username = 'adminzx'
join "Membership" fallback_membership
  on fallback_membership."userId" = fallback_user.id
 and fallback_membership."businessUnitId" = bu.id
 and fallback_membership."isActive" = true
where le.code = 'FACEBOOK_COD'
limit 1;

do $$
begin
  if (select count(*) from legacy_context) <> 1 then
    raise exception 'Legacy import context could not be resolved';
  end if;
end $$;

create temporary table legacy_employee_map as
select
  e.id as legacy_employee_id,
  e.username as legacy_username,
  e.name as legacy_name,
  coalesce(active_user.id, ctx.fallback_user_id) as target_user_id,
  coalesce(active_membership.id, ctx.fallback_membership_id) as target_membership_id,
  active_user.id is not null as matched_active_user
from public.employees_safe e
cross join legacy_context ctx
left join "User" active_user
  on lower(active_user.username) = lower(e.username)
left join "Membership" active_membership
  on active_membership."userId" = active_user.id
 and active_membership."businessUnitId" = ctx.business_unit_id
 and active_membership."isActive" = true;

insert into "Customer" (
  id, "legalEntityId", "businessUnitId", "departmentId", code, name,
  "contactName", "contactPhone", "contactEmail", address, "isActive", "createdAt", "updatedAt"
)
select
  gen_random_uuid()::text,
  ctx.legal_entity_id,
  ctx.business_unit_id,
  ctx.department_id,
  'LEGACY_' || upper(substr(md5(p.legacy_customer_key), 1, 20)),
  coalesce(nullif(btrim(max(p.recipient_name)), ''), '旧系统历史客户'),
  nullif(btrim(max(p.recipient_name)), ''),
  nullif(btrim(max(p.recipient_phone)), ''),
  nullif(lower(btrim(max(p.recipient_email))), ''),
  nullif(btrim(max(p.recipient_address)), ''),
  false,
  min(p.created_at),
  max(p.updated_at)
from legacy_order_preflight p
cross join legacy_context ctx
group by ctx.legal_entity_id, ctx.business_unit_id, ctx.department_id, p.legacy_customer_key
on conflict ("businessUnitId", code) do nothing;

create temporary table legacy_order_map as
select
  p.*,
  ctx.*,
  c.id as target_customer_id,
  coalesce(em.target_user_id, ctx.fallback_user_id) as target_user_id,
  coalesce(em.target_membership_id, ctx.fallback_membership_id) as target_membership_id,
  coalesce(em.matched_active_user, false) as matched_active_user,
  em.legacy_username,
  em.legacy_name,
  case
    when p.duplicate_rank = 1 and existing.id is null then p.order_no
    else p.order_no || '-LEGACY-' || upper(substr(md5(p.id), 1, 6))
  end as target_order_no
from legacy_order_preflight p
cross join legacy_context ctx
join "Customer" c
  on c."businessUnitId" = ctx.business_unit_id
 and c.code = 'LEGACY_' || upper(substr(md5(p.legacy_customer_key), 1, 20))
left join legacy_employee_map em on em.legacy_employee_id = p.employee_id
left join "Order" existing
  on existing."businessUnitId" = ctx.business_unit_id
 and existing."orderNo" = p.order_no;

insert into "Order" (
  id, "legalEntityId", "businessUnitId", "departmentId", "siteId", "customerId",
  "orderNo", "creatorUserId", "ownedByMembershipId", "shopId", status, currency,
  "declarationCurrency", "productValueCents", "shippingFeeCents", "codAmountCents",
  "paidAmountCents", "logisticsChannel", "recipientName", "recipientPhone",
  "recipientEmail", "recipientCountryCode", "recipientPostalCode", "recipientRegion",
  "recipientCity", "recipientAddress", "packageWeightGrams", "paymentMethod",
  "customerWhatsapp", "staffWhatsapp", "orderedAt", note, "customFields",
  "deliveredAt", "createdAt", "updatedAt"
)
select
  gen_random_uuid()::text,
  m.legal_entity_id,
  m.business_unit_id,
  m.department_id,
  m.site_id,
  m.target_customer_id,
  m.target_order_no,
  m.target_user_id,
  m.target_membership_id,
  nullif(btrim(coalesce(m.shop_id, m.shop_no)), ''),
  'COMPLETED'::"OrderStatus",
  coalesce(nullif(upper(btrim(m.cod_currency)), ''), nullif(upper(btrim(m.currency)), ''), 'EUR'),
  coalesce(nullif(upper(btrim(m.currency)), ''), nullif(upper(btrim(m.cod_currency)), ''), 'EUR'),
  greatest(0, round(coalesce(m.declared_amount, 0) * 100)::integer),
  0,
  greatest(0, round(coalesce(m.cod_amount, 0) * 100)::integer),
  0,
  null,
  nullif(btrim(m.recipient_name), ''),
  nullif(btrim(m.recipient_phone), ''),
  nullif(lower(btrim(m.recipient_email)), ''),
  nullif(upper(btrim(m.country_code)), ''),
  nullif(btrim(m.recipient_postal), ''),
  nullif(btrim(m.recipient_district), ''),
  nullif(btrim(m.recipient_city), ''),
  nullif(btrim(m.recipient_address), ''),
  case when m.weight > 0 then round(m.weight * 1000)::integer else null end,
  nullif(upper(btrim(m.payment_method)), ''),
  nullif(btrim(m.customer_whatsapp), ''),
  nullif(btrim(m.self_whatsapp), ''),
  coalesce(m.order_date::timestamp with time zone, m.created_at),
  nullif(concat_ws(E'\n', nullif(btrim(m.remarks), ''), nullif(btrim(m.shipping_remark), '')), ''),
  jsonb_build_object(
    'legacyImport', jsonb_build_object(
      'source', 'legacy-erp-129.226.206.134',
      'sourceId', m.id,
      'originalOrderNo', m.order_no,
      'originalOrderStatus', m.order_status,
      'originalShippingStatus', m.shipping_status,
      'originalTrackingNumber', m.tracking_number,
      'originalEmployeeId', m.employee_id,
      'originalEmployeeName', coalesce(m.legacy_name, m.order_creator),
      'originalEmployeeUsername', m.legacy_username,
      'employeeMatched', m.matched_active_user,
      'archivedAsCompleted', true,
      'trackingImportSuppressed', true,
      'importedAt', now()
    )
  ),
  coalesce(m.delivered_at, m.updated_at, m.created_at),
  m.created_at,
  m.updated_at
from legacy_order_map m
on conflict ("businessUnitId", "orderNo") do nothing;

insert into "OrderItem" (
  id, "orderId", "productId", "skuId", "stockControlled", "productName",
  quantity, "unitPriceCents", "subtotalCents"
)
select
  gen_random_uuid()::text,
  o.id,
  null,
  null,
  false,
  coalesce(nullif(btrim(m.chinese_product_name), ''), nullif(btrim(m.product_name), ''), '旧系统历史商品'),
  greatest(coalesce(m.quantity, 1), 1),
  case when greatest(coalesce(m.quantity, 1), 1) > 0
    then greatest(0, round(coalesce(m.cod_amount, 0) * 100)::integer) / greatest(coalesce(m.quantity, 1), 1)
    else 0 end,
  greatest(0, round(coalesce(m.cod_amount, 0) * 100)::integer)
from legacy_order_map m
join "Order" o
  on o."businessUnitId" = m.business_unit_id
 and o."orderNo" = m.target_order_no
where not exists (select 1 from "OrderItem" oi where oi."orderId" = o.id);

do $$
declare
  source_count integer;
  imported_count integer;
  shipment_count integer;
begin
  select count(*) into source_count from legacy_order_preflight;
  select count(*) into imported_count
  from "Order"
  where "customFields"->'legacyImport'->>'source' = 'legacy-erp-129.226.206.134';
  select count(*) into shipment_count
  from "Shipment" s
  join "Order" o on o.id = s."orderId"
  where o."customFields"->'legacyImport'->>'source' = 'legacy-erp-129.226.206.134';

  if imported_count <> source_count then
    raise exception 'Imported order count % does not match source count %', imported_count, source_count;
  end if;
  if shipment_count <> 0 then
    raise exception 'Legacy completed orders unexpectedly created % shipments', shipment_count;
  end if;
end $$;

commit;

select
  count(*) as imported_orders,
  count(*) filter (where status = 'COMPLETED') as completed_orders,
  count(*) filter (where "customFields"->'legacyImport'->>'employeeMatched' = 'false') as fallback_owned_orders
from "Order"
where "customFields"->'legacyImport'->>'source' = 'legacy-erp-129.226.206.134';

select count(*) as imported_shipments
from "Shipment" s
join "Order" o on o.id = s."orderId"
where o."customFields"->'legacyImport'->>'source' = 'legacy-erp-129.226.206.134';
