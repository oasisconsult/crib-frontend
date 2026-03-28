# ─── Crib — local dev helpers ──────────────────────────────────────────────────
# All commands assume you have .env.local in the project root.
# Copy .env.example → .env.local and fill in your values before running.

ENV_FILE=.env.local
COMPOSE=docker compose -f docker-compose.local.yml --env-file $(ENV_FILE)

.PHONY: dev up down build logs ps migrate shell-backend shell-db test-backend

## Start all local services (builds if needed)
dev:
	$(COMPOSE) up --build

## Start in detached mode
up:
	$(COMPOSE) up -d --build

## Stop and remove containers
down:
	$(COMPOSE) down

## Rebuild images without cache
build:
	$(COMPOSE) build --no-cache

## Follow logs for all services (or pass service=backend)
logs:
	$(COMPOSE) logs -f $(service)

## Show running containers
ps:
	$(COMPOSE) ps

## Run Alembic migrations inside the backend container
migrate:
	$(COMPOSE) exec backend alembic upgrade head

## Open a shell inside the backend container
shell-backend:
	$(COMPOSE) exec backend bash

## Open psql inside the postgres container
shell-db:
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-crib} $${POSTGRES_DB:-crib_dev}

## Run the backend test suite
test-backend:
	$(COMPOSE) exec backend pytest -v
