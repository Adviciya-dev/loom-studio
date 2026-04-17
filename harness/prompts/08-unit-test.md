# Prompt: Write Unit Tests

```
Read these files first:
1. harness/claude.md
2. harness/tasks/TASK-XXX.md
3. The source file being tested

Write unit tests for [MODULE/SERVICE]:
- Use Jest with ts-jest
- Use @nestjs/testing for NestJS services
- Mock external dependencies (database, Redis, Git)
- Test: happy path, validation errors, edge cases, error handling
- Minimum 80% coverage for the service
- Use descriptive test names: 'should return 404 when task not found'

Follow AAA pattern: Arrange, Act, Assert.
```
