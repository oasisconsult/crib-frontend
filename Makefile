# ─── Crib — Dev / Staging / Production Helpers ───────────────────────────────
#
# Quick reference
# ───────────────────────────────────────────────────────────────────────────────
# Shared:
#   make clone-deps            Sync geobox-rbac into backend/vendor/ (run first)
#   make pull                  Pull latest from origin/main
#
# Local dev:
#   make dev-build             Build + start all services (foreground)
#   make dev-build-d           Build + start all services (background)
#   make dev-up                Start without rebuild
#   make stop                  Stop dev services
#   make logs [service=name]   Follow logs (optional: service=backend)
#   make shell-backend         Bash shell in backend container
#
# Staging  (requires .env.staging):
#   make staging-create-db     Create crib_staging DB on shared Postgres (once)
#   make staging-build         Pull + build + start all staging containers
#   make staging-deploy        Pull + rebuild backend+worker only (rolling)
#   make staging-up            Start without rebuild
#   make staging-stop          Stop staging containers
#   make staging-migrate       Run Alembic migrations
#   make staging-migrate-rbac  Seed RBAC user roles (once after first deploy)
#   make staging-logs          Follow all staging logs
#   make staging-logs-backend  Follow backend logs only
#   make staging-shell-backend Bash shell in staging backend
#
# Production  (requires .env.production):
#   make prod-create-db        Create crib DB on shared Postgres (once)
#   make prod-build            Pull + build + start all production containers
#   make prod-deploy           Pull + rebuild backend+worker only (rolling)
#   make prod-up               Start without rebuild
#   make prod-stop             Stop production containers
#   make prod-migrate          Run Alembic migrations
#   make prod-migrate-rbac     Seed RBAC user roles (once after first deploy)
#   make prod-logs             Follow all production logs
#   make prod-logs-backend     Follow backend logs only
#   make prod-shell-backend    Bash shell in production backend
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: clone-deps pull \
        dev-up dev-build dev-build-d stop logs logs-backend logs-frontend \
        shell-backend shell-db seed-logto mailhog \
        staging-create-db staging-build staging-up staging-deploy staging-stop \
        staging-logs staging-logs-backend staging-logs-frontend \
        staging-shell-backend staging-migrate staging-migrate-rbac \
        prod-create-db prod-build prod-up prod-deploy prod-stop \
        prod-logs prod-logs-backend prod-logs-frontend \
        prod-shell-backend prod-migrate prod-migrate-rbac

# ── geobox-rbac vendor path ───────────────────────────────────────────────────
# Checked in this order: production server → staging server → local WSL dev
GEOBOX_RBAC_UPSTREAM ?= $(shell \
  if   [ -d /srv/apps/geobox-rbac ]; then echo /srv/apps/geobox-rbac; \
  elif [ -d /home/belac/projects/geobox-rbac ]; then echo /home/belac/projects/geobox-rbac; \
  else echo ""; fi)

VENDOR_DIR := backend/vendor/geobox-rbac

# ── Internal: create a named database on the shared Postgres container ────────
# Usage: $(call _create_db,<dbname>)
define _create_db
	@DB_CONTAINER=$$(docker ps --format '{{.Names}}' | grep -E 'geobox.*[-_]db|[-_]db[-_]' | head -1); \
	if [ -z "$$DB_CONTAINER" ]; then echo "ERROR: cannot find geobox db container"; exit 1; fi; \
	PGUSER=$$(docker exec $$DB_CONTAINER env | grep '^POSTGRES_USER=' | cut -d= -f2); \
	PGUSER=$${PGUSER:-postgres}; \
	PGPASSWORD=$$(docker exec $$DB_CONTAINER env | grep '^POSTGRES_PASSWORD=' | cut -d= -f2); \
	echo "Using container: $$DB_CONTAINER, user: $$PGUSER"; \
	EXISTS=$$(docker exec -e PGPASSWORD=$$PGPASSWORD $$DB_CONTAINER psql -U $$PGUSER -tAc \
	  "SELECT 1 FROM pg_database WHERE datname='$(1)'"); \
	if [ "$$EXISTS" = "1" ]; then \
	  echo "✓ $(1) already exists"; \
	else \
	  docker exec -e PGPASSWORD=$$PGPASSWORD $$DB_CONTAINER psql -U $$PGUSER \
	    -c "CREATE DATABASE $(1)"; \
	  echo "✓ $(1) created"; \
	fi
endef

# ═══════════════════════════════════════════════════════════════════════════════
# Shared
# ═══════════════════════════════════════════════════════════════════════════════

## Sync geobox-rbac into backend/vendor/ (required before any docker build)
clone-deps:
	@if [ -z "$(GEOBOX_RBAC_UPSTREAM)" ]; then \
	  echo "geobox-rbac not found locally — cloning from GitHub..."; \
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

