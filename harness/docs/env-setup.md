# Environment Setup — Loom Studio

---

## Prerequisites

- Node.js 20 LTS
- pnpm 8.15+
- Docker & Docker Compose
- Git
- GitHub Personal Access Token (with `repo` and `admin:org` scopes)

---

## Quick Start

```bash
# 1. Clone the repo
git clone git@github.com:Adviciya-dev/loom-studio.git
cd Loom Studio

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your values (DB password, GitHub token, JWT secret)

# 3. Start infrastructure (PostgreSQL + Redis)
docker compose -f docker-compose.dev.yml up -d postgres redis

# 4. Install dependencies
cd backend && pnpm install
cd ../frontend && pnpm install

# 5. Run database migrations
cd ../backend && pnpm run migration:run

# 6. Seed initial data (admin user)
pnpm run seed

# 7. Start backend (port 3000)
pnpm run start:dev

# 8. Start frontend (port 5173)
cd ../frontend && pnpm run dev
```

---

## Environment Variables (.env)

```bash
# App
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Loom Studio
DB_USER=Loom Studio
DB_PASSWORD=change_me

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-dev-secret-at-least-32-chars-long
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# GitHub
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_ORG=your-org
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Storage
REPO_STORAGE_PATH=./data/repos
```

---

## Default Admin User (after seed)

```
Email: admin@example.com
Password: admin123!
Role: admin
```
