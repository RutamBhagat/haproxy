# HAProxy High Availability Setup with Vagrant

## Overview

This setup eliminates HAProxy as a single point of failure by using 2 HAProxy instances with keepalived managing a Virtual IP (VIP). This is the same pattern used by GitHub, GitLab, and other production systems.

## Architecture

```
Node.js App
    ↓
Virtual IP (192.168.56.100:5432)
    ↓
HAProxy1 (Master) ←→ HAProxy2 (Backup)
    ↓
PgBouncer1, PgBouncer2, PgBouncer3
    ↓
PostgreSQL
```

## Prerequisites

- Docker Engine (Do not use Docker Desktop it conflicts with vagrant)
- Vagrant 2.x+ with VirtualBox
- PostgreSQL client tools (for testing)

## Quick Start

### 1. Start Docker containers (PostgreSQL + PgBouncer)

```bash
cd apps/server
docker compose up -d
```

Verify containers are running:
```bash
docker ps | grep -E "postgres|pgb"
```

### 2. Start Vagrant VMs (HAProxy + Keepalived)

```bash
cd apps/server
vagrant up
```

Note: The `dpkg-preconfigure: unable to re-open stdin` warnings during provisioning are harmless and can be ignored.

### 3. Update your application configuration

```bash
# Update your .env file:
DATABASE_URL=postgresql://postgres:password@192.168.56.100:5432/haproxy

# Test connection from within a VM:
vagrant ssh haproxy1 -c "PGPASSWORD=password psql -h 192.168.56.100 -p 5432 -U postgres -d haproxy -c 'SELECT 1'"
```

**Note**: Direct connection from host to VIP (192.168.56.100) may not work due to VirtualBox networking. Applications should run inside VMs or Docker containers on the same network.

### 4. View HAProxy stats

Open http://192.168.56.100:8404/stats in your browser

## Testing Failover

### Test automatic failover (2-3 seconds)

```bash
# Terminal 1: Watch VIP location
vagrant ssh haproxy1 -c "watch 'ip addr show enp0s8 | grep 192.168.56'"

# Terminal 2: Simulate failure
vagrant halt haproxy1

# The VIP (192.168.56.100) will move to haproxy2 automatically
```

### Verify failover worked

```bash
# Connection should still work through VIP
psql -h 192.168.56.100 -p 5432 -U postgres -d haproxy -c "SELECT 1"
```

### Restore failed node

```bash
vagrant up haproxy1
# haproxy1 will rejoin as backup
```

## VM Management

```bash
# Start VMs
vagrant up

# Stop VMs
vagrant halt

# Restart VMs
vagrant reload

# SSH into VMs
vagrant ssh haproxy1
vagrant ssh haproxy2

# Destroy VMs (if needed)
vagrant destroy -f
```

## How It Works

1. **Keepalived** runs on both VMs using VRRP protocol
2. **Virtual IP (192.168.56.100)** floats between the two HAProxy instances
3. **Master election** based on priority (haproxy1=101, haproxy2=100)
4. **Health checks** every second ensure quick failover
5. **Automatic recovery** when failed node comes back online

## Production Deployment

This exact configuration can be deployed to production:

1. Replace Vagrant VMs with EC2 instances
2. Use same keepalived configurations
3. Adjust network interface name if needed (eth0 for cloud environments)
4. Use Elastic IP or VPC internal IP as Virtual IP

## Common Issues & Solutions

### Keepalived fails with "interface eth1 doesn't exist"

The network interface name varies by system. Check actual interface:
```bash
vagrant ssh haproxy1 -c "ip addr | grep 192.168.56"
```

If it shows `enp0s8` instead of `eth1`, fix it:
```bash
vagrant ssh haproxy1 -c "sudo sed -i 's/interface eth1/interface enp0s8/g' /etc/keepalived/keepalived.conf && sudo systemctl restart keepalived"
vagrant ssh haproxy2 -c "sudo sed -i 's/interface eth1/interface enp0s8/g' /etc/keepalived/keepalived.conf && sudo systemctl restart keepalived"
```

### Cannot connect from host to Virtual IP

This is a VirtualBox limitation. Solutions:
1. Run your application in Docker with `--network host`
2. Use port forwarding in Vagrantfile
3. Test from within VMs using `vagrant ssh`

## Troubleshooting

### Check keepalived status

```bash
vagrant ssh haproxy1 -c "sudo systemctl status keepalived"
vagrant ssh haproxy2 -c "sudo systemctl status keepalived"
```

### Check which node has the VIP

```bash
vagrant ssh haproxy1 -c "ip addr show enp0s8 | grep 192.168.56.100"
vagrant ssh haproxy2 -c "ip addr show enp0s8 | grep 192.168.56.100"
```

### View keepalived logs

```bash
vagrant ssh haproxy1 -c "sudo journalctl -u keepalived -f"
```

### Test HAProxy directly (bypassing VIP)

```bash
# Test haproxy1 directly
psql -h 192.168.56.10 -p 5432 -U postgres -d haproxy

# Test haproxy2 directly
psql -h 192.168.56.11 -p 5432 -U postgres -d haproxy
```

## Files Structure

```
apps/server/
├── Vagrantfile                 # VM definitions
├── vagrant/
│   ├── haproxy.cfg            # HAProxy configuration
│   ├── keepalived-master.conf # Master keepalived config
│   └── keepalived-backup.conf # Backup keepalived config
└── docker-compose.yml         # PostgreSQL + PgBouncer containers
```

## Key Benefits

- **No single point of failure** - Both HAProxy instances are active
- **2-3 second failover** - Near-instant recovery
- **Zero application changes** - Single connection string
- **Production-ready** - Same as GitHub/GitLab architecture
- **Simple** - Only ~60 lines of configuration
