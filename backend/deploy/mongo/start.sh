#!/bin/bash
# Starts mongod as replica set "rs0" with auth. On first boot it initiates the set and creates the root user
# (via MongoDB's localhost exception); later boots just start. Data lives on the Railway volume at /data/db.
set -euo pipefail

: "${MONGO_ROOT_USER:?MONGO_ROOT_USER is required}"
: "${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD is required}"
HOST="${RAILWAY_PRIVATE_DOMAIN:-localhost}"
DATA=/data/db
KEYFILE="$DATA/.replset.key"

mkdir -p "$DATA"
if [ ! -f "$KEYFILE" ]; then
  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 756 >"$KEYFILE"
fi
chown -R mongodb:mongodb "$DATA"
chmod 400 "$KEYFILE"

# --ipv6 + --bind_ip_all: Railway's private network is IPv6
gosu mongodb mongod --replSet rs0 --bind_ip_all --ipv6 --keyFile "$KEYFILE" --dbpath "$DATA" &
MONGOD_PID=$!
trap 'kill -TERM $MONGOD_PID; wait $MONGOD_PID' TERM INT

until mongosh --quiet --eval 'db.adminCommand({ ping: 1 })' >/dev/null 2>&1; do sleep 1; done

if mongosh --quiet -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval 'rs.status().ok' >/dev/null 2>&1; then
  echo "[replset] already initialised"
else
  echo "[replset] first boot: initiating rs0 as $HOST:27017"
  mongosh --quiet --eval "try { rs.status() } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '$HOST:27017' }] }) }"
  until mongosh --quiet --eval 'db.hello().isWritablePrimary' | grep -q true; do sleep 1; done
  mongosh --quiet admin --eval "db.createUser({ user: '$MONGO_ROOT_USER', pwd: '$MONGO_ROOT_PASSWORD', roles: ['root'] })"
  echo "[replset] root user created"
fi

wait $MONGOD_PID
