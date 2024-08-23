import { createHash } from 'crypto'

export function hashString(text: string): string {
  let hash = createHash('sha256')
  hash.write(text)
  return hash.digest().toString('hex')
}

export function hashJSON(json: object): string {
  return hashString(JSON.stringify(json))
}
