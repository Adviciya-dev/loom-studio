import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

export type Platform = 'macos' | 'windows' | 'linux'

let cached: Platform | null = null

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(cached ?? 'macos')

  useEffect(() => {
    if (cached) return
    invoke<Platform>('get_platform')
      .then((p) => {
        cached = p
        setPlatform(p)
      })
      .catch(() => {})
  }, [])

  return platform
}
