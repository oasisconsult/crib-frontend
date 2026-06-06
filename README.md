# Crib

Property management platform for landlords, agencies, and tenants.

## Stack

- **Backend** — Python / FastAPI, PostgreSQL, Redis, Celery
- **Frontend** — Next.js (App Router), TypeScript, Tailwind CSS
- **Auth** — Logto (OIDC)
- **Storage** — MinIO / S3
- **Infrastructure** — Docker Compose

## Local Development

### Prerequisites

- Docker and Docker Compose
- WSL2 (Windows) or Linux/macOS

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/oasisconsult/crib-frontend.git crib
cd crib

# 2. Copy and fill the env file
cp .env.example .env
# edit .env with your local values

# 3. Build and start all services
make dev-build
```

The backend runs at `http://localhost:8001` and the frontend at `http://localhost:3000`.

API docs (dev only): `http://localhost:8001/docs`

### Common dev commands

```bash
make dev-build-d        # start in background
make stop               # stop all services
make logs-backend       # tail backend logs
make shell-backend      # open shell in backend container
```

## Contributing

1. Branch from `main`
2. Make your changes
3. Open a pull request against `main`

## License

Private — all rights reserved. © Oasis Consult Uganda.
