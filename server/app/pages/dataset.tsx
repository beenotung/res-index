import { o } from '../jsx/jsx.js'
import { ResolvedPageRoute, Routes } from '../routes.js'
import { apiEndpointTitle, config, title } from '../../config.js'
import Style from '../components/style.js'
import { Context, DynamicContext } from '../context.js'
import {
  NpmPackage,
  NpmPackageDependency,
  Page,
  Repo,
  proxy,
} from '../../../db/proxy.js'
import { db } from '../../../db/db.js'
import { find, clearCache } from 'better-sqlite3-proxy'
import { EarlyTerminate, toRouteUrl } from '../helpers.js'
import { binArray } from '@beenotung/tslib/array.js'
import { Timer, startTimer } from '@beenotung/tslib/timer.js'
import { later } from '@beenotung/tslib/async/wait.js'
import { ProgressCli } from '@beenotung/tslib/progress-cli.js'

let pageTitle = 'Dataset'
let addPageTitle = 'Add Dataset'

let style = Style(/* css */ `
#Dataset table {
  border-collapse: collapse;
  margin-top: 0.25rem;
  margin-bottom: 1rem;
}
#Dataset td,
#Dataset th {
  border: 1px solid black;
  padding: 0.25rem;
}
`)

let page = (
  <>
    {style}
    <div id="Dataset">
      <h1>{pageTitle}</h1>
      <Main />
    </div>
  </>
)

let items = [
  { title: 'Android', slug: 'md' },
  { title: 'iOS', slug: 'ios' },
]

let count_checked_repo = db
  .prepare<void[], number>(
    /* sql */ `
select count(*) from repo
inner join page on page.id = repo.page_id
where page.check_time is not null
`,
  )
  .pluck()

let count_checked_npm_package = db
  .prepare<void[], number>(
    /* sql */ `
with checked_page as (select id from page where check_time is not null)
select count(*) from npm_package
where npm_package.page_id in (select id from checked_page)
  and npm_package.download_page_id in (select id from checked_page)
  and npm_package.dependent_page_id in (select id from checked_page)
`,
  )
  .pluck()

function Main(attrs: {}, context: Context) {
  return (
    <>
      <div>Indexed Resources:</div>
      <table>
        <thead>
          <tr>
            <th>type</th>
            <th>checked</th>
            <th>total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>git repo</td>
            <td>{count_checked_repo.get()!.toLocaleString()}</td>
            <td>{proxy.repo.length.toLocaleString()}</td>
          </tr>
          <tr>
            <td>npm package</td>
            <td>{count_checked_npm_package.get()!.toLocaleString()}</td>
            <td>{proxy.npm_package.length.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
      <div>Resources to be indexed:</div>
      <ul>
        <li>pypi package</li>
        <li>composer package</li>
        <li>nuget package</li>
        <li>crates package</li>
      </ul>
    </>
  )
}

async function post_once(url: string, body: object) {
  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-API-Key': config.api_key.sync,
      'User-Agent': 'res-index dataset sync client',
    },
    body: JSON.stringify(body),
  })
  let text: string
  try {
    text = await res.text()
  } catch (error) {
    console.log('Network failure when POST ' + url)
    console.log(error)
    throw error
  }
  try {
    let json = JSON.parse(text)
    if (json.error) {
      throw new Error(json.error)
    }
    return json
  } catch (error) {
    console.log('Error: failed to parse response json')
    console.log('response status:', res.status)
    console.log('response text:')
    console.log(text)
    console.log()
    throw error
  }
}

async function post<Fn extends (input: any) => any>(
  url: string,
  body: Parameters<Fn>[0],
): Promise<ReturnType<Fn>> {
  let remote_origin = 'https://res-index.hkit.cc'
  // let remote_origin = 'http://localhost:8520'
  for (;;) {
    try {
      return await post_once(remote_origin + url, body)
    } catch (error) {
      // retry after some pause
      await later(5000)
    }
  }
}

let routes = {
  '/dataset': {
    title: title(pageTitle),
    description: 'TODO',
    menuText: pageTitle,
    node: page,
  },
  '/dataset/trim-table': {
    title: apiEndpointTitle,
    description: 'delete all rows to resolve unique conflict',
    streaming: false,
    resolve: context => brideToFn(context, sync_with_remote_v2.on_trim_table),
  },
  '/dataset/deleted-id-ranges': {
    title: apiEndpointTitle,
    description: 'upload deleted id ranges',
    streaming: false,
    resolve: context =>
      brideToFn(context, sync_with_remote_v2.on_receive_deleted_id_ranges),
  },
  '/dataset/last-updated_at': {
    title: apiEndpointTitle,
    description: 'get last updated_at',
    streaming: false,
    resolve: context =>
      brideToFn(context, sync_with_remote_v2.on_get_last_updated_at),
  },
  '/dataset/updated-rows': {
    title: apiEndpointTitle,
    description: 'upload updated rows',
    streaming: false,
    resolve: context =>
      brideToFn(context, sync_with_remote_v2.on_receive_updated_rows),
  },
  '/dataset/last-row-id': {
    title: apiEndpointTitle,
    description: 'get last row id',
    streaming: false,
    resolve: context =>
      brideToFn(context, sync_with_remote_v2.on_get_last_row_id),
  },
} satisfies Routes

