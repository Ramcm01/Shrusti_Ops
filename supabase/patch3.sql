-- Vans module. Run once in the Supabase SQL editor (after ops_schema.sql and patch2.sql).

alter table vehicles add column if not exists label text;               -- e.g. 'Chromepet Van 1'
alter table event_photos add column if not exists vehicle_id uuid references vehicles(id);

-- Which van works on which event, with its own start / end dates and per-day amount billed to the client
create table event_vehicles (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  start_date date not null,
  end_date   date,                                   -- blank = still running
  daily_rate numeric(10,2) not null default 0 check (daily_rate >= 0),
  note       text,
  check (end_date is null or end_date >= start_date),
  unique (event_id, vehicle_id, start_date)
);
create index on event_vehicles (event_id);

-- One-time charges billed to the client (printing, fabrication, ...)
create type charge_kind as enum ('printing','fabrication','other');
create table event_charges (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  vehicle_id  uuid references vehicles(id),
  kind        charge_kind not null,
  description text,
  amount      numeric(12,2) not null check (amount >= 0),
  charged_on  date not null default ((now() at time zone 'Asia/Kolkata')::date),
  created_at  timestamptz not null default now()
);
create index on event_charges (event_id);

alter table event_vehicles enable row level security;
alter table event_charges  enable row level security;
create policy office_all on event_vehicles for all to authenticated using (is_office()) with check (is_office());
create policy office_all on event_charges  for all to authenticated using (is_office()) with check (is_office());

-- Vans a promoter or driver can pick today for their event (no rates shown)
create view event_vehicle_list as
select ev.event_id, ev.vehicle_id, v.label, v.number
from event_vehicles ev
join vehicles v on v.id = ev.vehicle_id
where can_view_event(ev.event_id) and not is_customer()
  and (now() at time zone 'Asia/Kolkata')::date between ev.start_date and coalesce(ev.end_date, date '9999-12-31');
revoke all on event_vehicle_list from anon;
grant select on event_vehicle_list to authenticated;

-- Per-van economics for each event
-- rental_to_date = days from start to today (or end date if earlier) x daily rate
-- cost = fuel + fines (van logs) + expenses tagged to the van + driver pay on days the driver logged this van
-- Record fuel in van logs only, not again as an expense.
create view van_economics with (security_invoker = true) as
select x.*,
       (x.rental_to_date + x.charges_billed) - (x.fuel + x.fines + x.other_costs + x.driver_pay) as margin
from (
  select ev.id as assignment_id, ev.event_id, e.name as event_name, c.name as client_name, e.branch_name,
         ev.vehicle_id, coalesce(v.label, v.number) as van, v.number as van_number,
         ev.start_date, ev.end_date, ev.daily_rate,
         case when ev.end_date is null then null else ev.end_date - ev.start_date + 1 end as contract_days,
         greatest(least(coalesce(ev.end_date, t.d), t.d) - ev.start_date + 1, 0) as days_to_date,
         greatest(least(coalesce(ev.end_date, t.d), t.d) - ev.start_date + 1, 0) * ev.daily_rate as rental_to_date,
         coalesce(ch.total, 0)  as charges_billed,
         coalesce(lg.fuel, 0)   as fuel,
         coalesce(lg.fines, 0)  as fines,
         coalesce(lg.km, 0)     as total_km,
         coalesce(lg.extra, 0)  as extra_km,
         coalesce(ex.total, 0)  as other_costs,
         coalesce(dp.pay, 0)    as driver_pay
  from event_vehicles ev
  cross join (select (now() at time zone 'Asia/Kolkata')::date as d) t
  join events e on e.id = ev.event_id
  join clients c on c.id = e.client_id
  join vehicles v on v.id = ev.vehicle_id
  left join lateral (
    select sum(amount) as total from event_charges k
    where k.event_id = ev.event_id and k.vehicle_id = ev.vehicle_id
  ) ch on true
  left join lateral (
    select sum(l.fuel_cost) as fuel, sum(l.fine) as fines, sum(l.total_km) as km, sum(l.extra_km) as extra
    from van_logs l
    where l.event_id = ev.event_id and l.vehicle_id = ev.vehicle_id
      and l.work_date between ev.start_date and coalesce(ev.end_date, date '9999-12-31')
  ) lg on true
  left join lateral (
    select sum(amount) as total from event_expenses x
    where x.event_id = ev.event_id and x.vehicle_id = ev.vehicle_id
  ) ex on true
  left join lateral (
    select sum(a.day_rate * case a.status when 'half_day' then 0.5 else 1 end) as pay
    from (select distinct l2.driver_id, l2.work_date from van_logs l2
          where l2.event_id = ev.event_id and l2.vehicle_id = ev.vehicle_id and l2.driver_id is not null) d
    join attendance a on a.person_id = d.driver_id and a.event_id = ev.event_id and a.work_date = d.work_date
    where a.approved_at is not null and a.status in ('present','half_day')
  ) dp on true
) x;

