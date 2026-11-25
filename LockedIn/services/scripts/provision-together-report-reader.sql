-- Run as the owner of the migrated database, with psql ON_ERROR_STOP enabled.
-- Deliberately create a fresh, disabled login. Set its password separately with
-- psql's \password, then enable LOGIN. No password belongs in this file.
BEGIN;

CREATE ROLE lockedin_report_reader NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS;

DO $grant$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO lockedin_report_reader', current_database());
END
$grant$;

GRANT USAGE ON SCHEMA lockedin_reporting TO lockedin_report_reader;
GRANT EXECUTE ON FUNCTION lockedin_reporting.weekly_together_report(DATE) TO lockedin_report_reader;
ALTER ROLE lockedin_report_reader SET default_transaction_read_only = on;
ALTER ROLE lockedin_report_reader SET statement_timeout = '10s';

-- Refuse provisioning if the host already grants broad privileges via PUBLIC.
-- Do not revoke shared grants automatically; the database owner reviews them.
DO $verify$
DECLARE
  reader CONSTANT text := 'lockedin_report_reader';
BEGIN
  IF has_database_privilege(reader, current_database(), 'CREATE') OR EXISTS (
    SELECT 1 FROM pg_namespace n
    WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
      AND has_schema_privilege(reader, n.oid, 'CREATE')
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (has_table_privilege(reader, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        OR has_any_column_privilege(reader, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema' AND p.prosecdef
      AND p.oid <> 'lockedin_reporting.weekly_together_report(date)'::regprocedure
      AND has_schema_privilege(reader, n.oid, 'USAGE') AND has_function_privilege(reader, p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Existing database grants would let the reporting login access more than the report.';
  END IF;
END
$verify$;

COMMIT;