function brideToFn<Fn extends (input: any) => any>(
  context: DynamicContext,
  fn: Fn,
): ResolvedPageRoute {
  if (context.type != 'express') {
    throw new Error('unsupported context type: ' + context.type)
  }
  if (context.req.headers['x-sync-api-key'] != config.api_key.sync) {
    throw new Error('invalid SYNC_API_KEY')
  }
  let json = fn(context.req.body)
  context.res.json(json)
  clearCache(proxy)
  throw EarlyTerminate
}

namespace sync_with_remote_v2 {
  type IDRange = [start: number, end: number]
  type Table = keyof typeof proxy
  export async function main() {
    let tables_atom_first: Table[] = [
      'page',
      'programming_language',
      'author',
      'domain',
      'repo',
      'keyword',
      'repo_keyword',
      'npm_package',
      'npm_package_keyword',
      'npm_package_dependency',
    ]
    let tables_atom_last = tables_atom_first.slice().reverse()
    let n = tables_atom_first.length

    let cli = new ProgressCli()

    async function trim_table(i: number, table: Table) {
      cli.update(`trim_table (${i}/${n}) ${table}`)
      await post<typeof on_trim_table>(
        toRouteUrl(routes, '/dataset/trim-table'),
        { table },
      )
      cli.nextLine()
    }
    async function delete_removed_data(i: number, table: Table) {
      // 1. local find deleted id ranges
      // 2. remote delete the id ranges
      let rows = proxy[table].length
      cli.update(
        `delete_removed_data (${i}/${n}) ${table}: local selecting (total ${rows} rows)...`,
      )
      let { ranges, total } = select_deleted_id_ranges(table)
      cli.update(
        `delete_removed_data (${i}/${n}) ${table}: remote deleting ${total} rows...`,
      )
      let result = await post<typeof on_receive_deleted_id_ranges>(
        toRouteUrl(routes, '/dataset/deleted-id-ranges'),
        { table, deleted_id_ranges: ranges },
      )
      cli.update(
        `delete_removed_data (${i}/${n}) ${table}: remote deleted ${result.deleted} rows`,
      )
      cli.nextLine()
    }
    async function upload_updated_data(i: number, table: Table) {
      // 1. remote find last updated_at
      // 2. local select rows with updated_at >= server's max value
      // 3. remote update the rows
      cli.update(
        `upload_updated_data (${i}/${n}) ${table}: remote selecting last updated_at...`,
      )
      let result = await post<typeof on_get_last_updated_at>(
        toRouteUrl(routes, '/dataset/last-updated_at'),
        { table },
      )
      if (result.last_updated_at == 'none') {
        cli.update(`upload_updated_data (${i}/${n}) ${table}: skip`)
        cli.nextLine()
        return
      }
      cli.update(
        `upload_updated_data (${i}/${n}) ${table}: local select updated rows (since ${result.last_updated_at}) ...`,
      )
      let { count, iter } = select_updated_rows(table, result.last_updated_at)
      cli.update(
        `upload_updated_data (${i}/${n}) ${table}: uploading ${count} updated rows ...`,
      )
      let done = 0
      let failed = 0
      await upload_rows(iter, async buffer => {
        cli.update(
          `upload_updated_data (${i}/${n}) ${table}: uploading ${done + failed + buffer.length}/${count} updated rows (${failed} failed)...`,
        )
        let result = await post<typeof on_receive_updated_rows>(
          toRouteUrl(routes, '/dataset/updated-rows'),
          { table, rows: buffer },
        )
        done += result.updated
        failed += result.failed
      })
      cli.update(
        `upload_updated_data (${i}/${n}) ${table}: uploaded ${done} updated rows, failed ${failed} rows`,
      )
      cli.nextLine()
    }
    async function upload_new_data(i: number, table: Table) {
      // 1. remote find last id
      // 2. local select new rows
      // 3. remote insert new rows
      cli.update(
        `upload_new_data (${i}/${n}) ${table}: remote selecting last row id...`,
      )
      let result = await post<typeof on_get_last_row_id>(
        toRouteUrl(routes, '/dataset/last-row-id'),
        { table },
      )
      cli.update(
        `upload_new_data (${i}/${n}) ${table}: local selecting new rows after id=${result.last_id}...`,
      )
      let { count, iter } = select_new_rows(table, result.last_id)
      cli.update(
        `upload_new_data (${i}/${n}) ${table}: uploading ${count} new rows...`,
      )
      let done = 0
      let failed = 0
      await upload_rows(iter, async buffer => {
        cli.update(
          `upload_new_data (${i}/${n}) ${table}: uploading ${done + failed + buffer.length}/${count} new rows (${failed} failed)...`,
        )
        let result = await post<typeof on_receive_updated_rows>(
          toRouteUrl(routes, '/dataset/updated-rows'),
          { table, rows: buffer },
        )
        done += result.updated
        failed += result.failed
      })
      cli.update(
        `upload_new_data (${i}/${n}) ${table}: uploaded ${done} new rows, failed ${failed} rows`,
      )
      cli.nextLine()
    }

    /* helper functions */
    function select_deleted_id_ranges(table: string) {
      let ranges: IDRange[] = []
      let total = 0
      let rows = db
        .prepare<void[], number>(
          /* sql */ `
    select id
    from "${table}"
    order by id asc
    `,
        )
        .pluck()
        .iterate()
      let last = 0
      for (let id of rows) {
        if (last == 0) {
          last = id
          continue
        }
        if (id == last + 1) {
          last = id
          continue
        }
        ranges.push([last + 1, id - 1])
        total += id - last + 1
        last = id
      }
      return { ranges, total }
    }
    function select_updated_rows(table: string, last_updated_at: string) {
      let count =
        db
          .prepare<{ last_updated_at: string }, number>(
            /* sql */ `
      select count(*) from "${table}" where updated_at >= :last_updated_at
      `,
          )
          .get({ last_updated_at }) || 0
      let iter = db
        .prepare<{ last_updated_at: string }, { id: number }>(
          /* sql */ `
      select * from "${table}" where updated_at >= :last_updated_at
      `,
        )
        .iterate({ last_updated_at })
      return { count, iter }
    }
    function select_new_rows(table: string, last_id: number) {
      let count =
        db
          .prepare<{ last_id: number }, number>(
            /* sql */ `
      select count(*) from "${table}" where id > :last_id
      `,
          )
          .pluck()
          .get({ last_id }) || 0
      let iter = db
        .prepare<{ last_id: number }, { id: number }>(
          /* sql */ `
      select * from "${table}" where id > :last_id
      `,
        )
        .iterate({ last_id })
      return { count, iter }
    }
    async function upload_rows<T>(
      rows: Iterable<T>,
      sendFn: (buffer: T[]) => Promise<void>,
    ) {
      let max_size = 1024 * 1024
      let max_length = 2000
      let buffer: T[] = []
      for (let row of rows) {
        delete (row as any).payload
        buffer.push(row)

        if (buffer.length >= max_length) {
          await sendFn(buffer)
          buffer = []
          continue
        }

        let size = JSON.stringify(buffer).length
        if (size >= max_size) {
          await sendFn(buffer)
          buffer = []
          continue
        }
      }
      if (buffer.length > 0) {
        await sendFn(buffer)
      }
    }

    /* main flow */
    let i = 0
    for (let table of tables_atom_last) {
      i++
      // await trim_table(i, table)
      await delete_removed_data(i, table)
    }
    i = 0
    for (let table of tables_atom_first) {
      i++
      await upload_updated_data(i, table)
      await upload_new_data(i, table)
    }
  }

