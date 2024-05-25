import { find } from 'better-sqlite3-proxy'
import { proxy } from './proxy'

export function getLanguageId(name: string | null): number | null {
  if (!name) return null
  switch (name) {
    case 'TypeScript':
      name = 'Typescript'
      break
    case 'JavaScript':
      name = 'Javascript'
      break
  }
  return (
    find(proxy.programming_language, { name })?.id ||
    proxy.programming_language.push({ name })
  )
}
