# Database Schema — Loom Studio

> **Important:** Tasks, bugs, and test cases are NOT stored in the database.
> They live as markdown files in the Git repository's /harness folder.
> The database only stores users, projects metadata, and audit logs.

---

## users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| password | VARCHAR(255) | NOT NULL | bcrypt hash |
| name | VARCHAR(100) | NOT NULL | Display name |
| role | ENUM('admin','pm','lead','developer','tester') | NOT NULL, DEFAULT 'developer' | System role |
| avatar_url | VARCHAR(500) | NULLABLE | Profile image URL |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

**Indexes:** UNIQUE(email)

---

## projects

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| name | VARCHAR(200) | NOT NULL | Project display name |
| client | VARCHAR(200) | NULLABLE | Client/company name |
| industry | VARCHAR(100) | NULLABLE | e.g., Healthcare, Fintech |
| type | VARCHAR(100) | NULLABLE | e.g., Full Stack Web App |
| repo | VARCHAR(300) | NOT NULL | GitHub repo (Adviciya-dev/loom-studio) |
| branch | VARCHAR(100) | NOT NULL, DEFAULT 'main' | Active branch |
| pod | VARCHAR(50) | NULLABLE | Team pod |
| sprint | VARCHAR(50) | NULLABLE | Current sprint name |
| status | ENUM('planning','active','archived') | NOT NULL, DEFAULT 'planning' | |
| settings | JSONB | DEFAULT '{}' | Flexible project settings |
| last_sync | TIMESTAMP | NULLABLE | Last git push/pull timestamp |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |
| deleted_at | TIMESTAMP | NULLABLE | Soft delete |

**Indexes:** INDEX(status), INDEX(repo)

---

## project_members

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id, NOT NULL | |
| project_id | UUID | FK → projects.id, NOT NULL | |
| role | ENUM('pm','lead','developer','tester') | NOT NULL | Role within this project |
| joined_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

**Indexes:** UNIQUE(user_id, project_id)

---

## audit_log

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id, NOT NULL | Who made the change |
| project_id | UUID | FK → projects.id, NULLABLE | Which project |
| action | VARCHAR(50) | NOT NULL | e.g., 'task.create', 'bug.update', 'sync.push' |
| resource_type | VARCHAR(50) | NOT NULL | e.g., 'task', 'bug', 'project' |
| resource_id | VARCHAR(50) | NOT NULL | e.g., 'TASK-005', 'BUG-002' |
| diff | JSONB | NULLABLE | Before/after snapshot of changed fields |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

**Indexes:** INDEX(project_id, created_at DESC), INDEX(user_id)