-- Event totals, now including van rental, one-time charges, van fuel and fines
drop view if exists event_cost_summary;
create view event_cost_summary with (security_invoker = true) as
select
  e.id as event_id, e.name as event_name, c.name as client_name,
  coalesce(att.staff_pay, 0)   as staff_pay,
  coalesce(adj.allowances, 0)  as allowances,
  coalesce(adj.incentives, 0)  as incentives,
  coalesce(adj.deductions, 0)  as deductions,
  coalesce(exp.transport, 0) + coalesce(vl.fuel, 0)       as transport,
  coalesce(exp.other_expenses, 0) + coalesce(vl.fines, 0) as other_expenses,
  coalesce(att.staff_pay, 0) + coalesce(adj.allowances, 0) + coalesce(adj.incentives, 0) - coalesce(adj.deductions, 0)
    + coalesce(exp.transport, 0) + coalesce(vl.fuel, 0) + coalesce(exp.other_expenses, 0) + coalesce(vl.fines, 0) as total_cost,
  coalesce(bil.billed, 0) as billed_manual,
  coalesce(chg.total, 0)  as charges_billed,
  coalesce(vr.rental, 0)  as van_rental,
  coalesce(bil.billed, 0) + coalesce(chg.total, 0) + coalesce(vr.rental, 0) as billed_total,
  coalesce(rec.received, 0) as received,
  coalesce(bil.billed, 0) + coalesce(chg.total, 0) + coalesce(vr.rental, 0) - coalesce(rec.received, 0) as client_balance,
  coalesce(bil.billed, 0) + coalesce(chg.total, 0) + coalesce(vr.rental, 0)
    - (coalesce(att.staff_pay, 0) + coalesce(adj.allowances, 0) + coalesce(adj.incentives, 0) - coalesce(adj.deductions, 0)
       + coalesce(exp.transport, 0) + coalesce(vl.fuel, 0) + coalesce(exp.other_expenses, 0) + coalesce(vl.fines, 0)) as profit
from events e
join clients c on c.id = e.client_id
left join lateral (
  select sum(a.day_rate * case a.status when 'half_day' then 0.5 else 1 end) as staff_pay
  from attendance a
  where a.event_id = e.id and a.approved_at is not null and a.status in ('present','half_day')
) att on true
left join lateral (
  select sum(amount) filter (where kind = 'allowance') as allowances,
         sum(amount) filter (where kind = 'incentive') as incentives,
         sum(amount) filter (where kind = 'deduction') as deductions
  from pay_adjustments p where p.event_id = e.id
) adj on true
left join lateral (
  select sum(amount) filter (where category in ('transport','fuel')) as transport,
         sum(amount) filter (where category not in ('transport','fuel')) as other_expenses
  from event_expenses x where x.event_id = e.id
) exp on true
left join lateral (
  select sum(fuel_cost) as fuel, sum(fine) as fines from van_logs l where l.event_id = e.id
) vl on true
left join lateral (select sum(amount) as billed from event_billing b where b.event_id = e.id) bil on true
left join lateral (select sum(amount) as total from event_charges k where k.event_id = e.id) chg on true
left join lateral (select sum(rental_to_date) as rental from van_economics z where z.event_id = e.id) vr on true
left join lateral (select sum(amount) as received from client_receipts r where r.event_id = e.id) rec on true;
