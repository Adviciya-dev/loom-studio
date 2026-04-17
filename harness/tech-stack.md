# Tech Stack — Loom Studio

> Last Updated: 2026-04-17

---

## Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| react | 18.3.x | UI framework |
| react-dom | 18.3.x | DOM rendering |
| react-router-dom | 6.22.x | Client-side routing |
| typescript | 5.4.x | Type safety |
| vite | 5.4.x | Build tool + dev server |
| @tanstack/react-query | 5.18.x | Server state management |
| zustand | 4.5.x | Client state management |
| react-hook-form | 7.50.x | Form handling |
| zod | 3.22.x | Schema validation |
| @hookform/resolvers | 3.3.x | Zod + React Hook Form bridge |
| axios | 1.6.x | HTTP client |
| tailwindcss | 3.4.x | Utility CSS |
| @headlessui/react | 1.7.x | Accessible UI primitives |
| lucide-react | 0.330.x | Icons |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @types/react | 18.3.x | React type definitions |
| eslint | 8.57.x | Linting |
| prettier | 3.2.x | Code formatting |

---

## Backend

| Package | Version | Purpose |
|---------|---------|---------|
| @nestjs/core | 10.3.x | API framework |
| @nestjs/platform-express | 10.3.x | HTTP adapter |
| @nestjs/typeorm | 10.0.x | ORM integration |
| typeorm | 0.3.20 | Database ORM |
| pg | 8.11.x | PostgreSQL driver |
| @nestjs/jwt | 10.2.x | JWT utilities |
| @nestjs/passport | 10.0.x | Auth strategies |
| passport-jwt | 4.0.x | JWT passport strategy |
| @nestjs/cache-manager | 2.2.x | Redis cache |
| @nestjs/swagger | 7.3.x | API documentation |
| class-validator | 0.14.x | DTO validation |
| class-transformer | 0.5.x | DTO transformation |
| simple-git | 3.22.x | Git operations |
| handlebars | 4.7.x | Markdown template engine |
| bcryptjs | 2.4.x | Password hashing |
| winston | 3.11.x | Structured logging |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @nestjs/testing | 10.3.x | Test utilities |
| jest | 29.7.x | Test runner |
| ts-jest | 29.1.x | TS Jest transformer |

---

## Infrastructure

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20 LTS | Runtime |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Cache + locks + queues |
| Docker | 25.x | Containerization |
| Docker Compose | 2.24.x | Local + prod orchestration |
| pnpm | 8.15.x | Package manager |
