# Initialize

```bash
pgbench -h localhost -p 5432 -U postgres -d postgres -i -s 50
```

# Test with simple protocol

```bash
ulimit -n 20000 && pgbench -h localhost -p 5432 -U postgres -d postgres -c 10500 -j 150 -T 60 -M simple -P 10
```

## Example output

```bash
transaction type: <builtin: TPC-B (sort of)>
scaling factor: 50
query mode: simple
number of clients: 10500
number of threads: 150
duration: 60 s
number of transactions actually processed: 111259
latency average = 5725.314 ms
latency stddev = 987.882 ms
initial connection time = 2513.284 ms
tps = 1732.598854 (without initial connection time)
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
