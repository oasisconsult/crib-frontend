#!/bin/bash

set -e  # Exit on any error

# Logto (OIDC/authentication provider) database seeding script
# This seeds Logto's own PostgreSQL database with default configuration
# Separate from FastAPI backend database migrations/seeding

# Find the project root (where docker-compose.local.yml lives)
# This script is in backend/, so go up one level
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

# Load environment variables from .env
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
else
  echo "Error: .env file not found in $PROJECT_ROOT"
  exit 1
fi

echo "Starting Logto PostgreSQL service..."
docker compose -f "$PROJECT_ROOT/docker-compose.local.yml" up -d logto-postgres

echo "Waiting for PostgreSQL to be healthy..."
while ! docker compose -f "$PROJECT_ROOT/docker-compose.local.yml" exec -T logto-postgres pg_isready -U "${LOGTO_POSTGRES_USER:-logto}" -d "${LOGTO_POSTGRES_DB:-logto}"; do
  echo "  ...waiting for database..."
  sleep 2
done

echo "PostgreSQL is healthy!"

echo "Starting Logto service..."
docker compose -f "$PROJECT_ROOT/docker-compose.local.yml" up -d logto

echo "Waiting for Logto to be ready..."
sleep 5

echo "Running database seed..."
docker compose -f "$PROJECT_ROOT/docker-compose.local.yml" exec -T logto npx @logto/cli db seed -- --db-url "postgresql://${LOGTO_POSTGRES_USER:-logto}:${LOGTO_POSTGRES_PASSWORD}@logto-postgres:5432/${LOGTO_POSTGRES_DB:-logto}"

echo "✓ Logto seeding complete!"
echo "Logto is running at http://localhost:3001"
echo "Admin console at http://localhost:3002"