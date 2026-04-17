# Prompt: Build CRUD API Endpoints

```
Read these files first:
1. harness/claude.md
2. harness/tasks/TASK-XXX.md
3. harness/docs/api-contracts.md

Build CRUD endpoints for [RESOURCE]:
- GET /api/v1/[resource] — list with pagination
- GET /api/v1/[resource]/:id — get by ID
- POST /api/v1/[resource] — create with validation
- PATCH /api/v1/[resource]/:id — partial update
- DELETE /api/v1/[resource]/:id — soft delete

Response format: { success, data, message, meta }
Add @ApiTags, @ApiOperation Swagger decorators.
Add @Roles guard where specified in task.
```
