import { DBInstance, newDB } from 'better-sqlite3-schema'
import { existsSync } from 'fs'
import { join } from 'path'

function getDataDir(): string {
  let dir = 'data'
  if (!existsSync(dir)) dir = join('..', dir)
  if (existsSync(dir)) return dir
  throw new Error('Could not find data directory')
}

export let dataDir = getDataDir()

export let dbFile = join(dataDir, 'db.sqlite3')

export let db: DBInstance = newDB({
  path: dbFile,
  migrate: false,
  fileMustExist: true,
  WAL: true,
  synchronous: 'NORMAL',
})

// Set a higher threshold for auto-checkpoints to reduce frequency of flushing from WAL to main file
db.pragma('wal_autocheckpoint = 1000')

// try around 100MB to 200MB
// 250MB cache
db.pragma('cache_size = -250000')

// use memory instead of disk for temporary table during join table
db.pragma('temp_store = MEMORY')

db.function('reverse', function (input: string | null) {
  if (input == null) {
    return null
  }
  return input.split('').reverse().join('')
})
