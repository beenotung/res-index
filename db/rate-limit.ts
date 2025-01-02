import { sleep } from '@beenotung/tslib/async/wait'
import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import { GracefulPage } from 'graceful-playwright'
import { proxy } from './proxy'
import { db } from './db'
import { standard_score } from '@beenotung/tslib/array'
import { mean, median, standard_deviation } from '@beenotung/tslib/array'
import { max } from '@beenotung/tslib/array'
import { min } from '@beenotung/tslib/array'

export function create_rate_limiter(name: string) {
  let last_fetch_time = 0
  let fetch_interval = 1000

  async function wait_for_next_fetch() {
    let now = Date.now()
    let passed_time = now - last_fetch_time
    if (passed_time < fetch_interval) {
      await sleep(fetch_interval - passed_time)
    }
    last_fetch_time = Date.now()
  }

  let default_retry_seconds = 60

  let retry_seconds = default_retry_seconds

  function increase_retry_seconds() {
    retry_seconds *= 2
  }

  let last_attempt = 0

  function init() {
    retry_seconds = default_retry_seconds
    last_attempt = 0
  }

  async function wait_for_retry(headers: Headers) {
    let retry_after = +headers.get('Retry-After')!
    if (retry_after) {
      console.log(
        '\n' + `rate limited by ${name}, retry after ${retry_after} seconds`,
      )
      await sleep(retry_after * 1000)
    } else {
      console.log(
        '\n' + `rate limited by ${name}, sleep ${retry_seconds} seconds`,
      )
      await sleep(retry_seconds * 1000)
      increase_retry_seconds()
    }
  }

  function log_api_call(url: string) {
    appendFileSync('log.txt', url + '\n')
    let start_time = Date.now()
    let id = proxy.collect_api_log.push({
      url,
      status: null,
      start_time,
      end_time: null,
    })
    function log_response(status: number) {
      let end_time = Date.now()
      let row = proxy.collect_api_log[id]
      row.end_time = end_time
      row.status = status
    }
    return db.transaction(log_response)
  }

  async function fetch_safe(url: string) {
    // return fetch_retry(url, 3)
    await wait_for_next_fetch()
    init()
    for (;;) {
      last_attempt++
      let log_response = log_api_call(url)
      let res = await fetch(url)
      log_response(res.status)
      if (res.status === 429) {
        // 429 Too Many Requests
        await wait_for_retry(res.headers)
        continue
      }
      return res
    }
  }

  async function goto_safe(page: GracefulPage, url: string) {
    await wait_for_next_fetch()
    init()
    for (;;) {
      last_attempt++
      let log_response = log_api_call(url)
      let res = await page.goto(url)
      if (!res) return res
      let status = res.status()
      log_response(status)
      if (status == 429) {
        // 429 Too Many Requests
        await wait_for_retry(new Headers(res.headers()))
        continue
      }
      return res
    }
  }

  return {
    fetch_safe,
    goto_safe,
    get was_rate_limited() {
      return last_attempt > 1
    },
  }
}

let select_duration = db
  .prepare<void[], number>(
    /* sql */ `
select
  end_time - start_time as duration
from collect_api_log
where end_time is not null
order by id asc
`,
  )
  .pluck()

let select_end = db
  .prepare<number, number | null>(
    /* sql */ `
select id from collect_api_log
where status = 429
  and id > ?
order by id asc
limit 1
`,
  )
  .pluck()

let select_start = db
  .prepare<void[], number | null>(
    /* sql */ `
select min(id) from collect_api_log
where status <> 429
`,
  )
  .pluck()

async function analysis() {
  let ts = select_duration.all()

  console.log({
    count: ts.length,
    min: min(ts),
    max: max(ts),
    mean: mean(ts),
    median: median(ts),
    std: standard_deviation(ts),
  })

  mkdirSync('res', { recursive: true })
  writeFileSync('res/z-score.txt', standard_score(ts).join('\n'))
  writeFileSync('res/timestamps.txt', ts.join('\n'))
  console.log('saved to res/')

  for (let start = select_start.get(); ; ) {
    if (!start) break
    let end = select_end.get(start)
    if (!end) break
    let start_time = proxy.collect_api_log[start].start_time
    let end_time = proxy.collect_api_log[end].start_time
    let count = end - start + 1
    let duration = (end_time - start_time) / 1000
    console.log({ start, start_time, count, duration })
    start = end + 1
  }
}
// analysis().catch(e => console.error(e))
