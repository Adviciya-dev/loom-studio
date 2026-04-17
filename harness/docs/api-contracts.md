# API Contracts — Loom Studio

> Base URL: `/api/v1`
> Auth: Bearer JWT token in Authorization header
> All responses follow: `{ success, data, message, meta }`

---

## Auth

### POST /auth/register
```json
Request:  { "email": "user@co.com", "password": "pass123!", "name": "Name", "role": "developer" }
Response: { "success": true, "data": { "id": "uuid", "email": "...", "name": "...", "role": "..." } }
```

### POST /auth/login
```json
Request:  { "email": "user@co.com", "password": "pass123!" }
Response: { "success": true, "data": { "accessToken": "jwt...", "refreshToken": "jwt...", "user": { } } }
```

### POST /auth/refresh
```json
Request:  { "refreshToken": "jwt..." }
Response: { "success": true, "data": { "accessToken": "new-jwt...", "refreshToken": "new-jwt..." } }
```

---

## Projects

### GET /projects
```json
Response: { "success": true, "data": [ { "id": "uuid", "name": "...", "client": "...", "progress": 0, "status": "active" } ] }
```

### GET /projects/:id
```json
Response: { "success": true, "data": { "id": "uuid", "name": "...", "client": "...", "tasks": [], "bugs": [] } }
```

### POST /projects
```json
Request:  { "name": "Loom Studio", "client": "Adviciya", "industry": "Developer Tools", "type": "Desktop App (Electron)", "repo": "Adviciya-dev/loom-studio" }
Response: { "success": true, "data": { "id": "uuid", "repo": "Adviciya-dev/loom-studio" }, "message": "Project created with harness files" }
```

---

## Tasks

### GET /projects/:id/tasks
```json
Response: { "success": true, "data": [ { "id": "TASK-001", "title": "...", "status": "todo", "assignee": "..." } ] }
```

### PATCH /projects/:id/tasks/:taskId
```json
Request:  { "status": "done", "completedDate": "YYYY-MM-DD" }
Response: { "success": true, "data": { "full TaskData" }, "message": "TASK-XXX updated" }
```

---

## Bugs

### POST /projects/:id/bugs
```json
Request:  { "title": "Bug title", "severity": "major", "foundBy": "Name", "description": "..." }
Response: { "success": true, "data": { "id": "BUG-001" }, "message": "BUG-001 created" }
```

---

## Sync

### POST /projects/:id/sync/push
```json
Response: { "success": true, "data": { "commit": "abc123", "changedFiles": 3 } }
```

### GET /projects/:id/sync/status
```json
Response: { "success": true, "data": { "status": "ahead", "ahead": 0, "behind": 0, "lastSync": "..." } }
```
