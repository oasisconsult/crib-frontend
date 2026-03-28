# Secure Settings Guide

Copy `.env.example` to `.env.local` and fill in every value marked `CHANGE_ME`.
Never commit `.env.local` — it is in `.gitignore`.

## How to generate strong secrets

```bash
# 32-byte hex string (for SECRET_KEY, NEXTAUTH_SECRET)
openssl rand -hex 32

# 16-byte base64 (alternative)
openssl rand -base64 24
```

## Variable reference

### App
| Variable | Description | Example |
|----------|-------------|---------|
| `ENVIRONMENT` | Runtime environment | `development` |
| `SECRET_KEY` | Backend signing key — **generate with openssl** | `a3f9...` |
| `NEXTAUTH_SECRET` | Next.js session secret — **generate with openssl** | `b7c2...` |

### PostgreSQL (app database)
| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_USER` | DB username | `crib` |
| `POSTGRES_PASSWORD` | DB password — **change from default** | `s3cur3pass` |
| `POSTGRES_DB` | DB name | `crib_dev` |

### PostgreSQL (Logto database — separate instance)
| Variable | Description | Example |
|----------|-------------|---------|
| `LOGTO_POSTGRES_USER` | Logto DB username | `logto` |
| `LOGTO_POSTGRES_PASSWORD` | Logto DB password — **change from default** | `s3cur3pass` |
| `LOGTO_POSTGRES_DB` | Logto DB name | `logto` |

### Redis
| Variable | Description | Example |
|----------|-------------|---------|
| `REDIS_PASSWORD` | Redis auth password — **change from default** | `r3d1spass` |

### Logto (Authentication)
| Variable | Description | Where to find |
|----------|-------------|---------------|
| `NEXT_PUBLIC_LOGTO_ENDPOINT` | Logto public URL (frontend) | `http://localhost:3001` |
| `LOGTO_ENDPOINT` | Logto URL (backend JWT validation) | `http://logto:3001/` ← Docker internal |
| `NEXT_PUBLIC_LOGTO_APP_ID` | Frontend app client ID | Logto Admin Console → Applications |
| `LOGTO_APP_ID` | Backend app client ID | Logto Admin Console → Applications |
| `LOGTO_APP_SECRET` | Backend app secret | Logto Admin Console → Applications |
| `LOGTO_API_RESOURCE` | API resource identifier | `https://crib.app/api` |
| `LOGTO_ADMIN_ENDPOINT` | Logto Management API URL | `http://logto:3002/` ← Docker internal |
| `LOGTO_M2M_APP_ID` | M2M app for org provisioning (optional) | Logto Admin Console → M2M Apps |
| `LOGTO_M2M_APP_SECRET` | M2M app secret (optional) | Logto Admin Console → M2M Apps |

> **Local Docker tip**: Inside Docker Compose, services talk to each other by service name.
> The backend container reaches Logto at `http://logto:3001/`, not `http://localhost:3001/`.
> Your `.env.local` should therefore have:
> ```
> LOGTO_ENDPOINT=http://logto:3001/
> LOGTO_ADMIN_ENDPOINT=http://logto:3002/
> ```

### MinIO (object storage)
| Variable | Description | Example |
|----------|-------------|---------|
| `MINIO_ACCESS_KEY` | MinIO root user | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO root password — **min 8 chars** | `m1n10pass` |
| `MINIO_BUCKET` | Default bucket name | `crib-documents` |

### Notifications (fill in when ready — can be blank in dev)
| Variable | Service |
|----------|---------|
| `SENDGRID_API_KEY` | SendGrid email |
| `TWILIO_ACCOUNT_SID` | Twilio SMS |
| `TWILIO_AUTH_TOKEN` | Twilio SMS |
| `TWILIO_FROM_NUMBER` | Twilio sender number |
| `WHATSAPP_API_KEY` | Meta Cloud API |
| `WHATSAPP_PHONE_ID` | Meta Cloud API phone ID |
| `AFRICASTALKING_API_KEY` | Africa's Talking SMS (alternative to Twilio) |
| `AFRICASTALKING_USERNAME` | Africa's Talking account |
| `AFRICASTALKING_SENDER_ID` | Africa's Talking sender ID |

## Running with the env file

Always start Docker Compose using the Makefile — it passes `--env-file .env.local` automatically:

```bash
make dev        # build + start all services
make up         # detached mode
make migrate    # run database migrations
make logs       # tail logs
```

Or manually:
```bash
docker compose -f docker-compose.local.yml --env-file .env.local up
```
