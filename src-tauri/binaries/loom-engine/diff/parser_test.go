package diff

import (
	"os"
	"testing"
)

func readFixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return string(b)
}

// ── Empty diff ────────────────────────────────────────────────────────────────

func TestParse_Empty(t *testing.T) {
	payload, err := Parse("", "sess-0")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(payload.Files) != 0 {
		t.Errorf("expected 0 files, got %d", len(payload.Files))
	}
	if payload.SessionID != "sess-0" {
		t.Errorf("session ID not propagated")
	}
}

func TestParse_Whitespace(t *testing.T) {
	payload, err := Parse("   \n\n  ", "sess-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(payload.Files) != 0 {
		t.Errorf("expected 0 files for whitespace input")
	}
}

// ── Add-only (new file) ───────────────────────────────────────────────────────

func TestParse_AddOnly(t *testing.T) {
	raw := readFixture(t, "add_only.diff")
	payload, err := Parse(raw, "sess-add")
	if err != nil {
		t.Fatal(err)
	}

	if len(payload.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(payload.Files))
	}
	f := payload.Files[0]

	if f.Name != "hello.go" {
		t.Errorf("name: got %q, want %q", f.Name, "hello.go")
	}
	if f.Added != 4 {
		t.Errorf("added: got %d, want 4", f.Added)
	}
	if f.Removed != 0 {
		t.Errorf("removed: got %d, want 0", f.Removed)
	}
	for _, l := range f.Lines {
		if l.Type != LineAdd {
			t.Errorf("expected all lines to be %q, got %q: %q", LineAdd, l.Type, l.Content)
		}
	}
}

// ── Remove-only (deleted file) ────────────────────────────────────────────────

func TestParse_RemoveOnly(t *testing.T) {
	raw := readFixture(t, "remove_only.diff")
	payload, err := Parse(raw, "sess-rem")
	if err != nil {
		t.Fatal(err)
	}

	if len(payload.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(payload.Files))
	}
	f := payload.Files[0]

	if f.Name != "hello.go" {
		t.Errorf("name: got %q, want %q", f.Name, "hello.go")
	}
	if f.Removed != 4 {
		t.Errorf("removed: got %d, want 4", f.Removed)
	}
	if f.Added != 0 {
		t.Errorf("added: got %d, want 0", f.Added)
	}
	for _, l := range f.Lines {
		if l.Type != LineRemove {
			t.Errorf("expected all lines to be %q, got %q: %q", LineRemove, l.Type, l.Content)
		}
	}
}

// ── Mixed changes + multi-file ────────────────────────────────────────────────

func TestParse_MixedMultifile(t *testing.T) {
	raw := readFixture(t, "mixed_multifile.diff")
	payload, err := Parse(raw, "sess-mix")
	if err != nil {
		t.Fatal(err)
	}

	if len(payload.Files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(payload.Files))
	}

	foo := payload.Files[0]
	if foo.Name != "foo.go" {
		t.Errorf("file[0] name: got %q, want %q", foo.Name, "foo.go")
	}
	if foo.Added != 1 {
		t.Errorf("foo.go added: got %d, want 1", foo.Added)
	}
	if foo.Removed != 1 {
		t.Errorf("foo.go removed: got %d, want 1", foo.Removed)
	}

	bar := payload.Files[1]
	if bar.Name != "bar.go" {
		t.Errorf("file[1] name: got %q, want %q", bar.Name, "bar.go")
	}
	if bar.Added != 3 {
		t.Errorf("bar.go added: got %d, want 3", bar.Added)
	}
	if bar.Removed != 0 {
		t.Errorf("bar.go removed: got %d, want 0", bar.Removed)
	}
}

// ── Line types ────────────────────────────────────────────────────────────────

func TestParse_LineTypes(t *testing.T) {
	raw := readFixture(t, "mixed_multifile.diff")
	payload, _ := Parse(raw, "")
	foo := payload.Files[0]

	typeSeq := make([]LineType, 0, len(foo.Lines))
	for _, l := range foo.Lines {
		typeSeq = append(typeSeq, l.Type)
	}

	// @@ -1,4 +1,4 @@ → context, context, remove, add
	want := []LineType{LineNeutral, LineNeutral, LineRemove, LineAdd}
	if len(typeSeq) != len(want) {
		t.Fatalf("line count: got %d, want %d", len(typeSeq), len(want))
	}
	for i, wt := range want {
		if typeSeq[i] != wt {
			t.Errorf("line[%d]: got %q, want %q (content=%q)", i, typeSeq[i], wt, foo.Lines[i].Content)
		}
	}
}

// ── Line numbers ──────────────────────────────────────────────────────────────

func TestParse_LineNumbers(t *testing.T) {
	raw := readFixture(t, "add_only.diff")
	payload, _ := Parse(raw, "")
	f := payload.Files[0]

	// @@ -0,0 +1,4 @@ → new-start = 1, lines are add at 1,2,3,4
	for i, l := range f.Lines {
		want := i + 1
		if l.LineNumber != want {
			t.Errorf("line[%d].LineNumber: got %d, want %d", i, l.LineNumber, want)
		}
	}
}

// ── SessionID propagation ─────────────────────────────────────────────────────

func TestParse_SessionID(t *testing.T) {
	payload, _ := Parse("", "my-session-42")
	if payload.SessionID != "my-session-42" {
		t.Errorf("session ID: got %q", payload.SessionID)
	}
}

// ── parseHunk ─────────────────────────────────────────────────────────────────

func TestParseHunk(t *testing.T) {
	cases := []struct {
		line     string
		wantOld  int
		wantNew  int
		wantErr  bool
	}{
		{"@@ -1,4 +1,5 @@", 1, 1, false},
		{"@@ -0,0 +1,3 @@", 0, 1, false},
		{"@@ -10,6 +10,7 @@ func foo()", 10, 10, false},
		{"@@ -1 +1 @@", 1, 1, false},
		{"not a hunk", 0, 0, true},
	}

	for _, tc := range cases {
		o, n, err := parseHunk(tc.line)
		if tc.wantErr {
			if err == nil {
				t.Errorf("%q: expected error, got nil", tc.line)
			}
			continue
		}
		if err != nil {
			t.Errorf("%q: unexpected error: %v", tc.line, err)
			continue
		}
		if o != tc.wantOld || n != tc.wantNew {
			t.Errorf("%q: got old=%d new=%d, want old=%d new=%d", tc.line, o, n, tc.wantOld, tc.wantNew)
		}
	}
}
