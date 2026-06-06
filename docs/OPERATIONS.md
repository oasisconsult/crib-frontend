# Crib — Operations Guide

Internal reference for BAU tasks, deployments, troubleshooting, and configuration.
This file is **not for public distribution**.

---

## Contents

1. [Architecture](#1-architecture)
2. [Environments](#2-environments)
3. [Make Commands Reference](#3-make-commands-reference)
4. [First Deploy Checklist](#4-first-deploy-checklist)
5. [Standard Deploy (BAU)](#5-standard-deploy-bau)
6. [Automated Rent Lifecycle](#6-automated-rent-lifecycle)
7. [User Roles](#7-user-roles)
8. [RBAC Setup & Management](#8-rbac-setup--management)
9. [Logto Configuration](#9-logto-configuration)
10. [Database Operations](#10-database-operations)
11. [Environment Variables Reference](#11-environment-variables-reference)
12. [Troubleshooting](#12-troubleshooting)
13. [Useful One-liners](#13-useful-one-liners)

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VPS (shared with GeoBox and FixLeakage)                    │
│                                                             │
│  ┌──────────────────┐   ┌──────────────────┐               │
│  │ crib-frontend    │   │ crib-backend     │               │
│  │ Next.js :3000    │──▶│ FastAPI  :8000   │               │
│  └──────────────────┘   └────────┬─────────┘               │
│                                  │                          │
│  ┌────────────────────────────────▼─────────────────────┐  │
│  │  Shared Infrastructure (GeoBox stack)                │  │
│  │  geobox-db-prod   PostgreSQL  :5432                  │  │
│  │    └── crib         (Crib app DB)                    │  │
│  │    └── rbac         (shared RBAC DB, owned by GeoBox)│  │
│  │  geobox-redis-prod  Redis      :6379  DB 6           │  │
│  │  geobox-logto-prod  Logto      :3001/:3002           │  │
│  │  minio              MinIO      :9000                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Nginx Proxy Manager routes:                                │
│    crib.geoboxafrica.com → crib-frontend-prod:3000          │
└─────────────────────────────────────────────────────────────┘
```

**Networks**
- `crib-prod` — internal network between Crib containers
- `geobox-network` — external; connects Crib to shared Postgres, Redis, Logto, MinIO
- `npm-network` — external; connects frontend to Nginx Proxy Manager

**Redis DB allocation**
| DB | Owner |
|----|-------|
| 0 | GeoBox API |
| 1 | GeoBox sessions |
| 2 | GeoBox rate-limit |
| 3 | GeoBox security |
| 4 | GeoBox billing |
| 5 | GeoBox (other) |
| 6 | **Crib** |
| 7 | GeoBox workers |
| 8 | FixLeakage |

---

## 2. Environments

| Environment | Compose file | Env file | Backend port | Frontend port |
|---|---|---|---|---|
| Local dev | `docker-compose.local.yml` | `.env` | 8001 | 3000 |
| Staging | `docker-compose.staging.yml` | `.env.staging` | 8010 | 3010 |
| Production | `docker-compose.prod.shared.yml` | `.env.production` | 8000 | 3000 (via NPM) |

Staging and production run on the same VPS at `/srv/apps/crib`.
Local dev runs in WSL at `/home/belac/projects/crib`.

---

## 3. Make Commands Reference

### Shared

| Command | Description |
|---|---|
| `make clone-deps` | Sync `geobox-rbac` into `backend/vendor/` (required before any build) |
| `make pull` | `git fetch` + `git reset --hard origin/main` — safe on the server |

### Local Dev

| Command | Description |
|---|---|
| `make dev-build` | Build + start all services (foreground) |
| `make dev-build-d` | Build + start all services (background) |
| `make dev-up` | Start without rebuild |
| `make stop` | Stop dev containers |
| `make logs [service=name]` | Tail all logs, or a specific service |
| `make logs-backend` | Tail backend only |
| `make shell-backend` | Bash shell in dev backend |
| `make shell-db` | psql shell in dev Postgres |
| `make seed-logto` | One-time Logto seed (run once on first local setup) |

### Staging

| Command | Description |
|---|---|
| `make staging-create-db` | Create `crib_staging` DB on shared Postgres (once) |
| `make staging-build` | Pull + build + start all staging containers |
| `make staging-deploy` | Pull + rebuild backend+worker only (rolling, keeps frontend up) |
| `make staging-up` | Start without rebuild |
| `make staging-stop` | Stop staging containers |
| `make staging-migrate` | Run Alembic DB migrations |
| `make staging-migrate-rbac` | Seed Logto users' roles into shared RBAC DB (once) |
| `make staging-logs` | Tail all staging logs |
| `make staging-logs-backend` | Tail staging backend only |
| `make staging-logs-frontend` | Tail staging frontend only |
| `make staging-shell-backend` | Bash shell in staging backend |

### Production

| Command | Description |
|---|---|
| `make prod-create-db` | Create `crib` DB on shared Postgres (once) |
| `make prod-grant-rbac` | Grant `crib_user` access to shared RBAC tables (once) |
| `make prod-build` | Pull + build + start all production containers |
| `make prod-deploy` | Pull + rebuild backend+worker only (rolling, keeps frontend up) |
| `make prod-up` | Start without rebuild |
| `make prod-stop` | Stop production containers |
| `make prod-migrate` | Run Alembic DB migrations |
| `make prod-migrate-rbac` | Seed Logto users' roles into shared RBAC DB (once) |
| `make prod-logs` | Tail all production logs |
| `make prod-logs-backend` | Tail production backend only |
| `make prod-logs-frontend` | Tail production frontend only |
| `make prod-shell-backend` | Bash shell in production backend |

---

## 4. First Deploy Checklist

Run these steps **once** when setting up a new environment.

### Pre-flight

- [ ] Server has Docker and Docker Compose installed
- [ ] `/srv/apps/crib` cloned from GitHub
- [ ] `/srv/apps/geobox-rbac` exists (or will be cloned from GitHub by `clone-deps`)
- [ ] Shared Postgres, Redis, Logto, MinIO containers running (GeoBox stack)
- [ ] `geobox-network` Docker network exists

### Logto setup (in Logto Admin)

- [ ] Create **Traditional Web** application → note `App ID` and `App Secret`
- [ ] Create **Machine-to-Machine** application → note `M2M App ID` and `M2M App Secret`
  - Under the M2M app → **Machine-to-machine** tab → enable **Logto Management API** with `all` scope
- [ ] Create **API Resource** → set audience to e.g. `https://crib.geoboxafrica.com/api`
- [ ] Create **Organisation Roles**: `owner`, `manager`, `landlord`, `caretaker`, `maintenance`, `tenant`

### Environment file

```bash
cp .env.production.example .env.production
nano .env.production
```

Generate secrets:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"          # SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # SETTINGS_ENCRYPTION_KEY
openssl rand -base64 32 | tr -d '\n/+='                             # NEXTAUTH_SECRET
```

### Deploy sequence

```bash
make prod-create-db        # create crib DB on shared Postgres
make prod-build            # pull + build + start all containers (runs migrations automatically)
make prod-grant-rbac       # grant crib_user access to shared rbac tables
make prod-migrate-rbac     # seed existing Logto users' roles into RBAC DB
```

### Post-deploy verification

```bash
# Backend healthy
curl http://localhost:8000/api/v1/health

# RBAC seeded
docker logs crib-backend-prod 2>&1 | grep rbac | tail -5
# Expect: rbac.seed.complete

# Nginx Proxy Manager
# Add proxy host: crib.geoboxafrica.com → crib-frontend-prod:3000
# Add proxy host: crib-api.geoboxafrica.com → crib-backend-prod:8000 (optional)
```

---

## 5. Standard Deploy (BAU)

### Routine backend + worker deploy (most common)

```bash
cd /srv/apps/crib
make prod-deploy
```

This: pulls latest code, rebuilds backend and worker images, restarts them. Frontend stays up.

### Full rebuild (all containers including frontend)

Only needed when frontend code, env vars, or `NEXT_PUBLIC_*` build args change:

```bash
make prod-build
```

### After a migration

Migrations run automatically on backend startup (`alembic upgrade head` is in the container command). Verify they ran:

```bash
docker logs crib-backend-prod 2>&1 | grep alembic
```

To run manually if needed:

```bash
make prod-migrate
```

### Rollback

There is no automated rollback. To revert to a previous commit:

```bash
git log --oneline -10                          # find the commit to revert to
git reset --hard <commit-sha>
make prod-deploy
```

---

## 6. Automated Rent Lifecycle

**Admin does not need to do anything day-to-day.** Rent schedules, overdue detection, late fees, and tenant notifications are all handled automatically by the Celery beat scheduler embedded in the worker container.

### How it works

```
Lease activated / imported
        │
        ▼
generate_rent_schedules() called immediately
  ├─ Creates one RentSchedule row per billing month
  ├─ Rolling leases: covers from lease.created_at up to today + 3 months
  └─ Fixed-term leases: covers start_date → end_date exactly

Every 24 hours (Celery beat, embedded in crib-worker-prod):
        │
        ├─ extend_rolling_schedules
        │    └─ Tops up rolling leases 3 months ahead (idempotent)
        │
        ├─ mark_overdue_schedules
        │    └─ Sets status = overdue for any pending schedule past its due_date
        │
        ├─ apply_late_fees_task
        │    └─ Applies late fee to newly-overdue schedules (if org has autoApplyLateFees=true)
        │
        └─ send_rent_reminders
             └─ Sends in-app notification to tenant N days before due_date
```

### Daily scheduled tasks

| Task | Schedule | What it does |
|---|---|---|
| `extend_rolling_schedules` | Daily | Generates missing schedule rows for rolling leases; extends 3 months ahead |
| `mark_overdue_schedules` | Daily | Marks `pending` schedules past `due_date` as `overdue` |
| `apply_late_fees_task` | Daily | Applies flat/percentage late fee to overdue schedules (per-org opt-in) |
| `send_rent_reminders` | Daily | Sends reminder notifications N days before due date (per-org, default 3 days) |
| `poll_mtn_transactions` | Every 5 min | Polls MTN Mobile Money for pending transactions (fallback for missed webhooks) |
| `poll_airtel_transactions` | Every 5 min | Same for Airtel Money |

All tasks are **idempotent** — re-running them manually is safe.

### When leases are created

| How lease is created | Schedule generation |
|---|---|
| Normal activation flow (UI) | `generate_rent_schedules` called immediately on activation |
| Bulk CSV import (active/rolling) | `generate_rent_schedules` called immediately during import |
| Bulk CSV import (draft/upcoming) | No schedules until the lease is activated |

> **Important for backdated leases:** If a lease has a `start_date` in the past (e.g. a tenancy that started in 2023 but was only entered into Crib in 2026), the system counts from **when it was entered into Crib** (`created_at`), not from the historical `start_date`. This avoids generating years of backdated overdue charges for tenancies that predate the system.

### When notifications are sent

| Trigger | Recipient | Channel | Timing |
|---|---|---|---|
| Rent reminder | Tenant | In-app notification | N days before `due_date` (default 3 days, configurable per org) |
| Rent overdue | — | — | Currently flagged on dashboard; email can be enabled per org via `autoMarkOverdue=true` |
| Late fee applied | — | — | Applied silently; visible on tenant's payment schedule |

> Email/SMS notifications for overdue events are sent only if the org has the relevant integrations configured (SendGrid / SMS provider) and the per-org setting is enabled in **Settings → Payment Settings**.

### Per-org payment settings

These are configured by the org owner in **Settings → Payment Settings** and control per-org automation behaviour:

| Setting | Default | Effect |
|---|---|---|
| `autoMarkOverdue` | `true` | Whether to mark unpaid schedules as overdue after due date |
| `autoApplyLateFees` | `false` | Whether to automatically apply a late fee when a schedule becomes overdue |
| `lateFeeType` | `flat` | `flat` (fixed amount) or `percentage` of rent |
| `lateFeeValue` | `0` | Amount or percentage, e.g. `700000` (flat) or `1` (1%) |
| `gracePeriodDays` | `5` | Days after due date before late fee is applied |
| `reminderDaysBefore` | `3` | Days before due date to send reminder notification |

### Verifying the scheduler is running

```bash
# Check beat scheduler started in worker logs
docker compose -f docker-compose.prod.shared.yml --env-file .env.production logs --tail=20 worker
# Expect: [INFO/Beat] beat: Starting...

# Check a specific task ran
docker compose -f docker-compose.prod.shared.yml --env-file .env.production logs worker | \
  grep "mark_overdue_schedules complete"
# Expect: mark_overdue_schedules complete: marked=X skipped_orgs=Y
```

### Manually triggering tasks (if needed)

The beat scheduler runs tasks automatically, but any task can be triggered manually — for example, after a bulk import or if the worker was down for a day:

```bash
# Backfill / extend schedules for all active rolling leases
docker compose -f docker-compose.prod.shared.yml --env-file .env.production exec worker \
  celery -A app.worker.celery_app call app.worker.tasks.payments.extend_rolling_schedules

# Mark overdue schedules immediately (don't wait for tonight's run)
docker compose -f docker-compose.prod.shared.yml --env-file .env.production exec worker \
  celery -A app.worker.celery_app call app.worker.tasks.payments.mark_overdue_schedules

# Apply late fees now
docker compose -f docker-compose.prod.shared.yml --env-file .env.production exec worker \
  celery -A app.worker.celery_app call app.worker.tasks.payments.apply_late_fees_task

# Send rent reminders now (only fires for tenants whose due_date is exactly N days away)
docker compose -f docker-compose.prod.shared.yml --env-file .env.production exec worker \
  celery -A app.worker.celery_app call app.worker.tasks.payments.send_rent_reminders

# One-time cleanup: waive pre-system backdated schedules for rolling leases
docker compose -f docker-compose.prod.shared.yml --env-file .env.production exec worker \
  celery -A app.worker.celery_app call app.worker.tasks.payments.waive_pre_system_schedules
```

### What the Payments dashboard shows

| Card | Source |
|---|---|
| **Expected** | Sum of `amount_due` for all rent schedules due in the current calendar month |
| **Collected** | Confirmed/completed payments made this calendar month |
| **Overdue** | Total outstanding balance across all overdue schedules |
| **Collection Rate** | Collected ÷ (Collected + Overdue) × 100 |

The **Overdue Rent** tab shows individual schedules with the tenant name, unit, outstanding balance, and a link to the lease.

The **dashboard** (home page) shows the same overdue count and amount, updated in real time.

---

## 7. User Roles

Roles are stored in the shared RBAC database and synced from Logto on each user login.

| Role | Access level | Notes |
|---|---|---|
| `superadmin` | Platform-wide, all orgs | Managed by Oasis Consult |
| `owner` | Full CRUD on their organisation | Self-managing landlord or agency owner |
| `manager` | Property operations within org | Can't access financial analytics |
| `landlord` | Read-only view of their properties | Agency-managed landlord |
| `caretaker` | Delegated access to specific properties | Scoped via `caretaker_property_ids` on their profile |
| `maintenance` | Read-only on inspections and maintenance requests | |
| `tenant` | Own records only (lease, payments, documents) | |

### Caretaker scope

A caretaker's accessible properties are stored in `profiles.caretaker_property_ids` (JSONB list of UUIDs). The API syncs this into `LandlordPropertyAccess` rows on every request so all services (analytics, leases, inspections) stay in scope automatically.

### Assigning roles

Roles are assigned in **Logto Admin**:
- Go to **User Management** → find user → **Roles** tab → assign org role
- Role takes effect on next login (token refresh)

To force immediate effect without waiting for token expiry, the session invalidation endpoint can be called:
```
POST /api/v1/admin/users/{logto_sub}/invalidate-session
```

---

## 8. RBAC Setup & Management

Crib uses the shared `geobox-rbac` framework. The RBAC database (`rbac`) lives on the same Postgres instance as Crib's app database.

### Phases

| Phase | What | Config |
|---|---|---|
| 1 | `AppContextMiddleware` installed | `RBAC_DATABASE_URL` set |
| 2 | Crib registered in `rbac_apps` | Runs automatically on backend startup |
| 3 | Dual-source role resolution | `request.state.rbac` + JWT fallback |
| 4 | DB roles authoritative | `RBAC_SHADOW_MODE=false` |

Production runs Phase 4. `RBAC_SHADOW_MODE` is hardcoded to `false` in `docker-compose.prod.shared.yml`.

### Re-seeding after adding a new Logto user

New users get their roles automatically on first login (the backend reads their Logto JWT roles). No manual seeding needed for individual users.

`make prod-migrate-rbac` only needs to be run once (initial migration of existing users). It is safe to re-run — all inserts use `ON CONFLICT DO NOTHING`.

### If RBAC seed fails on startup

```bash
docker logs crib-backend-prod 2>&1 | grep rbac.seed
```

Most common cause: `crib_user` lost permissions on `rbac` tables (e.g. after a GeoBox migration that recreated tables). Re-run:

```bash
make prod-grant-rbac
docker restart crib-backend-prod
```

---

## 9. Logto Configuration

Crib uses the **shared GeoBox Logto instance** (`auth.geoboxafrica.com`).

### Applications needed in Logto Admin

| Type | Name | Purpose |
|---|---|---|
| Traditional Web | Crib Production | Frontend auth (PKCE flow) |
| Machine-to-Machine | Crib Backend Production | Backend → Logto Management API |

### Key env vars

| Var | Value source |
|---|---|
| `LOGTO_ENDPOINT` | Public Logto URL e.g. `https://auth.geoboxafrica.com` |
| `LOGTO_PUBLIC_ENDPOINT` | Same as above (used for frontend build args) |
| `LOGTO_JWKS_URI_OVERRIDE` | Internal: `http://geobox-logto-prod:3001/oidc/jwks` |
| `LOGTO_ADMIN_ENDPOINT` | Internal: `http://geobox-logto-prod:3002` |
| `LOGTO_ADMIN_API_RESOURCE` | Always `https://default.logto.app/api` (even self-hosted) |
| `LOGTO_API_RESOURCE` | The Crib API Resource audience e.g. `https://crib.geoboxafrica.com/api` |

### Common Logto errors

**400 Bad Request on token endpoint**
- `LOGTO_ADMIN_API_RESOURCE` is wrong — must be `https://default.logto.app/api`
- M2M app not granted Management API access in Logto Admin

**401 on API requests**
- `LOGTO_API_RESOURCE` in the env doesn't match the API Resource registered in Logto
- `LOGTO_JWKS_URI_OVERRIDE` unreachable from inside the container

---

## 10. Database Operations

### Connect to production DB

```bash
make prod-shell-backend
# inside container:
python -c "from app.core.config import get_settings; s=get_settings(); print(s.database_url)"
# or directly:
docker exec -it geobox-db-prod psql -U crib_user -d crib
```

### Run migrations

Migrations run automatically on backend startup. To run manually:

```bash
make prod-migrate
```

### Check migration status

```bash
make prod-shell-backend
alembic current
alembic history --verbose
```

### Create a new migration (local dev only)

```bash
# In WSL local dev:
docker compose -f docker-compose.local.yml exec backend \
  alembic revision --autogenerate -m "describe_the_change"
```

Always review the generated file before committing — autogenerate is not always correct.

### RBAC database permissions

The `crib_user` needs `SELECT, INSERT, UPDATE` on all tables in the `rbac` database. Applied via:

```bash
make prod-grant-rbac
```

If GeoBox runs a migration that adds new tables, re-run `prod-grant-rbac` to cover them.

---

## 11. Environment Variables Reference

### Required — must be set before first build

| Variable | Description | How to generate |
|---|---|---|
| `SECRET_KEY` | App signing key (min 32 chars) | `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `SETTINGS_ENCRYPTION_KEY` | Fernet key for encrypting DB-stored secrets | `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `NEXTAUTH_SECRET` | Next.js session cookie encryption | `openssl rand -base64 32 \| tr -d '\n/+='` |
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Postgres connection | Copy from GeoBox `.env.production` |
| `REDIS_HOST` / `REDIS_PASSWORD` | Redis connection | Copy from GeoBox `.env.production` |
| `LOGTO_APP_ID` / `LOGTO_APP_SECRET` | Crib Traditional Web app | Create in Logto Admin |
| `LOGTO_M2M_APP_ID` / `LOGTO_M2M_APP_SECRET` | Crib M2M app | Create in Logto Admin |
| `LOGTO_API_RESOURCE` | Crib API Resource audience | Register in Logto Admin |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO credentials | Copy from GeoBox `.env.production` |

### Optional — have safe defaults

| Variable | Default | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | `local` | Set to `minio` in production |
| `RBAC_SHADOW_MODE` | `true` | Set to `false` in production (hardcoded in compose) |
| `EMAIL_PROVIDER` | `sendgrid` | `sendgrid` or `smtp` |
| `ENVIRONMENT` | `development` | Set to `production` in compose |
| `REDIS_DB` | `0` | Set to `6` in production compose |

---

## 12. Troubleshooting

### Backend won't start

```bash
docker logs crib-backend-prod 2>&1 | tail -50
```

Common causes:
- `DATABASE_URL` wrong or `crib` DB doesn't exist → run `make prod-create-db`
- `LOGTO_APP_ID` empty → fill `.env.production`
- `SETTINGS_ENCRYPTION_KEY` missing → generate and add to `.env.production`
- Alembic migration failed → check logs for migration errors, may need manual DB fix

### RBAC seed failing on startup

```bash
docker logs crib-backend-prod 2>&1 | grep rbac.seed
```

- `permission denied for table rbac_apps` → run `make prod-grant-rbac` then `docker restart crib-backend-prod`
- `Can't locate revision` → geobox-rbac vendor is outdated → `make clone-deps` then `make prod-deploy`

### Users can't log in / getting 401

1. Check `LOGTO_JWKS_URI_OVERRIDE` is reachable from inside the container:
   ```bash
   make prod-shell-backend
   curl http://geobox-logto-prod:3001/oidc/jwks
   ```
2. Check `LOGTO_API_RESOURCE` matches the registered Logto API Resource exactly (including trailing slash if any)
3. Check token issuer: `LOGTO_ENDPOINT` must be the public URL, not the internal Docker hostname

### User has wrong role / can't access features

1. Check their Logto roles in Logto Admin → User Management → user → Roles
2. Assign the correct org role in Logto
3. Role takes effect on next token refresh (or immediately if session is invalidated)
4. Check RBAC DB directly:
   ```bash
   docker exec -it geobox-db-prod psql -U crib_user -d rbac -c \
     "SELECT u.logto_sub, r.name FROM rbac_platform_users u
      JOIN rbac_user_roles ur ON ur.user_id = u.id
      JOIN rbac_roles r ON r.id = ur.role_id
      WHERE u.logto_sub = '<logto_sub>';"
   ```

### Frontend shows blank page or auth error

- `NEXT_PUBLIC_*` vars are baked into the JS bundle at build time — if they were wrong, you must rebuild: `make prod-build`
- Check the correct `LOGTO_PUBLIC_ENDPOINT` and `LOGTO_APP_ID` are in `.env.production`
- Check NPM proxy host points to `crib-frontend-prod:3000`

### Celery tasks not running (emails/SMS not sending)

```bash
docker logs crib-worker-prod 2>&1 | tail -30
```

- Worker uses Redis DB 6 — check `REDIS_URL` in compose uses `/6`
- Check `EMAIL_PROVIDER` and `SENDGRID_API_KEY` / SMTP vars are set

### Storage — file uploads failing

```bash
docker logs crib-backend-prod 2>&1 | grep storage
```

- `STORAGE_PROVIDER` must be `minio` in production
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` must match the shared MinIO instance
- Check MinIO bucket `crib-prod` exists; create if not:
  ```bash
  make prod-shell-backend
  python -c "
  from app.core.config import get_settings
  from minio import Minio
  s = get_settings()
  c = Minio(s.minio_endpoint, s.minio_access_key, s.minio_secret_key, secure=s.minio_secure)
  if not c.bucket_exists('crib-prod'): c.make_bucket('crib-prod')
  print('bucket ready')
  "
  ```

---

## 13. Useful One-liners

```bash
# Check all Crib container status
docker ps --filter name=crib

# Tail all production logs in real time
make prod-logs

# Check backend health
curl http://localhost:8000/api/v1/health

# Check Prometheus metrics endpoint
curl http://localhost:8000/metrics | head -20

# Show current Alembic migration head on production
docker exec crib-backend-prod alembic current

# List all users and their RBAC roles
docker exec -it geobox-db-prod psql -U crib_user -d rbac -c \
  "SELECT u.email, r.name as role
   FROM rbac_platform_users u
   JOIN rbac_user_roles ur ON ur.user_id = u.id
   JOIN rbac_roles r ON r.id = ur.role_id
   WHERE ur.app_id = (SELECT id FROM rbac_apps WHERE slug = 'crib')
   ORDER BY u.email;"

# Force a user's session to refresh (role change takes effect immediately)
# Replace <logto_sub> with the user's Logto sub
curl -X POST http://localhost:8000/api/v1/admin/users/<logto_sub>/invalidate-session \
  -H "Authorization: Bearer <superadmin_token>"

# View Celery queued tasks
docker exec crib-backend-prod celery -A app.worker.celery_app inspect active

# Check Redis DB 6 key count
docker exec geobox-redis-prod redis-cli -a $REDIS_PASSWORD -n 6 DBSIZE

# Wipe Redis cache for Crib (use with care — forces all caches to rebuild)
docker exec geobox-redis-prod redis-cli -a $REDIS_PASSWORD -n 6 FLUSHDB
```
