# HAProxy High Availability Setup Guide

> **⚠️ IMPORTANT**: This guide covers two different scenarios with different networking requirements:
> - **Part 1**: Local development using VirtualBox (requires bridged networking workaround)
> - **Part 2**: Production deployment on real servers (standard configuration)

This setup eliminates HAProxy as a single point of failure by using 2 HAProxy instances with keepalived managing a Virtual IP (VIP). This is the same pattern used by GitHub, GitLab, and other production systems.

## Core Architecture

```
Application Server
    ↓
Virtual IP (floats between HAProxy instances)
    ↓
HAProxy1 (Master) ←→ HAProxy2 (Backup)
    ↓
PgBouncer Pool (3 instances)
    ↓
PostgreSQL Database
```

---

# 🛠️ Part 1: Local Development Setup

## The Networking Challenge

**Problem**: VirtualBox creates isolated private networks that prevent your host application from accessing the Virtual IP directly.

- VirtualBox VMs exist in isolated network: `192.168.56.x` (host-only network)
- Host machine exists on: `192.168.1.x` (your WiFi/Ethernet network)  
- The VIP managed by keepalived only exists within the VM network
- Host applications cannot establish TCP connections to the VIP

**Solution**: Use bridged networking to place VMs on the same network as your host machine.

## Prerequisites

- **Docker Engine** (NOT Docker Desktop - it conflicts with Vagrant networking)
- **Vagrant 2.x+** with VirtualBox
- **PostgreSQL client tools** for testing
- **WiFi/Ethernet connection** (bridged networking requires active network interface)

## Architecture with Bridged Networking

```
Your WiFi Network (192.168.1.x)
├── Host Machine (192.168.1.5)
│   ├── Node.js App (localhost:3000)
│   ├── PgBouncer containers (6432, 6433, 6434)
│   └── PostgreSQL container (5432)
├── haproxy1 VM (192.168.1.10) - Master
├── haproxy2 VM (192.168.1.11) - Backup
└── Virtual IP (192.168.1.100) - Managed by keepalived
```

## Step-by-Step Setup

### 1. Start Docker Infrastructure

```bash
cd apps/server
docker compose up -d
```

Verify containers are running:
```bash
docker ps | grep -E "postgres|pgb"
# Should show: postgres, pgb1, pgb2, pgb3 containers
```

### 2. Configure Network-Specific Settings

The Vagrantfile uses bridged networking with your primary network interface. If your network isn't `192.168.1.x`, you'll need to:

**Check your network:**
```bash
ip route | grep default
# Example output: default via 192.168.1.1 dev wlp8s0 proto dhcp src 192.168.1.5
```

**If your network is different (e.g., 10.0.0.x), update the Vagrantfile:**
- Change `ip: "192.168.1.10"` to your network range
- Update keepalived configs with your VIP range
- Update .env files with new VIP address

### 3. Start HAProxy VMs

```bash
cd apps/server
vagrant up
```

**What happens during provisioning:**
- VMs get IPs on your local network (192.168.1.10, 192.168.1.11)
- HAProxy and keepalived are installed and configured
- Network interface is detected (usually `enp0s8`)
- Services start and VIP election begins

### 4. Verify VIP is Active

```bash
# Test VIP connectivity
ping -c 2 192.168.1.100

# Test database port
nc -zv 192.168.1.100 5432
# Should show: Connection to 192.168.1.100 5432 port [tcp/postgresql] succeeded!
```

### 5. Test Application Connection

Your application should now connect successfully:
```bash
# Test health endpoint
curl -s http://localhost:3000/api/health/db | jq
# Should return: "status": "healthy"
```

## Database Connection Configuration

**Update your .env file:**
```bash
DATABASE_URL=postgresql://postgres:password@192.168.1.100:5432/postgres
```

**Connection flow:**
```
Node.js App → 192.168.1.100:5432 → HAProxy → PgBouncer → PostgreSQL
```

## Monitoring and Stats

**HAProxy Statistics:**
```bash
# Access via VIP (goes to active HAProxy instance)
http://192.168.1.100:8404/stats
```

**Direct VM access (for debugging):**
```bash
# haproxy1 logs
vagrant ssh haproxy1 -c "sudo journalctl -u haproxy -f"

# keepalived status
vagrant ssh haproxy1 -c "sudo systemctl status keepalived"
```

## Testing High Availability

### 1. Monitor VIP Location

```bash
# Check which VM has the VIP
vagrant ssh haproxy1 -c "ip addr show enp0s8 | grep 192.168.1.100 && echo 'VIP on haproxy1' || echo 'VIP not on haproxy1'"
vagrant ssh haproxy2 -c "ip addr show enp0s8 | grep 192.168.1.100 && echo 'VIP on haproxy2' || echo 'VIP not on haproxy2'"
```

