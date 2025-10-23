-- Force PostgREST to reload schema so new function body is used
DO $$ BEGIN PERFORM pg_notify('pgrst', 'reload schema'); END $$;