.PHONY: dev stop logs seed-logto

dev:
	docker compose -f docker-compose.local.yml --env-file .env.local up

dev-build:
	docker compose -f docker-compose.local.yml --env-file .env.local up --build

stop:
	docker compose -f docker-compose.local.yml --env-file .env.local down

logs:
	docker compose -f docker-compose.local.yml --env-file .env.local logs -f

seed-logto:
	./seed-logto.sh

logs-backend:
	docker compose -f docker-compose.local.yml --env-file .env.local logs -f backend

logs-frontend:
	docker compose -f docker-compose.local.yml --env-file .env.local logs -f frontend