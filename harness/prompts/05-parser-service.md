# Prompt: Build Markdown Parser

```
Read these files first:
1. harness/claude.md
2. harness/tasks/TASK-003.md
3. harness/tasks/TASK-XXX.md (sample task file to understand format)

Build a parser service that reads [FILE_TYPE].md and returns structured JSON.
- Split file by '## ' headings
- Parse markdown tables using regex
- Parse checklists: '- [x]' and '- [ ]'
- Parse key-value: '- **Key:** Value'
- Parse code blocks between triple backticks
- Handle missing/empty sections gracefully
- Return typed TypeScript object

Test: parse(existingFile) must return all fields correctly.
```
