#!/bin/bash

set -e  # Exit on any error

# Logto (OIDC/authentication provider) database seeding script
# This seeds Logto's own PostgreSQL database with default configuration
# Separate from FastAPI backend database migrations/seeding

echo "Starting Logto PostgreSQL service..."
docker compose up -d logto-postgres

echo "Waiting for PostgreSQL to be healthy..."
while ! docker compose exec -T logto-postgres pg_isready -U "${LOGTO_POSTGRES_USER:-logto}" -d "${LOGTO_POSTGRES_DB:-logto}"; do
  echo "  ...waiting for database..."
  sleep 2
done

echo "PostgreSQL is healthy!"

# Determine environment and load appropriate .env file
NODE_ENV="${NODE_ENV:-development}"

if [ "$NODE_ENV" = "production" ]; then
  ENV_FILE=".env.production"
else
  ENV_FILE=".env.local"
fi

echo "Environment: $NODE_ENV"
echo "Loading env file: $ENV_FILE"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "Warning: $ENV_FILE not found, using defaults"
fi

# Construct DB_URL if not already set
DB_URL="${DB_URL:-postgresql://${LOGTO_POSTGRES_USER:-logto}:${LOGTO_POSTGRES_PASSWORD}@logto-postgres:5432/${LOGTO_POSTGRES_DB:-logto}}"

echo "Starting Logto service..."
docker compose up -d logto

echo "Waiting for Logto to be ready..."
sleep 5

echo "Running database seed..."
docker compose exec -T logto npx @logto/cli db seed -- --db-url "$DB_URL"

echo "✓ Logto seeding complete!"
echo "Logto is running at http://localhost:3001"
echo "Admin console at http://localhost:3002"