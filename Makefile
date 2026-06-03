# ─── Crib — Local Development Helpers ──────────────────────────────────────────
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env file in project root (copy from .env.example)
#   - docker-compose.local.yml in project root
#
# Usage:
#   make clone-deps      # Clone/update geobox-rbac into backend/vendor/ (run first)
#   make dev-build       # Build and start all services
#   make dev-build-d     # Build and start all services in background
#   make seed-logto      # One-time Logto database seeding
#   make stop            # Stop all services
#   make logs            # Follow all service logs
#   make logs-backend    # Follow backend logs only

.PHONY: dev-up dev-build dev-build-d stop logs seed-logto logs-backend \
        logs-frontend logs-mailhog shell-backend shell-db pull mailhog \
        clone-deps \
        staging-build staging-up staging-stop staging-logs \
        staging-logs-backend staging-shell-backend staging-migrate create-db

# Path to geobox-rbac — resolves from the apps folder layout:
#   /srv/apps/geobox-rbac   (staging)
#   /home/belac/projects/geobox-rbac   (local WSL dev)
GEOBOX_RBAC_UPSTREAM ?= $(shell \
  if [ -d /srv/apps/geobox-rbac ]; then echo /srv/apps/geobox-rbac; \
  elif [ -d /home/belac/projects/geobox-rbac ]; then echo /home/belac/projects/geobox-rbac; \
  else echo ""; fi)

VENDOR_DIR := backend/vendor/geobox-rbac

## Clone / sync geobox-rbac into backend/vendor/ (required before first build)
clone-deps:
	@if [ -z "$(GEOBOX_RBAC_UPSTREAM)" ]; then \
	  echo "geobox-rbac not found locally. Cloning from GitHub..."; \
	  mkdir -p backend/vendor; \
	  git clone https://github.com/oasisconsult/geobox-rbac.git $(VENDOR_DIR); \
	elif [ ! -d "$(VENDOR_DIR)" ]; then \
	  echo "Copying geobox-rbac from $(GEOBOX_RBAC_UPSTREAM)..."; \
	  mkdir -p backend/vendor; \
	  cp -r $(GEOBOX_RBAC_UPSTREAM) $(VENDOR_DIR); \
	else \
	  echo "Syncing geobox-rbac from $(GEOBOX_RBAC_UPSTREAM)..."; \
	  rsync -a --delete $(GEOBOX_RBAC_UPSTREAM)/ $(VENDOR_DIR)/; \
	fi
	@echo "✓ geobox-rbac ready at $(VENDOR_DIR)"

## Start all services in background (no rebuild)
dev-up:
	docker compose -f docker-compose.local.yml up -d

## Build and start all services (foreground, good for first-time setup)
dev-build: clone-deps
	docker compose -f docker-compose.local.yml up --build

## Build and start all services in background
dev-build-d: clone-deps
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

## Open MailHog web UI in the default browser (dev only)
mailhog:
	open http://localhost:8025 2>/dev/null || xdg-open http://localhost:8025 2>/dev/null || echo "Open http://localhost:8025 in your browser"

## ── Staging ──────────────────────────────────────────────────────────────────

## Create the crib_staging database on the shared Postgres if it doesn't exist
create-db:
	@DB_CONTAINER=$$(docker ps --format '{{.Names}}' | grep -E 'geobox.*[-_]db|[-_]db[-_]' | head -1); \
	if [ -z "$$DB_CONTAINER" ]; then echo "ERROR: cannot find geobox db container"; exit 1; fi; \
	echo "Using container: $$DB_CONTAINER"; \
	docker exec $$DB_CONTAINER psql -U postgres -c \
	  "SELECT 'CREATE DATABASE crib_staging' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crib_staging')\gexec"
	@echo "✓ crib_staging database ready"

## Build and start staging services in background
staging-build: clone-deps
	docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build

## Start staging services without rebuild
staging-up:
	docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

## Stop and remove staging containers
staging-stop:
	docker compose -f docker-compose.staging.yml --env-file .env.staging down

## Follow all staging logs
staging-logs:
	docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f

## Follow staging backend logs only
staging-logs-backend:
	docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f backend

## Open a bash shell in the staging backend container
staging-shell-backend:
	docker compose -f docker-compose.staging.yml --env-file .env.staging exec backend bash

## Run Alembic migrations on staging
staging-migrate:
	docker compose -f docker-compose.staging.yml --env-file .env.staging \
	  exec backend alembic upgrade head

## ─────────────────────────────────────────────────────────────────────────────

## Pull latest from origin, discarding any locally-copied files that block the merge.
## Use this instead of plain 'git pull' when working in WSL after Windows pushes.
pull:
	git checkout -- . 2>/dev/null || true
	git pull origin main
