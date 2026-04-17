#!/bin/bash
# Update progress.json by scanning task files
# Usage: bash scripts/update-progress.sh

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TASKS_DIR="$HARNESS_DIR/tasks"
BUGS_DIR="$HARNESS_DIR/bugs"

TOTAL_TASKS=$(ls "$TASKS_DIR"/TASK-*.md 2>/dev/null | wc -l)
DONE_TASKS=$(grep -l "Done" "$TASKS_DIR"/TASK-*.md 2>/dev/null | wc -l)
IN_PROGRESS=$(grep -l "In Progress" "$TASKS_DIR"/TASK-*.md 2>/dev/null | wc -l)
BLOCKED=$(grep -l "Blocked" "$TASKS_DIR"/TASK-*.md 2>/dev/null | wc -l)

TOTAL_BUGS=$(ls "$BUGS_DIR"/BUG-*.md 2>/dev/null | wc -l)
OPEN_BUGS=$(grep -l "Open" "$BUGS_DIR"/BUG-*.md 2>/dev/null | wc -l)

if [ "$TOTAL_TASKS" -gt 0 ]; then
  PROGRESS=$((DONE_TASKS * 100 / TOTAL_TASKS))
else
  PROGRESS=0
fi

cat > "$HARNESS_DIR/progress.json" << EOF
{
  "lastUpdated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sprint": "Sprint 1",
  "progress": $PROGRESS,
  "tasks": {
    "total": $TOTAL_TASKS,
    "done": $DONE_TASKS,
    "inProgress": $IN_PROGRESS,
    "blocked": $BLOCKED
  },
  "bugs": {
    "total": $TOTAL_BUGS,
    "open": $OPEN_BUGS
  }
}
EOF

echo "Updated progress.json — $PROGRESS% complete ($DONE_TASKS/$TOTAL_TASKS tasks done)"
