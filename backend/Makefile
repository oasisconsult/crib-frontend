.PHONY: dev stop logs seed-logto

dev-up:
	docker compose -f docker-compose.local.yml --env-file .env.local up -d

dev-build:
	docker compose -f docker-compose.local.yml --env-file .env.local up --build
dev-build-d:
	docker compose -f docker-compose.local.yml --env-file .env.local up -d --build

stop:
	docker compose -f docker-compose.local.yml --env-file .env.local down

logs:
	docker compose -f docker-compose.local.yml --env-file .env.local logs -f

seed-logto:
	./backend/seed-logto.sh

logs-backend:
	docker compose -f docker-compose.local.yml --env-file .env.local logs -f backend

logs-frontend:
	docker compose -f docker-compose.local.yml --env-file .env.local logs -f frontend