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
import { find } from 'better-sqlite3-proxy'
import { EarlyTerminate, toRouteUrl } from '../helpers.js'
import { binArray } from '@beenotung/tslib/array.js'

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
select count(*) from npm_package
inner join page as npm_page on npm_page.id = npm_package.page_id
inner join page as download_page on download_page.id = npm_package.download_page_id
inner join page as dependent_page on dependent_page.id = npm_package.dependent_page_id
where npm_page.check_time is not null
  and download_page.check_time is not null
  and dependent_page.check_time is not null
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

function exportPage(url: string) {}

let select_repo_by_url = db.prepare<{ url: string }, Repo>(/* sql */ `
select * from repo where url = :url
`)

let select_npm_package_by_name = db.prepare<
  { name: string },
  NpmPackage
>(/* sql */ `
select * from npm_package where name = :name
`)

type RepoExport = ReturnType<typeof export_repo>
function export_repo(url: string) {
  let repo = select_repo_by_url.get({ url })!
  return {
    id: repo.id,
    domain: proxy.domain[repo.domain_id].host,
    author: proxy.author[repo.author_id].username,
    name: repo.name,
    is_fork: repo.is_fork,
    url: repo.url,
    desc: repo.desc,
    programming_language: repo.programming_language_id
      ? proxy.programming_language[repo.programming_language_id].name
      : null,
    website: repo.website,
    stars: repo.stars,
    watchers: repo.watchers,
    forks: repo.forks,
    readme: repo.readme,
    last_commit: repo.last_commit,
    is_public: repo.is_public,
    page: select_page.get({ id: repo.page_id })!,
    keywords: select_repo_keywords.all({ repo_id: repo.id! }),
  }
}

let select_repo_keywords = db
  .prepare<{ repo_id: number }, string>(
    /* sql */ `
select keyword.name
from keyword
inner join repo_keyword on repo_keyword.keyword_id = keyword.id
where repo_keyword.repo_id = :repo_id
`,
  )
  .pluck()

let select_npm_package_keywords = db
  .prepare<{ npm_package_id: number }, string>(
    /* sql */ `
select keyword.name
from keyword
inner join npm_package_keyword on npm_package_keyword.keyword_id = keyword.id
where npm_package_keyword.npm_package_id = :npm_package_id
`,
  )
  .pluck()

let select_page = db.prepare<
  { id: number },
  Pick<Page, 'id' | 'url' | 'check_time' | 'update_time'>
>(/* sql */ `
select id, url, check_time, update_time
from page where id = :id
`)

let select_npm_deps = db.prepare<
  { package_id: number },
  Pick<NpmPackageDependency, 'type'> & { name: string }
>(/* sql */ `
select
  npm_package.name
, npm_package_dependency.type
from npm_package_dependency
inner join npm_package on npm_package.id = npm_package_dependency.dependency_id
where npm_package_dependency.package_id = :package_id
`)

type NpmPackageExport = ReturnType<typeof export_npm_package>
function export_npm_package(name: string) {
  let pkg = select_npm_package_by_name.get({ name })
  if (!pkg) {
    throw new Error('package not found: ' + name)
  }
  return {
    id: pkg.id,
    author: pkg.author_id ? proxy.author[pkg.author_id].username : null,
    name: pkg.name,
    version: pkg.version,
    desc: pkg.desc,
    create_time: pkg.create_time,
    last_publish_time: pkg.last_publish_time,
    unpublish_time: pkg.unpublish_time,
    weekly_downloads: pkg.weekly_downloads,
    unpacked_size: pkg.unpacked_size,
    file_count: pkg.file_count,
    repository: pkg.repository,
    repo: pkg.repo_id ? export_repo(proxy.repo[pkg.repo_id].url) : null,
    homepage: pkg.homepage,
    readme: pkg.readme,
    deprecated: pkg.deprecated,
    has_types: pkg.has_types,
    page: select_page.get({ id: pkg.page_id })!,
    download_page: select_page.get({ id: pkg.download_page_id })!,
    dependent_page: select_page.get({ id: pkg.dependent_page_id })!,
    keywords: select_npm_package_keywords.all({ npm_package_id: pkg.id! }),
    dependencies: select_npm_deps.all({ package_id: pkg.id! }),
  }
}

let select_repo_list = db
  .prepare<void[], string>(
    /* sql */ `
select url from repo
`,
  )
  .pluck()

let select_npm_package_list = db
  .prepare<void[], string>(
    /* sql */ `
select name from npm_package
`,
  )
  .pluck()

