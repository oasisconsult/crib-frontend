# ─── Crib — Local Development Helpers ──────────────────────────────────────────
# Prerequisites: 
#   - Docker and Docker Compose installed
#   - .env file in project root (copy from .env.example)
#   - docker-compose.local.yml in project root
#
# Usage:
#   make dev-build       # Build and start all services
#   make seed-logto      # One-time Logto database seeding
#   make stop            # Stop all services
#   make logs            # Follow all service logs
#   make logs-backend    # Follow backend logs only

.PHONY: dev-up dev-build dev-build-d stop logs seed-logto logs-backend logs-frontend shell-backend shell-db pull

## Start all services in background (no rebuild)
dev-up:
	docker compose -f docker-compose.local.yml up -d

## Build and start all services (foreground, good for first-time setup)
dev-build:
	docker compose -f docker-compose.local.yml up --build

## Build and start all services in background
dev-build-d:
	docker compose -f docker-compose.local.yml up -d --build

## Stop all services and remove containers
stop:
	docker compose -f docker-compose.local.yml down

## Follow logs for all services (or pass service name: make logs service=backend)
logs:
	docker compose -f docker-compose.local.yml logs -f $(service)

## One-time: Seed Logto database with default configuration
## Run this only once during initial setup
seed-logto:
	./backend/seed-logto.sh

## Follow backend service logs only
logs-backend:
	docker compose -f docker-compose.local.yml logs -f backend

## Follow frontend service logs only
logs-frontend:
	docker compose -f docker-compose.local.yml logs -f frontend

## Open a bash shell inside the backend container
shell-backend:
	docker compose -f docker-compose.local.yml exec backend bash

## Open a psql shell inside the postgres database
shell-db:
	docker compose -f docker-compose.local.yml exec postgres psql -U $${POSTGRES_USER:-crib} -d $${POSTGRES_DB:-crib_dev}

## Pull latest from origin, discarding any locally-copied files that block the merge.
## Use this instead of plain 'git pull' when working in WSL after Windows pushes.
pull:
	git checkout -- . 2>/dev/null || true
	git pull origin main
