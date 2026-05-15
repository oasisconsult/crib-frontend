# ─── Crib — Local & Production Deployment Helpers ────────────────────────────
# Prerequisites: 
#   - Docker and Docker Compose installed
#   - .env file in project root for development
#   - .env.production file in project root for production
#   - docker-compose.local.yml for development
#   - docker-compose.prod.yml for production
#
# Development Usage:
#   make dev-build       # Build and start all services
#   make seed-logto      # One-time Logto database seeding
#   make stop            # Stop all services
#   make logs            # Follow all service logs
#
# Production Usage:
#   make prod-up         # Start production services (must already be built)
#   make prod-build      # Build and start production services
#   make prod-stop       # Stop production services
#   make prod-logs       # Follow production logs
#   make seed-logto-prod # Seed Logto database (production)

.PHONY: dev-up dev-build dev-build-d stop logs seed-logto logs-backend logs-frontend shell-backend shell-db prod-up prod-build prod-build-d prod-stop prod-logs seed-logto-prod prod-logs-backend prod-shell-backend prod-shell-db

# ─── DEVELOPMENT ───────────────────────────────────────────────────────────

## Start all development services in background (no rebuild)
dev-up:
	docker compose -f docker-compose.local.yml --env-file .env up -d

## Build and start all development services (foreground, good for first-time setup)
dev-build:
	docker compose -f docker-compose.local.yml --env-file .env up --build

## Build and start all development services in background
dev-build-d:
	docker compose -f docker-compose.local.yml --env-file .env up -d --build

## Stop all development services and remove containers
stop:
	docker compose -f docker-compose.local.yml --env-file .env down

## Follow logs for all development services (or pass service name: make logs service=backend)
logs:
	docker compose -f docker-compose.local.yml --env-file .env logs -f $(service)

## One-time: Seed Logto database with default configuration (development)
## Run this only once during initial setup
seed-logto:
	./backend/seed-logto.sh

## Follow backend service logs only (development)
logs-backend:
	docker compose -f docker-compose.local.yml --env-file .env logs -f backend

## Follow frontend service logs only (development)
logs-frontend:
	docker compose -f docker-compose.local.yml --env-file .env logs -f frontend

## Open a bash shell inside the backend container (development)
shell-backend:
	docker compose -f docker-compose.local.yml --env-file .env exec backend bash

## Open a psql shell inside the postgres database (development)
shell-db:
	docker compose -f docker-compose.local.yml --env-file .env exec postgres psql -U $${POSTGRES_USER:-crib} -d $${POSTGRES_DB:-crib_dev}

# ─── PRODUCTION ───────────────────────────────────────────────────────────

## Start all production services in background (no rebuild)
prod-up:
	docker compose -f docker-compose.prod-shared.yml --env-file .env.production up -d

## Build and start all production services (foreground)
prod-build:
	docker compose -f docker-compose.prod-shared.yml --env-file .env.production up --build

## Build and start all production services in background
prod-build-d:
	docker compose -f docker-compose.prod-shared.yml --env-file .env.production up -d --build

## Stop all production services
prod-stop:
	docker compose -f docker-compose.prod-shared.yml --env-file .env.production down

## Follow logs for all production services (or pass service name: make prod-logs service=backend)
prod-logs:
	docker compose -f docker-compose.prod-shared.yml --env-file .env.production logs -f $(service)

## Follow backend service logs only (production)
prod-logs-backend:
	docker compose -f docker-compose.prod-shared.yml --env-file .env.production logs -f backend

## Open a bash shell inside the production backend container
prod-shell-backend:
	docker compose -f docker-compose.prod-shared.yml --env-file .env.production exec backend bash
