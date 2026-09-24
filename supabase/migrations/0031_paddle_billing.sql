-- Paddle Billing — webhook-owned columns on subscriptions + seat propagation to companies.
-- Run against the same Supabase project that already has 0001-0030 applied (0024-0030 live in the
-- desktop repo; numbering is shared across both repos, so this is 0031 in BOTH — copy it verbatim
-- into C:\Users\Arda\colega\supabase\migrations before that repo's next `db push`).
--
-- Additive only: two new columns, one new function, two new triggers. No policy is added or
-- widened — subscriptions and organization_seat_entitlements stay service_role-write-only, and the
-- only writer of these columns is the Paddle webhook (src/app/api/webhooks/paddle/route.ts).
--
--   * additional_seats   — Teams seats bought beyond the 3 included ones (the "Additional Seat"
--                          price's quantity). Lives on the USER's subscription because a Teams
--                          purchase can happen before the buyer has created a company.
--   * billing_event_at   — occurred_at of the last Paddle event applied to this row. Paddle does not
--                          deliver in order; the webhook skips any event older than this.
--
-- Propagation into organization_seat_entitlements (0025), which is what the seat limit actually
-- reads:
--   * when additional_seats changes -> every company the user owns
--   * when the user later creates a company -> that new company
-- Rows an operator set by hand (source not null and <> 'paddle') are never overwritten.

alter table public.subscriptions
  add column if not exists additional_seats integer not null default 0
    check (additional_seats between 0 and 10000),
  add column if not exists billing_event_at timestamptz;

create or replace function public.apply_paddle_seats_for_owner(target_owner_id uuid, target_org_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  seats integer;
  sub_id text;
begin
  select s.additional_seats, s.billing_subscription_id
  into seats, sub_id
  from public.subscriptions s
  where s.user_id = target_owner_id;

  if seats is null then
    return;
  end if;

  insert into public.organization_seat_entitlements (org_id, additional_seats, source, billing_reference)
  select o.id, seats, 'paddle', sub_id
  from public.organizations o
  where o.owner_id = target_owner_id
    and (target_org_id is null or o.id = target_org_id)
  on conflict (org_id) do update
    set additional_seats = excluded.additional_seats,
        source = excluded.source,
        billing_reference = excluded.billing_reference
    where organization_seat_entitlements.source is null
       or organization_seat_entitlements.source = 'paddle';
end;
$$;

revoke all on function public.apply_paddle_seats_for_owner(uuid, uuid) from public;
revoke all on function public.apply_paddle_seats_for_owner(uuid, uuid) from anon;
revoke all on function public.apply_paddle_seats_for_owner(uuid, uuid) from authenticated;

create or replace function public.subscriptions_propagate_seats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.additional_seats is distinct from old.additional_seats then
    perform public.apply_paddle_seats_for_owner(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_propagate_seats on public.subscriptions;
create trigger subscriptions_propagate_seats
  after insert or update of additional_seats on public.subscriptions
  for each row execute function public.subscriptions_propagate_seats();

create or replace function public.organizations_apply_owner_seats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.apply_paddle_seats_for_owner(new.owner_id, new.id);
  return new;
end;
$$;

drop trigger if exists organizations_apply_owner_seats on public.organizations;
create trigger organizations_apply_owner_seats
  after insert on public.organizations
  for each row execute function public.organizations_apply_owner_seats();
