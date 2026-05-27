/**
 * Module-level singleton that holds the currently-dragged file path.
 * Tauri's WKWebView does not reliably round-trip custom MIME types through
 * dataTransfer.getData(), so we bypass it with a plain JS variable.
 */
export let draggedFilePath: string | null = null

export function setDraggedFilePath(path: string | null) {
  draggedFilePath = path
}
