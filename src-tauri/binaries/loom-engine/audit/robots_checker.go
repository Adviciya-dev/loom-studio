package audit

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Data types ────────────────────────────────────────────────────────────────

type robotsTxtData struct {
	Found           bool     `json:"found"`
	DisallowedPaths []string `json:"disallowedPaths"`
}

type sitemapData struct {
	Found    bool `json:"found"`
	URLCount int  `json:"urlCount"`
}

// ── RunRobotsChecks ───────────────────────────────────────────────────────────

// RunRobotsChecks fetches robots.txt and resolves the sitemap.
// Non-fatal: errors set found=false rather than returning a hard error.
func RunRobotsChecks(ctx context.Context, siteURL string, emit EmitFn) (robotsTxtData, sitemapData, error) {
	emitAuditLog(emit, "INFO", "[robots] Fetching robots.txt…")

	robotsURL := strings.TrimRight(siteURL, "/") + "/robots.txt"
	body, ok := fetchText(ctx, robotsURL)
	if !ok {
		emitAuditLog(emit, "INFO", "[robots] robots.txt not found")
		// Try to find sitemap at default locations anyway.
		sm := resolveSitemap(ctx, siteURL, nil, emit)
		return robotsTxtData{Found: false, DisallowedPaths: []string{}}, sm, nil
	}

	disallowed, sitemapURLs := parseRobotsTxt(body)
	emitAuditLog(emit, "INFO", fmt.Sprintf("[robots] Parsed robots.txt (%d disallow rules, %d sitemaps)", len(disallowed), len(sitemapURLs)))

	robots := robotsTxtData{Found: true, DisallowedPaths: disallowed}
	if robots.DisallowedPaths == nil {
		robots.DisallowedPaths = []string{}
	}

	sm := resolveSitemap(ctx, siteURL, sitemapURLs, emit)
	return robots, sm, nil
}

// ── robots.txt parser ─────────────────────────────────────────────────────────

// parseRobotsTxt extracts Disallow directives for User-agent: * and Sitemap directives.
func parseRobotsTxt(body string) (disallowed []string, sitemaps []string) {
	inStarBlock := false
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "user-agent:") {
			agent := strings.TrimSpace(line[len("user-agent:"):])
			inStarBlock = agent == "*"
			continue
		}
		if strings.HasPrefix(lower, "sitemap:") {
			url := strings.TrimSpace(line[len("sitemap:"):])
			if url != "" {
				sitemaps = append(sitemaps, url)
			}
			continue
		}
		if inStarBlock && strings.HasPrefix(lower, "disallow:") {
			path := strings.TrimSpace(line[len("disallow:"):])
			if path != "" {
				disallowed = append(disallowed, path)
			}
		}
	}
	return
}

// ── Sitemap resolver ──────────────────────────────────────────────────────────

// resolveSitemap finds and counts URLs in the first reachable sitemap.
func resolveSitemap(ctx context.Context, siteURL string, declared []string, emit EmitFn) sitemapData {
	base := strings.TrimRight(siteURL, "/")

	// Build candidate list: declared sitemaps first, then defaults.
	candidates := append([]string(nil), declared...)
	candidates = append(candidates,
		base+"/sitemap.xml",
		base+"/sitemap_index.xml",
	)

	for _, u := range candidates {
		body, ok := fetchText(ctx, u)
		if !ok {
			continue
		}
		count := countSitemapEntries(body)
		emitAuditLog(emit, "INFO", fmt.Sprintf("[robots] Sitemap found at %s (%d entries)", u, count))
		return sitemapData{Found: true, URLCount: count}
	}

	emitAuditLog(emit, "INFO", "[robots] No sitemap found")
	return sitemapData{Found: false, URLCount: 0}
}

// countSitemapEntries counts <url> and <sitemap> elements in sitemap XML.
func countSitemapEntries(body string) int {
	return strings.Count(body, "<url>") + strings.Count(body, "<sitemap>")
}

// ── HTTP text fetcher ─────────────────────────────────────────────────────────

// fetchText makes a GET request and returns the body as a string.
// Returns (body, true) on HTTP 200; ("", false) on any error or non-200 status.
func fetchText(ctx context.Context, url string) (string, bool) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", false
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; LoomStudio/1.0)")
	resp, err := client.Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB cap
	if err != nil {
		return "", false
	}
	return string(body), true
}
