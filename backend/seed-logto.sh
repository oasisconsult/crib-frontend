#!/bin/bash

set -e  # Exit on any error

# Logto (OIDC/authentication provider) database seeding script
# This seeds Logto's own PostgreSQL database with default configuration
# Separate from FastAPI backend database migrations/seeding

# Determine environment (development uses docker-compose.local.yml, production uses docker-compose.prod.yml)
NODE_ENV="${NODE_ENV:-development}"

if [ "$NODE_ENV" = "production" ]; then
  COMPOSE_FILE="docker-compose.prod.yml"
else
  COMPOSE_FILE="docker-compose.local.yml"
fi

echo "Environment: $NODE_ENV"
echo "Using compose file: $COMPOSE_FILE"
echo "(Using .env by default — Docker Compose auto-loads it)"

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
  if [ -f "../$COMPOSE_FILE" ]; then
    COMPOSE_FILE="../$COMPOSE_FILE"
  else
    echo "Error: $COMPOSE_FILE not found!"
    exit 1
  fi
fi

echo "Starting Logto PostgreSQL service..."
docker compose -f "$COMPOSE_FILE" up -d logto-postgres

echo "Waiting for PostgreSQL to be healthy..."
while ! docker compose -f "$COMPOSE_FILE" exec -T logto-postgres pg_isready -U "${LOGTO_POSTGRES_USER:-logto}" -d "${LOGTO_POSTGRES_DB:-logto}"; do
  echo "  ...waiting for database..."
  sleep 2
done

echo "PostgreSQL is healthy!"

echo "Starting Logto service..."
docker compose -f "$COMPOSE_FILE" up -d logto

echo "Waiting for Logto to be ready..."
sleep 5

echo "Running database seed..."
docker compose -f "$COMPOSE_FILE" exec -T logto npx @logto/cli db seed -- --db-url "postgresql://${LOGTO_POSTGRES_USER:-logto}:${LOGTO_POSTGRES_PASSWORD}@logto-postgres:5432/${LOGTO_POSTGRES_DB:-logto}"

echo "✓ Logto seeding complete!"
echo "Logto is running at http://localhost:3001"
echo "Admin console at http://localhost:3002"