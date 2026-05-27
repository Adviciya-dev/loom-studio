/**
 * Global drop-zone registry for the custom mouse-event drag system.
 *
 * Components register themselves here on mount; HarnessManager's drag
 * handlers call updateHover() on every mousemove and tryDrop() on mouseup.
 * This lets components outside HarnessManager's React tree (e.g. Terminal
 * in LogPanel) participate as drop targets.
 */

export interface DropZone {
  /** Return the current bounding rect of the zone, or null if not mounted. */
  getRect: () => DOMRect | null
  /** Called when a dragged file is released over this zone. */
  onDrop: (path: string) => void
  /** Called when the drag cursor enters or leaves the zone. */
  onHover?: (isOver: boolean) => void
}

const zones = new Map<string, DropZone>()
let lastHoveredId: string | null = null

/**
 * Register a drop zone by a unique id.
 * Returns an unregister function — call it in a cleanup effect.
 */
export function registerDropZone(id: string, zone: DropZone): () => void {
  zones.set(id, zone)
  return () => {
    if (lastHoveredId === id) {
      zone.onHover?.(false)
      lastHoveredId = null
    }
    zones.delete(id)
  }
}

/**
 * Call on every mousemove while a drag is active.
 * Updates hover highlights across all registered zones.
 */
export function updateHover(x: number, y: number): void {
  let hoveredId: string | null = null
  for (const [id, zone] of zones.entries()) {
    const rect = zone.getRect()
    if (!rect) continue
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      hoveredId = id
      break
    }
  }
  if (hoveredId !== lastHoveredId) {
    if (lastHoveredId) zones.get(lastHoveredId)?.onHover?.(false)
    if (hoveredId) zones.get(hoveredId)?.onHover?.(true)
    lastHoveredId = hoveredId
  }
}

/**
 * Call on mouseup to attempt a drop.
 * Returns true if a zone accepted the drop.
 * Always clears hover state afterwards.
 */
export function tryDrop(path: string, x: number, y: number): boolean {
  // Prefer the currently-tracked hovered zone
  if (lastHoveredId) {
    const zone = zones.get(lastHoveredId)
    if (zone) {
      const rect = zone.getRect()
      if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        zone.onHover?.(false)
        lastHoveredId = null
        zone.onDrop(path)
        return true
      }
    }
  }
  // Fallback scan in case hover tracking missed the zone
  for (const [, zone] of zones.entries()) {
    const rect = zone.getRect()
    if (!rect) continue
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      resetHover()
      zone.onDrop(path)
      return true
    }
  }
  resetHover()
  return false
}

/** Clear hover state — call when drag ends without a valid drop. */
export function resetHover(): void {
  if (lastHoveredId) {
    zones.get(lastHoveredId)?.onHover?.(false)
    lastHoveredId = null
  }
}