### 2. Test Failover

```bash
# Terminal 1: Monitor health endpoint
while true; do curl -s http://localhost:3000/api/health/db | jq -r '.status'; sleep 1; done

# Terminal 2: Simulate failure
vagrant halt haproxy1

# Observe: 
# - Brief connection interruption (2-3 seconds)
# - VIP moves to haproxy2
# - Connections resume automatically
```

### 3. Test Recovery

```bash
# Restore failed node
vagrant up haproxy1

# haproxy1 rejoins as backup (haproxy2 stays master until manually failed over)
```

## Why This is a "Hack" for Local Development

**In Production:**
- Servers have routable IP addresses
- VIPs are assigned by network infrastructure
- No bridged networking needed

**In VirtualBox:**
- VMs exist in isolated networks
- VIP only exists within VM context
- Host cannot route to VM-managed VIPs
- Bridged networking bypasses isolation

This setup mimics production networking but requires the bridged networking workaround due to VirtualBox's network isolation.

---

# 🚀 Part 2: Production Deployment

## Production Architecture

In production environments (AWS, DigitalOcean, bare metal), the networking challenges don't exist. The same HAProxy + keepalived configuration works seamlessly.

```
Internet
    ↓
Load Balancer / Elastic IP (203.0.113.100)
    ↓
Private Subnet (10.0.1.0/24)
├── App Servers (10.0.1.10, 10.0.1.11, ...)
├── HAProxy1 (10.0.1.20) - Master
├── HAProxy2 (10.0.1.21) - Backup
├── Virtual IP (10.0.1.100) - Internal VIP
└── Database Servers (10.0.1.30, 10.0.1.31, ...)
```

## Cloud Provider Setup

### AWS EC2 Deployment

**1. Network Configuration:**
```bash
# VPC: 10.0.0.0/16
# Private Subnet: 10.0.1.0/24
# HAProxy instances in private subnet
# VIP: 10.0.1.100 (unassigned IP in subnet)
```

**2. Security Groups:**
```bash
# HAProxy Security Group
- Port 5432: From application servers
- Port 8404: From monitoring systems
- Port 22: For SSH access
- VRRP: Protocol 112 between HAProxy instances
```

**3. Launch Configuration:**
```bash
# Use same provision script from Vagrantfile
# Update network interface: enp0s8 → eth0
# Update VIP range: 192.168.1.100 → 10.0.1.100
```

## Production Configuration Changes

### 1. Network Interface

**Check interface name:**
```bash
ip addr show | grep -E "inet.*192\.168|inet.*10\."
```

**Update keepalived configs:**
```bash
# In keepalived-master.conf and keepalived-backup.conf
interface eth0  # Instead of enp0s8
```

### 2. IP Address Ranges

**Update all configurations:**
```bash
# keepalived configs
virtual_ipaddress {
    10.0.1.100/24  # Your production VIP
}

# haproxy.cfg backend section
server pgb1 10.0.1.10:6432 check  # Your app server IPs
server pgb2 10.0.1.10:6433 check
server pgb3 10.0.1.10:6434 check

# Application configuration
DATABASE_URL=postgresql://postgres:password@10.0.1.100:5432/postgres
```

### 3. Firewall Configuration

**Ubuntu/Debian (ufw):**
```bash
# On both HAProxy servers
sudo ufw allow 5432/tcp    # PostgreSQL
sudo ufw allow 8404/tcp    # HAProxy stats
sudo ufw allow 22/tcp      # SSH
sudo ufw allow from 10.0.1.20 to any port 112  # VRRP to other HAProxy
sudo ufw allow from 10.0.1.21 to any port 112  # VRRP from other HAProxy
```

## Production Monitoring

### Health Checks

**Application-level:**
```bash
# Health endpoint monitoring
curl -f http://10.0.1.100:8404/stats > /dev/null || alert "HAProxy down"
```

**Infrastructure-level:**
```bash
# Monitor VIP location
ansible haproxy_servers -m shell -a "ip addr show eth0 | grep 10.0.1.100"
```

### Logging

**Centralized logging:**
```bash
# Update haproxy.cfg
global
    log 10.0.1.5:514 local0  # Your log server

# keepalived logs
journalctl -u keepalived -f | tee /var/log/keepalived.log
```

### Alerting

