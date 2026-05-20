package cqc

func ListLog(projectPath string, limit int) ([]LogEntry, error) {
	entries, err := readLog(projectPath)
	if err != nil {
		return nil, err
	}
	// entries are newest-first; cap at limit
	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}
	return entries, nil
}

func AppendLog(projectPath string, entry LogEntry) error {
	entries, err := readLog(projectPath)
	if err != nil {
		return err
	}
	// Prepend so newest is always first
	entries = append([]LogEntry{entry}, entries...)
	// Cap at 1000 entries
	if len(entries) > 1000 {
		entries = entries[:1000]
	}
	return writeLog(projectPath, entries)
}
