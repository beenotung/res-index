import { db } from '../../db/db.js'
import { Statement } from 'better-sqlite3'

const max_size = 100

export type CacheItem = {
  key: string
  value: any
  used_time: number
}

export class QueryCache {
  private items: CacheItem[] = []
  private key_index: Record<string, number> = {}

  get(key: string) {
    if (key in this.key_index) {
      let index = this.key_index[key]
      let item = this.items[index]
      return item.value
    }
    return null
  }

  set(item: CacheItem) {
    let index = this.pick_slot()
    this.items[index] = item
    this.key_index[item.key] = index
  }

  private pick_slot(): number {
    let { items } = this
    if (items.length < max_size) {
      return items.length
    }
    let min_index = 0
    let min_time = items[0].used_time
    for (let i = 1; i < max_size; i++) {
      let item = items[i]
      let key = item.key
      if (key.includes('{}') || key.includes('beeno')) {
        // always cache hot queries
        continue
      }
      if (item.used_time < min_time) {
        min_time = item.used_time
        min_index = i
      }
    }
    let key = items[min_index].key
    delete this.key_index[key]
    return min_index
  }

  clear() {
    this.items = []
    this.key_index = {}
  }
}

export class SQLCache {
  private items: string[] = []

  getIndex(sql: string) {
    let { items } = this
    let index = items.indexOf(sql)
    if (index == -1) {
      index = items.push(sql) - 1
    }
    return index
  }

  clear() {
    this.items = []
  }
}

export class PreparedStatementCache {
  private cache = new Map<string, Statement>()

  get<BindParameters extends unknown[] | {} = unknown[], Result = unknown>(
    sql: string,
  ): Statement<BindParameters, Result> {
    let statement = this.cache.get(sql)
    if (!statement) {
      statement = db.prepare(sql)
      this.cache.set(sql, statement)
    }
    return statement as Statement<BindParameters, Result>
  }
}

export let query_cache = new QueryCache()
export let sql_cache = new SQLCache()
export let prepared_statement_cache = new PreparedStatementCache()