  /* for trim_table() */
  export function on_trim_table(body: { table: string }) {
    db.prepare(
      /* sql */ `
    delete from "${body.table}"
    `,
    ).run()
    return {}
  }

  /* for delete_removed_data() */
  export function on_receive_deleted_id_ranges(body: {
    table: string
    deleted_id_ranges: IDRange[]
  }) {
    let del = db.prepare(/* sql */ `
    delete from "${body.table}" where id between :start and :end
    `)
    let deleted = 0
    for (let [start, end] of body.deleted_id_ranges) {
      try {
        deleted += del.run({ start, end }).changes
      } catch (error) {
        if (String(error).includes('FOREIGN KEY constraint failed')) {
          continue
        }
        throw error
      }
    }
    return { deleted }
  }

  /* for upload_updated_data() */
  export function on_get_last_updated_at(body: { table: string }) {
    try {
      let last_updated_at = db
        .prepare(
          /* sql */ `
    select max(updated_at) from "${body.table}"
    `,
        )
        .pluck()
        .get() as string
      return { last_updated_at }
    } catch (error) {
      if (String(error).includes('no such column: updated_at')) {
        return { last_updated_at: 'none' }
      }
      throw error
    }
  }
  export function on_receive_updated_rows(body: {
    table: keyof typeof proxy
    rows: { id: number }[]
  }) {
    let updated = 0
    let failed = 0
    db.transaction(() => {
      let table = proxy[body.table]
      for (let row of body.rows) {
        try {
          table[row.id] = row as any
          updated++
        } catch (error) {
          failed++
          if (String(error).includes('FOREIGN KEY constraint failed')) {
            continue
          }
          throw error
        }
      }
      clearCache(proxy)
    })()
    return { updated, failed }
  }

  /* for upload_new_data() */
  export function on_get_last_row_id(body: { table: keyof typeof proxy }) {
    let last_id = db
      .prepare(
        /* sql */ `
    select max(id) from "${body.table}"
    `,
      )
      .pluck()
      .get() as number
    return { last_id: last_id || 0 }
  }
}

if (import.meta.filename == process.argv[1]) {
  await sync_with_remote_v2.main()
}

export default { routes }