**Basic monitoring script:**
```bash
#!/bin/bash
VIP="10.0.1.100"
if ! ping -c 1 $VIP > /dev/null 2>&1; then
    echo "ALERT: VIP $VIP is not responding" | mail -s "HAProxy VIP Down" admin@company.com
fi
```

## Production Benefits

**Simplified Networking:**
- No bridged networking required
- VIP works natively on server networks
- Standard cloud networking patterns

**Enterprise Features:**
- Integration with cloud load balancers
- Native monitoring and alerting
- Auto-scaling compatibility
- Disaster recovery options

**Operational Simplicity:**
- Same configuration as local development
- Standard Linux network administration
- Well-understood failure modes

---

# 🔧 Troubleshooting Guide

## Local Development Issues

### VMs Can't Access Host Services

**Problem:** HAProxy can't connect to PgBouncer containers on host.

**Solution:**
```bash
# Check host IP from VM perspective
vagrant ssh haproxy1 -c "ip route | grep default"
# Update haproxy.cfg with correct host IP
```

### Interface Name Mismatch

**Problem:** `keepalived: interface eth1 doesn't exist`

**Solution:**
```bash
# Check actual interface name
vagrant ssh haproxy1 -c "ip addr show | grep 192.168.1"
# Update keepalived configs with correct interface (usually enp0s8)
```

### VIP Not Accessible from Host

**Problem:** Can ping VIP but can't connect to ports.

**Diagnosis:**
```bash
# Check if HAProxy is binding correctly
vagrant ssh haproxy1 -c "sudo ss -tlnp | grep :5432"
# Should show: LISTEN 0 4096 *:5432
```

### Bridge Interface Selection

**Problem:** Vagrant asks which interface to bridge.

**Solution:**
```bash
# Update Vagrantfile with specific interface
h1.vm.network "public_network", ip: "192.168.1.10", bridge: "wlp8s0"
```

## Production Issues

### VRRP Elections Not Working

**Problem:** Both nodes think they're master.

**Diagnosis:**
```bash
# Check VRRP traffic
sudo tcpdump -i eth0 vrrp
# Check firewall rules
sudo iptables -L | grep 112
```

### Split Brain Scenarios

**Problem:** Network partition causes both nodes to claim VIP.

**Prevention:**
```bash
# Use priority differences
# Implement network monitoring
# Consider 3-node setup for complex environments
```

### Performance Issues

**Problem:** High latency through HAProxy.

**Diagnosis:**
```bash
# Check HAProxy stats
curl http://VIP:8404/stats
# Look for queue times, connection errors
# Monitor server response times
```

## General Troubleshooting Commands

```bash
# Service status
sudo systemctl status haproxy keepalived

# Logs
sudo journalctl -u haproxy -f
sudo journalctl -u keepalived -f

# Network connectivity
ping VIP_ADDRESS
nc -zv VIP_ADDRESS 5432
traceroute VIP_ADDRESS

# Process monitoring
sudo ss -tlnp | grep -E ":5432|:8404"
ps aux | grep -E "haproxy|keepalived"

# Configuration validation
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo keepalived --config-test
```

---

# 📁 Configuration Files Reference

```
apps/server/
├── Vagrantfile                    # VM definitions (bridged networking)
├── vagrant/
│   ├── haproxy.cfg               # HAProxy load balancer config
│   ├── keepalived-master.conf    # Master keepalived (priority 101)
│   └── keepalived-backup.conf    # Backup keepalived (priority 100)
├── docker-compose.yml            # PostgreSQL + PgBouncer containers
├── .env                          # Database connection (VIP address)
└── docs/
    └── VAGRANT_HA_SETUP.md      # This documentation
```

## Key Configuration Values

| Component | Local Dev | Production Example |
|-----------|-----------|-------------------|
| HAProxy VMs | 192.168.1.10, 192.168.1.11 | 10.0.1.20, 10.0.1.21 |
| Virtual IP | 192.168.1.100 | 10.0.1.100 |
| Host Machine | 192.168.1.5 | 10.0.1.10 |
| Network Interface | enp0s8 | eth0 |
| Bridge Interface | wlp8s0 | N/A |

---

# 🎯 Summary

**Local Development:**
- Requires bridged networking workaround for VirtualBox limitations
- Places VMs on same network as host machine
- Enables direct VIP access from host applications
- More complex setup but mirrors production behavior

**Production Deployment:**
- Standard server networking, no special configuration needed
- Same HAProxy + keepalived configs work seamlessly
- Better performance and reliability
- Integrates with cloud infrastructure and monitoring

The core HA architecture (HAProxy + keepalived + VIP) is production-ready in both scenarios. The only difference is the network configuration required to work around VirtualBox's network isolation in local development.