## Pull latest from origin/main (safe even with locally-modified files)
pull:
	git fetch origin main
	git reset --hard origin/main
	@echo "✓ up to date with origin/main"

# ═══════════════════════════════════════════════════════════════════════════════
# Local development
# ═══════════════════════════════════════════════════════════════════════════════

## Build and start all services — foreground (good for first-time setup)
dev-build: clone-deps
	docker compose -f docker-compose.local.yml up --build

## Build and start all services — background
dev-build-d: clone-deps
	docker compose -f docker-compose.local.yml up -d --build

## Start all services without rebuild
dev-up:
	docker compose -f docker-compose.local.yml up -d

## Stop and remove dev containers
stop:
	docker compose -f docker-compose.local.yml down

## Follow logs — all services, or a specific one: make logs service=backend
logs:
	docker compose -f docker-compose.local.yml logs -f $(service)

## Follow backend logs only
logs-backend:
	docker compose -f docker-compose.local.yml logs -f backend

## Follow frontend logs only
logs-frontend:
	docker compose -f docker-compose.local.yml logs -f frontend

## Bash shell in dev backend container
shell-backend:
	docker compose -f docker-compose.local.yml exec backend bash

## psql shell in dev Postgres
shell-db:
	docker compose -f docker-compose.local.yml exec postgres \
	  psql -U $${POSTGRES_USER:-crib} -d $${POSTGRES_DB:-crib_dev}

## One-time: seed Logto with default config (run once during initial setup)
seed-logto:
	./backend/seed-logto.sh

## Open MailHog web UI (dev only)
mailhog:
	open http://localhost:8025 2>/dev/null || \
	xdg-open http://localhost:8025 2>/dev/null || \
	echo "Open http://localhost:8025 in your browser"

# ═══════════════════════════════════════════════════════════════════════════════
# Staging
# ═══════════════════════════════════════════════════════════════════════════════

## Create crib_staging DB on shared Postgres (run once on first deploy)
staging-create-db:
	$(call _create_db,crib_staging)

## Pull latest + build + start all staging containers
staging-build: pull clone-deps
	docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build

## Start staging containers without rebuild
staging-up:
	docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

## Pull latest + rebuild backend+worker only — leaves frontend running (rolling deploy)
staging-deploy: pull clone-deps
	@echo "Deploying Crib staging..."
	docker compose -f docker-compose.staging.yml --env-file .env.staging \
	  up -d --build --no-deps backend worker
	@echo "✓ Staging deployed"

## Stop and remove staging containers
staging-stop:
	docker compose -f docker-compose.staging.yml --env-file .env.staging down

## Follow all staging logs
staging-logs:
	docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f

## Follow staging backend logs only
staging-logs-backend:
	docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f backend

## Follow staging frontend logs only
staging-logs-frontend:
	docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f frontend

## Bash shell in staging backend container
staging-shell-backend:
	docker compose -f docker-compose.staging.yml --env-file .env.staging exec backend bash

## Run Alembic migrations on staging
staging-migrate:
	docker compose -f docker-compose.staging.yml --env-file .env.staging \
	  exec backend alembic upgrade head

## Seed Logto users' roles into RBAC DB (run once after first deploy)
staging-migrate-rbac:
	docker compose -f docker-compose.staging.yml --env-file .env.staging \
	  exec backend python scripts/migrate_users_to_rbac.py

# ═══════════════════════════════════════════════════════════════════════════════
# Production
# ═══════════════════════════════════════════════════════════════════════════════

## Create crib production DB on shared Postgres (run once on first deploy)
prod-create-db:
	$(call _create_db,crib)

## Pull latest + build + start all production containers
prod-build: pull clone-deps
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production up -d --build

## Start production containers without rebuild
prod-up:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production up -d

## Pull latest + rebuild backend+worker only — leaves frontend running (rolling deploy)
prod-deploy: pull clone-deps
	@echo "Deploying Crib production..."
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production \
	  up -d --build --no-deps backend worker
	@echo "✓ Production deployed"

## Stop and remove production containers
prod-stop:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production down

## Follow all production logs
prod-logs:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production logs -f

## Follow production backend logs only
prod-logs-backend:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production logs -f backend

## Follow production frontend logs only
prod-logs-frontend:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production logs -f frontend

## Bash shell in production backend container
prod-shell-backend:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production exec backend bash

## Run Alembic migrations on production
prod-migrate:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production \
	  exec backend alembic upgrade head

## Seed Logto users' roles into RBAC DB (run once after first deploy)
prod-migrate-rbac:
	docker compose -f docker-compose.prod.shared.yml --env-file .env.production \
	  exec backend python scripts/migrate_users_to_rbac.py
