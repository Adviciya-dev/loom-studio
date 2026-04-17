# Architecture — Loom Studio

> **Project:** Loom Studio — Desktop App (Electron)
> **Last Updated:** 2026-04-17
> **Maintained By:** [Tech Lead]

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Loom Studio                               │
│                                                                          │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐   │
│  │    React SPA (Vite)     │  REST   │     NestJS API Server        │   │
│  │                         │◄───────►│                              │   │
│  │  • Pages                │  JSON   │  • Modules                   │   │
│  │  • Components           │         │  • Services                  │   │
│  │  • State Management     │         │  • Controllers               │   │
│  └─────────────────────────┘         └──────────────┬───────────────┘   │
│                                                      │                   │
│                                      ┌───────────────┼───────────────┐  │
│                                      │               │               │  │
│                                      ▼               ▼               ▼  │
│                                 ┌─────────┐   ┌───────────┐   ┌──────┐ │
│                                 │PostgreSQL│   │   Redis    │   │ Git  │ │
│                                 │  (Data)  │   │  (Cache)   │   │(Repo)│ │
│                                 └─────────┘   └───────────┘   └──────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture

### Folder Structure
```
src/
├── pages/           # One folder per page/route
├── shared/
│   ├── components/  # Reusable UI components
│   ├── hooks/       # React Query hooks
│   ├── services/    # API client (Axios)
│   ├── stores/      # Zustand stores
│   └── types/       # TypeScript interfaces
├── App.tsx
└── main.tsx
```

---

## 3. Backend Architecture

### Module Structure
```
src/
├── modules/
│   ├── auth/        # JWT + RBAC
│   ├── projects/    # Project CRUD
│   ├── harness/     # Parser + Writer
│   └── github/      # Git operations
├── shared/
│   ├── guards/      # Auth guards
│   ├── interceptors/
│   └── types/
└── app.module.ts
```

---

## 4. Database

> Tasks, bugs, and test cases are NOT in the database.
> They live as markdown files in the Git repo's `/harness` folder.
> The database only stores users, projects metadata, and audit logs.

---

## 5. Key Design Decisions

1. **Files as source of truth** — harness markdown files are canonical
2. **Handlebars templates** — for all markdown generation
3. **Redis locks** — prevent concurrent Git operations
4. **Atomic writes** — temp file + rename for data safety

---

## 6. Critical Rules for Claude Code

1. NEVER store task/bug data in PostgreSQL
2. ALWAYS use Handlebars templates for markdown generation
3. ALWAYS acquire Redis lock before Git operations
4. ALWAYS ensure `parse(write(data))` roundtrip is lossless
