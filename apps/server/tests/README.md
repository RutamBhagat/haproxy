# Initialize

```bash
pgbench -h localhost -p 5432 -U postgres -d postgres -i -s 50
```

# Test with simple protocol

```bash
pgbench -h localhost -p 5432 -U postgres -d postgres -c 1000 -j 10 -T 300 -M simple
```

## Example output

```bash
transaction type: <builtin: TPC-B (sort of)>
scaling factor: 50
query mode: simple
number of clients: 1000
number of threads: 10
duration: 300 s
number of transactions actually processed: 599913
latency average = 500.245 ms
initial connection time = 387.932 ms
tps = 1999.019226 (without initial connection time)
```

## Custom script test (single statements, transaction pool friendly)

```bash
pgbench -h localhost -p 5432 -U postgres -d postgres -c 100 -j 10 -T 60 -f pgbench-simple.sql
```

## Example output

```bash
transaction type: pgbench-simple.sql
scaling factor: 1
query mode: simple
number of clients: 100
number of threads: 10
duration: 60 s
number of transactions actually processed: 855841
latency average = 7.010 ms
initial connection time = 12.075 ms
tps = 14265.844597 (without initial connection time)
```
