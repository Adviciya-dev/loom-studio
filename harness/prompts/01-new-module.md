# Prompt: Create New NestJS Module

```
Read these files first:
1. harness/claude.md
2. harness/architecture.md
3. harness/tasks/TASK-XXX.md (the task you're working on)
4. harness/docs/db-schema.md

Create a new NestJS module for [MODULE_NAME]:
- Module file with imports
- Entity with TypeORM decorators (if database work)
- Controller with Swagger decorators
- Service with business logic
- DTOs with class-validator
- Migration file (if new table)

Follow naming conventions from claude.md.
Use Repository pattern for database access.
Add proper error handling with HttpException.
```
