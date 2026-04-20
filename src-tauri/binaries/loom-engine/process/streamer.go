package process

import (
	"bufio"
	"io"
	"strings"
	"sync"

	"github.com/loom/engine/ipc"
)

const stderrTailLines = 10

type Streamer struct {
	stdout io.Reader
	stderr io.Reader
}

func NewStreamer(stdout, stderr io.Reader) *Streamer {
	return &Streamer{stdout: stdout, stderr: stderr}
}

// Stream reads stdout and stderr concurrently, emitting log_line events for each line.
// Returns the last stderrTailLines lines of stderr for error reporting on non-zero exit.
func (s *Streamer) Stream(emitter *ipc.Emitter) string {
	var mu sync.Mutex
	var stderrBuf []string

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(s.stdout)
		for scanner.Scan() {
			emitter.EmitLogLine("stdout", scanner.Text())
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(s.stderr)
		for scanner.Scan() {
			line := scanner.Text()
			emitter.EmitLogLine("stderr", line)
			mu.Lock()
			stderrBuf = append(stderrBuf, line)
			if len(stderrBuf) > stderrTailLines {
				stderrBuf = stderrBuf[len(stderrBuf)-stderrTailLines:]
			}
			mu.Unlock()
		}
	}()

	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	return strings.Join(stderrBuf, "\n")
}
