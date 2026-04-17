# Prompt: Create Database Migration

```
Read these files first:
1. harness/claude.md
2. harness/docs/db-schema.md
3. harness/tasks/TASK-XXX.md

Create a TypeORM migration for [TABLE_NAME]:
- Use QueryRunner for up() and down() methods
- Create table with all columns from db-schema.md
- Add indexes as specified
- Add foreign key constraints
- down() must reverse all changes (DROP TABLE)
- Use uuid_generate_v4() for UUID defaults
- Add created_at/updated_at with DEFAULT NOW()

Run: pnpm run migration:generate -- -n [MigrationName]
```
