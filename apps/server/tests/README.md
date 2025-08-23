# Initialize

```bash
pgbench -h localhost -p 5432 -U postgres -d postgres -i -s 50
```

# Test with simple protocol

```bash
pgbench -h localhost -p 5432 -U postgres -d postgres -c 100 -j 10 -T 300 -M simple
```

## Example output

```bash
transaction type: <builtin: TPC-B (sort of)>
scaling factor: 10
query mode: simple
number of clients: 100
number of threads: 10
duration: 300 s
number of transactions actually processed: 685983
latency average = 43.736 ms
initial connection time = 26.622 ms
tps = 2286.433571 (without initial connection time)
```

## Custom script test (single statements, transaction pool friendly)

```bash
pgbench -h localhost -p 5432 -U postgres -d postgres -c 100 -j 10 -T 60 -f pgbench-simple.sql
```

## Example output

```bash
pgbench:pgbench: client 30 receiving
 pgbench: client 71 receiving
client 43 receiving
pgbench: client 66 receiving
pgbench: client 45 receiving
pgbench: client 8 receiving
pgbench: client 9 receiving
transaction type: pgbench-simple.sql
scaling factor: 1
query mode: simple
number of clients: 100
number of threads: 10
duration: 60 s
number of transactions actually processed: 962838
latency average = 6.234 ms
initial connection time = 33.289 ms
tps = 16041.545096 (without initial connection time)
```
