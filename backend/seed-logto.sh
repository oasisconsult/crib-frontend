#!/bin/bash

set -e  # Exit on any error

# Logto (OIDC/authentication provider) database seeding script
# This seeds Logto's own PostgreSQL database with default configuration
# Separate from FastAPI backend database migrations/seeding
#
# Usage:
#   ./seed-logto.sh              # Development (uses .env)
#   NODE_ENV=production ./seed-logto.sh  # Production (uses .env.production)

# Determine environment
NODE_ENV="${NODE_ENV:-development}"

# Find the project root (where docker-compose.*.yml lives)
# This script is in backend/, so go up one level
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

# Select compose file and env file based on environment
if [ "$NODE_ENV" = "production" ]; then
  COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
  ENV_FILE="$PROJECT_ROOT/.env.production"
  LOGTO_URL="https://auth.geoboxafrica.com"  # Update this for production
  LOGTO_ADMIN_URL="https://auth-admin.geoboxafrica.com"  # Update this for production
else
  COMPOSE_FILE="$PROJECT_ROOT/docker-compose.local.yml"
  ENV_FILE="$PROJECT_ROOT/.env"
  LOGTO_URL="http://localhost:3001"
  LOGTO_ADMIN_URL="http://localhost:3002"
fi

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Logto Database Seeding                                        ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║  Environment: $NODE_ENV"
echo "║  Compose File: $(basename $COMPOSE_FILE)"
echo "║  Env File: $(basename $ENV_FILE)"
echo "║  Logto URL: $LOGTO_URL"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Validate files exist
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "❌ Error: $COMPOSE_FILE not found!"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: $ENV_FILE not found!"
  exit 1
fi

# Load environment variables
set -a
source "$ENV_FILE"
set +a

echo "✓ Environment files loaded"
echo ""

echo "📦 Starting Logto PostgreSQL service..."
docker compose -f "$COMPOSE_FILE" up -d logto-postgres

echo "⏳ Waiting for PostgreSQL to be healthy..."
RETRY_COUNT=0
MAX_RETRIES=30
while ! docker compose -f "$COMPOSE_FILE" exec -T logto-postgres pg_isready -U "${LOGTO_POSTGRES_USER:-logto}" -d "${LOGTO_POSTGRES_DB:-logto}"; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -gt $MAX_RETRIES ]; then
    echo "❌ Error: PostgreSQL failed to start after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "  ...waiting for database ($RETRY_COUNT/$MAX_RETRIES)..."
  sleep 2
done

echo "✓ PostgreSQL is healthy!"
echo ""

echo "📦 Starting Logto service..."
docker compose -f "$COMPOSE_FILE" up -d logto

echo "⏳ Waiting for Logto to be ready..."
sleep 8

echo "✓ Logto service started"
echo ""

echo "🌱 Running database seed..."
SEED_START=$(date +%s)

if docker compose -f "$COMPOSE_FILE" exec -T logto npx @logto/cli db seed -- --db-url "postgresql://${LOGTO_POSTGRES_USER:-logto}:${LOGTO_POSTGRES_PASSWORD}@logto-postgres:5432/${LOGTO_POSTGRES_DB:-logto}"; then
  SEED_END=$(date +%s)
  SEED_TIME=$((SEED_END - SEED_START))
  
  echo ""
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║  ✓ Logto seeding complete!                                    ║"
  echo "╠════════════════════════════════════════════════════════════════╣"
  echo "║  Time taken: ${SEED_TIME}s"
  echo "║  Logto OIDC: $LOGTO_URL"
  echo "║  Admin Console: $LOGTO_ADMIN_URL"
  echo "╚════════════════════════════════════════════════════════════════╝"
else
  echo ""
  echo "❌ Error: Logto seeding failed!"
  exit 1
fi