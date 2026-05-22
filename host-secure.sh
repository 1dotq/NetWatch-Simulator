#!/bin/bash

# Port to serve the app on
PORT=8080
ALLOWED_IP="10.1.10.102"
KALI_IP="10.1.10.8"

echo "=========================================================="
echo "🔐 AETHERIS SECURE ICS HOSTING GATEWAY"
echo "=========================================================="
echo "Configuring firewall access controls for port $PORT..."
echo "Only target host $ALLOWED_IP and localhost (127.0.0.1) will be permitted."

# Clean up any existing rules to prevent duplicates
sudo iptables -D INPUT -p tcp -s $ALLOWED_IP --dport $PORT -j ACCEPT 2>/dev/null
sudo iptables -D INPUT -p tcp -s 127.0.0.1 --dport $PORT -j ACCEPT 2>/dev/null
sudo iptables -D INPUT -p tcp --dport $PORT -j DROP 2>/dev/null

# Apply strict iptables rules
sudo iptables -A INPUT -p tcp -s $ALLOWED_IP --dport $PORT -j ACCEPT
sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport $PORT -j ACCEPT
sudo iptables -A INPUT -p tcp --dport $PORT -j DROP

echo "✅ Firewall rules successfully applied!"
echo "----------------------------------------------------------"
sudo iptables -L INPUT -v -n | grep $PORT
echo "----------------------------------------------------------"

# Handle graceful exit on Ctrl+C to remove the rules
cleanup() {
  echo ""
  echo "🧹 Restoring firewall state & cleaning up iptables rules..."
  sudo iptables -D INPUT -p tcp -s $ALLOWED_IP --dport $PORT -j ACCEPT
  sudo iptables -D INPUT -p tcp -s 127.0.0.1 --dport $PORT -j ACCEPT
  sudo iptables -D INPUT -p tcp --dport $PORT -j DROP
  echo "✅ Firewall rules cleared successfully. Exiting."
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "🚀 Starting web server on port $PORT..."
echo "Access link: http://$KALI_IP:$PORT from host $ALLOWED_IP"
echo "Press Ctrl+C to stop the server and reset the firewall rules."
echo "=========================================================="

python3 -m http.server $PORT
