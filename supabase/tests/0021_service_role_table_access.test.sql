BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND NOT has_table_privilege(
        'service_role',
        relation.oid,
        'SELECT,INSERT,UPDATE,DELETE'
      )
  ),
  0,
  'service role can read and mutate every application table'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_class sequence
    JOIN pg_namespace namespace ON namespace.oid = sequence.relnamespace
    WHERE namespace.nspname = 'public'
      AND CASE
        WHEN sequence.relkind = 'S' THEN NOT has_sequence_privilege(
          'service_role',
          sequence.oid,
          'USAGE,SELECT,UPDATE'
        )
        ELSE false
      END
  ),
  0,
  'service role can use every application sequence'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND has_table_privilege(
        'anon',
        relation.oid,
        'SELECT,INSERT,UPDATE,DELETE'
      )
  ),
  0,
  'anon still has no application-table data privileges'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND has_table_privilege(
        'authenticated',
        relation.oid,
        'SELECT,INSERT,UPDATE,DELETE'
      )
  ),
  0,
  'authenticated still has no application-table data privileges'
);

CREATE TABLE public.service_role_default_table_probe (id integer);
CREATE SEQUENCE public.service_role_default_sequence_probe;

SELECT ok(
  has_table_privilege(
    'service_role',
    'public.service_role_default_table_probe',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'future tables inherit server data privileges'
);

SELECT ok(
  has_sequence_privilege(
    'service_role',
    'public.service_role_default_sequence_probe',
    'USAGE,SELECT,UPDATE'
  ),
  'future sequences inherit server data privileges'
);

SELECT * FROM finish();
ROLLBACK;