function on_receive_repo_list(input: { receive_list: string[] }) {
  let has_list = new Set(select_repo_list.all())
  let need_list = input.receive_list.filter(name => !has_list.has(name))
  return { need_list }
}

function on_receive_npm_package_list(input: { receive_list: string[] }) {
  let has_list = new Set(select_npm_package_list.all())
  let need_list = input.receive_list.filter(name => !has_list.has(name))
  return { need_list }
}

function upsert<Table extends { id?: number | null }>(
  table: Table[],
  key: keyof Table,
  data: Table,
): number {
  let filter = { [key]: data[key] } as Partial<Table>
  let row = find(table, filter)
  if (row) return row.id!
  return table.push(data)
}

function get_id<Table extends { id?: number | null }, Key extends keyof Table>(
  table: Table[],
  key: Key,
  value: null,
): null
function get_id<Table extends { id?: number | null }, Key extends keyof Table>(
  table: Table[],
  key: Key,
  value: Table[Key] | null,
): number
function get_id<Table extends { id?: number | null }, Key extends keyof Table>(
  table: Table[],
  key: Key,
  value: Table[Key] | null,
): number | null {
  if (value == null) return null
  let filter = { [key]: value } as any
  return upsert(table, key, filter)
}

function upsert_page(
  page: NonNullable<ReturnType<(typeof select_page)['get']>>,
) {
  return upsert(proxy.page, 'url', {
    url: page.url,
    payload: null,
    check_time: page.check_time,
    update_time: page.update_time,
  })
}

function upsert_repo(repo: ReturnType<typeof export_repo>) {
  let repo_id = upsert(proxy.repo, 'url', {
    domain_id: get_id(proxy.domain, 'host', repo.domain),
    author_id: get_id(proxy.author, 'username', repo.author),
    name: repo.name,
    is_fork: repo.is_fork,
    url: repo.url,
    desc: repo.desc,
    programming_language_id: get_id(
      proxy.programming_language,
      'name',
      repo.programming_language,
    ),
    website: repo.website,
    stars: repo.stars,
    watchers: repo.watchers,
    forks: repo.forks,
    readme: repo.readme,
    last_commit: repo.last_commit,
    is_public: repo.is_public,
    page_id: upsert_page(repo.page),
  })
  for (let keyword of repo.keywords) {
    let row = {
      repo_id,
      keyword_id: get_id(proxy.keyword, 'name', keyword),
    }
    find(proxy.repo_keyword, row) || proxy.repo_keyword.push(row)
  }
  return repo_id
}

function upsert_npm_package(
  npm_package: ReturnType<typeof export_npm_package>,
) {
  let package_id = upsert(proxy.npm_package, 'name', {
    author_id: get_id(proxy.author, 'username', npm_package.author),
    name: npm_package.name,
    version: npm_package.version,
    desc: npm_package.desc,
    create_time: npm_package.create_time,
    last_publish_time: npm_package.last_publish_time,
    unpublish_time: npm_package.unpublish_time,
    weekly_downloads: npm_package.weekly_downloads,
    unpacked_size: npm_package.unpacked_size,
    file_count: npm_package.file_count,
    repository: npm_package.repository,
    repo_id: npm_package.repo ? upsert_repo(npm_package.repo) : null,
    homepage: npm_package.homepage,
    readme: npm_package.readme,
    deprecated: npm_package.deprecated,
    has_types: npm_package.has_types,
    page_id: upsert_page(npm_package.page),
    download_page_id: upsert_page(npm_package.download_page),
    dependent_page_id: upsert_page(npm_package.dependent_page),
  })
  for (let keyword of npm_package.keywords) {
    let row = {
      npm_package_id: package_id,
      keyword_id: get_id(proxy.keyword, 'name', keyword),
    }
    find(proxy.npm_package_keyword, row) || proxy.npm_package_keyword.push(row)
  }
  for (let dep of npm_package.dependencies) {
    let package_page_url = `https://registry.npmjs.org/${dep.name}`
    let package_page_id = getPageId(package_page_url)

    let download_page_url = `https://api.npmjs.org/downloads/point/last-week/${dep.name}`
    let download_page_id = getPageId(download_page_url)

    let dependent_page_url = `https://www.npmjs.com/browse/depended/${dep.name}?offset=0`
    let dependent_page_id = getPageId(dependent_page_url)

    let dep_row = {} as NpmPackage
    dep_row.name = dep.name
    dep_row.page_id = package_page_id
    dep_row.download_page_id = download_page_id
    dep_row.dependent_page_id = dependent_page_id
    let dependency_id = upsert(proxy.npm_package, 'name', dep_row)
    let row = {
      package_id,
      dependency_id,
      type: dep.type,
    }
    find(proxy.npm_package_dependency, row) ||
      proxy.npm_package_dependency.push(row)
  }
}

