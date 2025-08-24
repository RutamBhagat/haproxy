#!/bin/sh
set -e

# Configuration
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
HAPROXY_STATS_URL="${HAPROXY_STATS_URL}/stats"
CHECK_INTERVAL=10
STATE_FILE="/tmp/pgbouncer_states.txt"
# state file is stored in key:value format
# pgb1:UP
# pgb2:UP
# pgb3:DOWN

# Validate environment variables
if [ -z "$SLACK_WEBHOOK_URL" ]; then
    echo "ERROR: SLACK_WEBHOOK_URL environment variable is not set"
    exit 1
fi

echo "Starting PgBouncer health monitor..."
echo "Check interval: ${CHECK_INTERVAL} seconds"
echo "HAProxy stats URL: ${HAPROXY_STATS_URL}"

# Install required packages
apk add --no-cache curl jq

send_slack_notification() {
    local title="$1"
    local message="$2"
    local color="$3"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S UTC')
    
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"attachments\": [{
                \"color\": \"$color\",
                \"title\": \"$title\",
                \"text\": \"$message\",
                \"footer\": \"PgBouncer Monitor - $timestamp\"
            }]
        }" \
        --silent --show-error --fail
}

get_pgbouncer_status() {
    # Get HAProxy stats in CSV format
    local stats_response
    stats_response=$(curl -s --max-time 5 "${HAPROXY_STATS_URL};csv" || echo "")
    
    if [ -z "$stats_response" ]; then
        echo "WARNING: Unable to fetch HAProxy stats" >&2
        return 1
    fi
    
    # Parse CSV and extract PgBouncer backend server status
    # Format: pxname,svname,status (columns 1,2,18)
    echo "$stats_response" | grep "pgbouncer_backend,pgb[1-3]" | while IFS=',' read -r line; do
        local pxname=$(echo "$line" | cut -d',' -f1)
        local svname=$(echo "$line" | cut -d',' -f2)
        local status=$(echo "$line" | cut -d',' -f18)
        
        echo "${svname}:${status}"
    done
}

# Create state file
touch "$STATE_FILE"

# Monitoring loop
while true; do
    echo "Checking PgBouncer status at $(date)"
    
    # Get current status
    current_status=$(get_pgbouncer_status)
    
    if [ $? -eq 0 ] && [ -n "$current_status" ]; then
        # Process each PgBouncer
        echo "$current_status" | while read -r server_status; do
            server_name=$(echo "$server_status" | cut -d':' -f1)
            current_state=$(echo "$server_status" | cut -d':' -f2)
            
            # Get previous state
            previous_state=$(grep "^${server_name}:" "$STATE_FILE" 2>/dev/null | cut -d':' -f2 || echo "UP")
            
            # Check for state changes
            if [ "$current_state" != "$previous_state" ]; then
                echo "State change detected: $server_name $previous_state -> $current_state"
                
                if [ "$current_state" = "DOWN" ]; then
                    # Server went down
                    title="PgBouncer Alert"
                    message="$server_name is DOWN. Run: docker start $server_name"
                    color="danger"
                    
                    echo "ALERT: $message"
                    send_slack_notification "$title" "$message" "$color"
                    
                elif [ "$current_state" = "UP" ] && [ "$previous_state" = "DOWN" ]; then
                    # Server recovered
                    title="PgBouncer Recovery"
                    message="$server_name is back UP"
                    color="good"
                    
                    echo "RECOVERY: $message"
                    send_slack_notification "$title" "$message" "$color"
                fi
                
                # Update state file
                if grep -q "^${server_name}:" "$STATE_FILE"; then
                    sed -i "s/^${server_name}:.*/${server_name}:${current_state}/" "$STATE_FILE"
                else
                    echo "${server_name}:${current_state}" >> "$STATE_FILE"
                fi
            fi
        done
        
        # Update state file for any new servers not previously tracked
        echo "$current_status" | while read -r server_status; do
            server_name=$(echo "$server_status" | cut -d':' -f1)
            current_state=$(echo "$server_status" | cut -d':' -f2)
            
            if ! grep -q "^${server_name}:" "$STATE_FILE"; then
                echo "${server_name}:${current_state}" >> "$STATE_FILE"
                echo "Tracking new server: $server_name ($current_state)"
            fi
        done
        
    else
        echo "WARNING: Failed to get PgBouncer status from HAProxy"
    fi
    
    echo "Next check in ${CHECK_INTERVAL} seconds..."
    sleep "$CHECK_INTERVAL"
done