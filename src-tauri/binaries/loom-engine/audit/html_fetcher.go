package audit

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
)

// ── Public types ──────────────────────────────────────────────────────────────

// HTMLData holds parsed HTML metadata for a page.
type HTMLData struct {
	URL             string
	FinalURL        string
	StatusCode      int
	Title           string
	MetaDescription string
	MetaKeywords    string
	H1              []string
	H2              []string
	CanonicalURL    string
	OpenGraph       OGData
	RawHTML         string
}

// OGData holds Open Graph meta tag values.
type OGData struct {
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	Type        string `json:"type,omitempty"`
}

// FetchError is a typed HTTP/network error with a user-facing message.
type FetchError struct {
	Message string
	Cause   error
}

func (e *FetchError) Error() string { return e.Message }
func (e *FetchError) Unwrap() error { return e.Cause }

// ── SharedHTMLResult ──────────────────────────────────────────────────────────

// SharedHTMLResult ensures FetchHTML is called exactly once and its result is
// available to any dimension that needs it (SEO + content).
type SharedHTMLResult struct {
	once sync.Once
	mu   sync.Mutex
	data *HTMLData
	err  error
}

// Get returns the HTMLData, fetching it on first call. Thread-safe.
func (s *SharedHTMLResult) Get(ctx context.Context, siteURL string) (*HTMLData, error) {
	s.once.Do(func() {
		data, err := FetchHTML(ctx, siteURL)
		s.mu.Lock()
		s.data, s.err = data, err
		s.mu.Unlock()
	})
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data, s.err
}

// ── FetchHTML ─────────────────────────────────────────────────────────────────

// FetchHTML performs an HTTP GET with a 30 s timeout and returns parsed HTMLData.
func FetchHTML(ctx context.Context, siteURL string) (*HTMLData, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, siteURL, nil)
	if err != nil {
		return nil, &FetchError{
			Message: fmt.Sprintf("Could not connect to %s. Check the URL and try again.", siteURL),
			Cause:   err,
		}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; LoomStudio/1.0; +https://loom.studio)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, &FetchError{
			Message: fmt.Sprintf("Could not connect to %s. Check the URL and try again.", siteURL),
			Cause:   err,
		}
	}
	defer resp.Body.Close()

	// Typed status errors.
	switch {
	case resp.StatusCode == 403 || resp.StatusCode == 407:
		return nil, &FetchError{Message: fmt.Sprintf("Site blocked automated access (%d). Manual review required.", resp.StatusCode)}
	case resp.StatusCode == 429:
		// Retry once after 5 s.
		resp.Body.Close()
		select {
		case <-time.After(5 * time.Second):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		resp2, err2 := client.Do(req.Clone(ctx))
		if err2 != nil {
			return nil, &FetchError{Message: "Rate limited (429). Try again later.", Cause: err2}
		}
		defer resp2.Body.Close()
		if resp2.StatusCode == 429 {
			return nil, &FetchError{Message: "Rate limited (429). Try again later."}
		}
		resp = resp2
	case resp.StatusCode >= 500:
		return nil, &FetchError{Message: fmt.Sprintf("Server error (%d). The site may be down.", resp.StatusCode)}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20)) // 2 MB cap
	if err != nil {
		return nil, &FetchError{
			Message: fmt.Sprintf("Request timed out after 30 s."),
			Cause:   err,
		}
	}

	rawHTML := string(body)
	finalURL := resp.Request.URL.String()

	data, parseErr := parseHTML(rawHTML)
	if parseErr != nil {
		// Parsing failure is non-fatal — return what we have with raw HTML.
		data = &HTMLData{}
	}
	data.URL = siteURL
	data.FinalURL = finalURL
	data.StatusCode = resp.StatusCode
	data.RawHTML = rawHTML
	return data, nil
}

// ── HTML parsing ──────────────────────────────────────────────────────────────

func parseHTML(rawHTML string) (*HTMLData, error) {
	doc, err := html.Parse(strings.NewReader(rawHTML))
	if err != nil {
		return nil, fmt.Errorf("parse HTML: %w", err)
	}
	data := &HTMLData{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch strings.ToLower(n.Data) {
			case "title":
				if data.Title == "" {
					data.Title = nodeText(n)
				}
			case "meta":
				applyMeta(n, data)
			case "link":
				applyLink(n, data)
			case "h1":
				if t := nodeText(n); t != "" {
					data.H1 = append(data.H1, t)
				}
			case "h2":
				if len(data.H2) < 5 {
					if t := nodeText(n); t != "" {
						data.H2 = append(data.H2, t)
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if data.H1 == nil {
		data.H1 = []string{}
	}
	if data.H2 == nil {
		data.H2 = []string{}
	}
	return data, nil
}

func nodeText(n *html.Node) string {
	var sb strings.Builder
	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.TextNode {
			sb.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(n)
	return strings.TrimSpace(sb.String())
}

func htmlAttr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, key) {
			return a.Val
		}
	}
	return ""
}

func applyMeta(n *html.Node, data *HTMLData) {
	name := strings.ToLower(htmlAttr(n, "name"))
	prop := strings.ToLower(htmlAttr(n, "property"))
	content := htmlAttr(n, "content")
	switch name {
	case "description":
		data.MetaDescription = content
	case "keywords":
		data.MetaKeywords = content
	}
	switch prop {
	case "og:title":
		data.OpenGraph.Title = content
	case "og:description":
		data.OpenGraph.Description = content
	case "og:image":
		data.OpenGraph.Image = content
	case "og:type":
		data.OpenGraph.Type = content
	}
}

func applyLink(n *html.Node, data *HTMLData) {
	if strings.EqualFold(htmlAttr(n, "rel"), "canonical") {
		data.CanonicalURL = htmlAttr(n, "href")
	}
}

