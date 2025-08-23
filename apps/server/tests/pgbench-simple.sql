-- Simple transaction script for pgbench with transaction pooling
-- Compatible with PgBouncer transaction mode
-- Each line is executed as a separate transaction

\set aid random(1, 100000 * :scale)
\set delta random(-5000, 5000)
UPDATE pgbench_accounts SET abalance = abalance + :delta WHERE aid = :aid;