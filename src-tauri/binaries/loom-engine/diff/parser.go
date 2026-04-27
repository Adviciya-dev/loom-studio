package diff

import (
	"fmt"
	"strconv"
	"strings"
)

// Parse converts a unified diff string into a structured DiffPayload.
// Returns an empty payload (no error) when raw is empty or whitespace-only.
func Parse(raw, sessionID string) (DiffPayload, error) {
	payload := DiffPayload{SessionID: sessionID, Files: []DiffFile{}}
	if strings.TrimSpace(raw) == "" {
		return payload, nil
	}

	lines := strings.Split(raw, "\n")
	var cur *DiffFile
	var oldLine, newLine int
	var pendingOldName string // used when +++ is /dev/null (deleted file)

	flush := func() {
		if cur != nil {
			payload.Files = append(payload.Files, *cur)
			cur = nil
		}
	}

	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "diff "):
			flush()
			cur = &DiffFile{Lines: []DiffLine{}}
			oldLine, newLine = 0, 0
			pendingOldName = ""

		case strings.HasPrefix(line, "--- "):
			if cur == nil {
				continue
			}
			// Store name from old file in case new file is /dev/null.
			name := strings.TrimPrefix(line, "--- a/")
			name = strings.TrimPrefix(name, "--- ")
			pendingOldName = name

		case strings.HasPrefix(line, "+++ "):
			if cur == nil {
				continue
			}
			name := strings.TrimPrefix(line, "+++ b/")
			name = strings.TrimPrefix(name, "+++ ")
			if name == "/dev/null" {
				// deleted file — use the old file name
				cur.Name = pendingOldName
			} else {
				cur.Name = name
			}

		case strings.HasPrefix(line, "@@ "):
			o, n, err := parseHunk(line)
			if err != nil {
				continue
			}
			oldLine, newLine = o, n

		case strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++"):
			if cur == nil {
				continue
			}
			cur.Lines = append(cur.Lines, DiffLine{
				LineNumber: newLine,
				Type:       LineAdd,
				Content:    line[1:],
			})
			cur.Added++
			newLine++

		case strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---"):
			if cur == nil {
				continue
			}
			cur.Lines = append(cur.Lines, DiffLine{
				LineNumber: oldLine,
				Type:       LineRemove,
				Content:    line[1:],
			})
			cur.Removed++
			oldLine++

		case strings.HasPrefix(line, " "):
			if cur == nil {
				continue
			}
			cur.Lines = append(cur.Lines, DiffLine{
				LineNumber: newLine,
				Type:       LineNeutral,
				Content:    line[1:],
			})
			oldLine++
			newLine++

		// Skip "\ No newline at end of file" and other meta lines.
		}
	}

	flush()
	return payload, nil
}

// parseHunk extracts the old and new start line numbers from a unified diff
// hunk header of the form "@@ -oldStart[,oldCount] +newStart[,newCount] @@".
func parseHunk(line string) (oldStart, newStart int, err error) {
	inner := strings.TrimPrefix(line, "@@ ")
	if end := strings.Index(inner, " @@"); end >= 0 {
		inner = inner[:end]
	}

	parts := strings.Fields(inner)
	if len(parts) < 2 {
		return 0, 0, fmt.Errorf("malformed hunk header: %q", line)
	}

	parseStart := func(s string) (int, error) {
		s = strings.TrimPrefix(s, "-")
		s = strings.TrimPrefix(s, "+")
		if i := strings.Index(s, ","); i >= 0 {
			s = s[:i]
		}
		return strconv.Atoi(s)
	}

	o, err := parseStart(parts[0])
	if err != nil {
		return 0, 0, fmt.Errorf("bad old-start in %q: %w", line, err)
	}
	n, err := parseStart(parts[1])
	if err != nil {
		return 0, 0, fmt.Errorf("bad new-start in %q: %w", line, err)
	}
	return o, n, nil
}
