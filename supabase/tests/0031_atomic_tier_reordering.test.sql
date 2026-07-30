BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(8);

INSERT INTO tiers (id, name, label, sort_order)
VALUES
  ('31000000-0000-0000-0000-000000000001', 'Swap A', 'Swap A', 3101),
  ('31000000-0000-0000-0000-000000000002', 'Swap B', 'Swap B', 3102);

SELECT is(
  swap_tier_sort_orders(
    '31000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000002'
  ),
  true,
  'two existing tiers swap atomically'
);
SELECT is(
  (SELECT sort_order FROM tiers WHERE id = '31000000-0000-0000-0000-000000000001'),
  3102,
  'the first tier receives the second position'
);
SELECT is(
  (SELECT sort_order FROM tiers WHERE id = '31000000-0000-0000-0000-000000000002'),
  3101,
  'the second tier receives the first position'
);
SELECT is(
  (SELECT count(*)::integer FROM tiers WHERE sort_order IN (3101, 3102)),
  2,
  'the unique position invariant remains intact'
);
SELECT is(
  swap_tier_sort_orders(
    '31000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000099'
  ),
  false,
  'a missing tier fails closed'
);
SELECT is(
  (SELECT sort_order FROM tiers WHERE id = '31000000-0000-0000-0000-000000000001'),
  3102,
  'a failed swap preserves the first tier'
);
SELECT is(
  swap_tier_sort_orders(
    '31000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001'
  ),
  false,
  'a self-swap is rejected'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.swap_tier_sort_orders(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot invoke the service-only swap'
);

SELECT * FROM finish();
ROLLBACK;