function getPageId(url: string): number {
  let page = find(proxy.page, { url })
  if (page) return page.id!
  return proxy.page.push({
    url,
    payload: null,
    check_time: null,
    update_time: null,
  })
}

function on_receive_repo_batch(input: {
  receive_list: Array<ReturnType<typeof export_repo>>
}) {
  return db.transaction(() => {
    for (let repo of input.receive_list) {
      upsert_repo(repo)
    }
    return {}
  })()
}

function on_receive_npm_package_batch(input: {
  receive_list: Array<ReturnType<typeof export_npm_package>>
}) {
  return db.transaction(() => {
    for (let npm_package of input.receive_list) {
      upsert_npm_package(npm_package)
    }
    return {}
  })()
}

async function post<Fn extends (input: any) => any>(
  url: string,
  body: Parameters<Fn>[0],
): Promise<ReturnType<Fn>> {
  let remote_origin = 'https://res-index.hkit.cc'
  console.log('POST', url)
  let res = await fetch(remote_origin + url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-API-Key': config.api_key.sync,
    },
    body: JSON.stringify(body),
  })
  let json = await res.json()
  console.log('GOT', json)
  if (json.error) {
    throw new Error(json.error)
  }
  return json
}

let routes: Routes = {
  '/dataset': {
    title: title(pageTitle),
    description: 'TODO',
    menuText: pageTitle,
    node: page,
  },
  '/dataset/repo/list': {
    title: apiEndpointTitle,
    description: 'TODO',
    streaming: false,
    resolve: context => brideToFn(context, sync_repo.on_receive_list),
  },
  '/dataset/repo/batch': {
    title: apiEndpointTitle,
    description: 'TODO',
    streaming: false,
    resolve: context => brideToFn(context, sync_repo.on_receive_batch),
  },
  '/dataset/npm_package/list': {
    title: apiEndpointTitle,
    description: 'TODO',
    streaming: false,
    resolve: context => brideToFn(context, sync_npm_package.on_receive_list),
  },
  '/dataset/npm_package/batch': {
    title: apiEndpointTitle,
    description: 'TODO',
    streaming: false,
    resolve: context => brideToFn(context, sync_npm_package.on_receive_batch),
  },
}

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
  throw EarlyTerminate
}

type Sync<T> = {
  list_url: string
  batch_url: string
  select_list: { all: () => string[] }
  on_receive_list: (input: { receive_list: string[] }) => {
    need_list: string[]
  }
  export_one: (key: string) => T
  on_receive_batch: (input: { receive_list: T[] }) => object
}
let sync_repo: Sync<RepoExport> = {
  list_url: toRouteUrl(routes, '/dataset/repo/list'),
  batch_url: toRouteUrl(routes, '/dataset/repo/batch'),
  select_list: select_repo_list,
  on_receive_list: on_receive_repo_list,
  export_one: export_repo,
  on_receive_batch: on_receive_repo_batch,
}
let sync_npm_package: Sync<NpmPackageExport> = {
  list_url: toRouteUrl(routes, '/dataset/npm_package/list'),
  batch_url: toRouteUrl(routes, '/dataset/npm_package/batch'),
  select_list: select_npm_package_list,
  on_receive_list: on_receive_npm_package_list,
  export_one: export_npm_package,
  on_receive_batch: on_receive_npm_package_batch,
}

async function run_sync<T>(sync: Sync<T>) {
  let batch_size = 200
  let json = await post<typeof sync.on_receive_list>(
    toRouteUrl(routes, sync.list_url),
    { receive_list: sync.select_list.all() },
  )
  let batches = binArray(json.need_list, batch_size)
  for (let key_batch of batches) {
    let export_batch = key_batch.map(sync.export_one)
    await post<typeof sync.on_receive_batch>(
      toRouteUrl(routes, sync.batch_url),
      { receive_list: export_batch },
    )
  }
}

async function sync_with_remote() {
  await run_sync(sync_repo)
  await run_sync(sync_npm_package)
}

if (import.meta.filename == process.argv[1]) {
  await sync_with_remote()
}

export default { routes }
