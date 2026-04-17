# Prompt: Build Markdown Writer

```
Read these files first:
1. harness/claude.md
2. harness/tasks/TASK-004.md

Build a writer service that takes [ENTITY]Data JSON and writes [FILE].md.
- Use Handlebars template
- Register custom helpers: statusEmoji, checklist, endpointTable
- Write file atomically (temp file → rename)
- Empty fields render as '—'
- Ensure round-trip: parse(write(data)) === data

The output must be indistinguishable from a hand-written markdown file.
```
