## Monitoring dashboard

http://192.168.1.100:8404/stats

## Initialize

```bash
PGPASSWORD=password pgbench -h 192.168.1.100 -p 5432 -U postgres -d postgres -i -s 50
```

## Test with simple protocol

```bash
ulimit -n 20000 && PGPASSWORD=password pgbench -h 192.168.1.100 -p 5432 -U postgres -d postgres -c 105 -j 150 -T 60 -M simple -P 10
```

## Example output

```bash
transaction type: <builtin: TPC-B (sort of)>
scaling factor: 50
query mode: simple
number of clients: 105
number of threads: 105
duration: 60 s
number of transactions actually processed: 264816
latency average = 23.780 ms
latency stddev = 11.936 ms
initial connection time = 22.619 ms
tps = 4413.657304 (without initial connection time)
```

## Custom script test (single statements, transaction pool friendly)

```bash
PGPASSWORD=password pgbench -h 192.168.1.100 -p 5432 -U postgres -d postgres -c 100 -j 10 -T 60 -f tests/pgbench-simple.sql
```

## Example output

```bash
transaction type: tests/pgbench-simple.sql
scaling factor: 1
query mode: simple
number of clients: 100
number of threads: 10
duration: 60 s
number of transactions actually processed: 2042505
latency average = 2.936 ms
initial connection time = 34.693 ms
tps = 34059.170698 (without initial connection time)
```

## Testing High Availability During Load

Run this in one terminal to generate continuous load:
```bash
# Continuous load test
while true; do
  PGPASSWORD=password pgbench -h 192.168.1.100 -p 5432 -U postgres -d postgres -c 50 -j 5 -T 30 -M simple
  sleep 5
done
```

Then in another terminal, test failover:
```bash
# Simulate HAProxy failure
vagrant halt haproxy1

# Watch for brief connection interruption (2-3 seconds)
# Load should resume automatically when VIP moves to haproxy2
```
