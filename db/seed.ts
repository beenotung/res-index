import { filter, find, getId, update, del, count } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { db } from './db'
import { cleanRepoUrl, parseRepoUrl } from './format'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import {
  npm_package_detail_parser,
  storeNpmPackage,
  storeRepo,
} from './collect'
import { getLanguageId } from './store'
import { env } from './env'
import { startTimer } from '@beenotung/tslib/timer'

// This file serve like the knex seed file.
//
// You can setup the database with initial config and sample data via the db proxy.

let only: any = fix_extra_author_name

function run(fn: () => unknown) {
  if (only && fn !== only) return
  process.stdout.write(fn.name + '()...')
  console.time(fn.name)
  db.transaction(fn)()
  process.stdout.write('\r')
  console.timeEnd(fn.name)
}

let asyncQueue = Promise.resolve()

function runAsync(fn: () => Promise<unknown>) {
  if (only && fn !== only) return
  asyncQueue = asyncQueue.then(async () => {
    process.stdout.write(fn.name + '()...')
    console.time(fn.name)
    await fn()
    process.stdout.write('\r')
    console.timeEnd(fn.name)
  })
}

function seed_local_repo() {
  function reset() {
    db.exec('delete from repo')
    db.exec('delete from page')
    db.exec('delete from author')
    db.exec('delete from programming_language')
  }
  // reset()

  function detectLanguage(dir: string): number | null {
    if (dir.endsWith('DefinitelyTyped')) return getLanguageId('Typescript')
    let filenames = readdirSync(dir)
    if (filenames.length == 1 && filenames[0] === '.git') {
      try {
        console.log('checkout:', dir)
        execSync('git checkout master', { cwd: dir })
      } catch (error) {
        // branch not called master?
      }
      filenames = readdirSync(dir)
    }
    if (filenames.includes('tsconfig.json')) return getLanguageId('Typescript')
    if (filenames.includes('package.json')) return getLanguageId('Javascript')
    if (filenames.some(filename => filename.endsWith('.html')))
      return getLanguageId('HTML')
    return null
  }

  let hosts = [
    'github.com',
    // 'gitlab.com',
    // 'bitbucket.org',
  ]
  for (let host of hosts) {
    let host_dir = join(homedir(), 'workspace', host)
    let usernames = readdirSync(host_dir)
    for (let username of usernames) {
      let user_dir = join(host_dir, username)
      let repos = readdirSync(user_dir)
      for (let repo of repos) {
        let repo_dir = join(user_dir, repo)
        if (!statSync(repo_dir).isDirectory()) continue
        let url = `https://${host}/${username}/${repo}`
        find(proxy.repo, { url }) ||
          proxy.repo.push({
            domain_id: getId(proxy.domain, 'host', host),
            author_id: getId(proxy.author, 'username', username),
            name: repo,
            is_fork: false,
            url,
            desc: null,
            programming_language_id: detectLanguage(repo_dir),
            website: null,
            stars: null,
            watchers: null,
            forks: null,
            readme: null,
            last_commit: null,
            is_public: !!cleanRepoUrl(url),
            page_id: getId(proxy.page, 'url', url),
          })
      }
    }
  }
}
if (env.NODE_ENV == 'development') {
  run(seed_local_repo)
}

function fix_language_name() {
  let update_programming_language_id = db.prepare<{
    from: string
    to: string
  }>(/* sql */ `
update repo
  set programming_language_id = (select id from programming_language where name = :to)
where programming_language_id = (select id from programming_language where name = :from)
`)
  let delete_statement = db.prepare<{ from: string }>(/* sql */ `
delete from programming_language
where name = :from
`)
  let reset_sequence = db.prepare(/* sql */ `
update sqlite_sequence
set seq = 1
`)
  function fix(options: { from: string; to: string }) {
    if (!find(proxy.programming_language, { name: options.from })) return
    getLanguageId(options.to)
    update_programming_language_id.run(options)
    delete_statement.run(options)
    reset_sequence.run()
  }
  fix({ from: 'TypeScript', to: 'Typescript' })
  fix({ from: 'JavaScript', to: 'Javascript' })
}
run(fix_language_name)

function fix_npm_page_url() {
  let prefix = 'https://www.npmjs.com/package/'
  let pages = db.query<{ id: number; url: string }>(
    `select id, url from page where url like '${prefix}%'`,
  )
  let select_by_url = db
    .prepare<
      { new_url: string },
      number
    >(`select id from page where url = :new_url`)
    .pluck()
  let update_page_url = db.prepare<{ new_url: string; id: number }>(
    `update page set url = :new_url where id = :id`,
  )
  let update_repo_page_id = db.prepare<{
    new_page_id: number
    old_page_id: number
  }>(`update repo set page_id = :new_page_id where page_id = :old_page_id`)
  for (let page of pages) {
    let new_url = page.url.replace(prefix, 'https://registry.npmjs.org/')
    let new_page_id = select_by_url.get({ new_url })
    if (new_page_id) {
      update_repo_page_id.run({ new_page_id, old_page_id: page.id })
      delete proxy.page[page.id]
      continue
    }
    update_page_url.run({ id: page.id, new_url })
  }
}
run(fix_npm_page_url)

function fix_npm_download() {
  let prefix = 'https://api.npmjs.org/downloads/point/last-day/'
  let pages = db.query(`select id, url from page where url like '${prefix}%'`)
  for (let page of pages) {
    db.update(
      'page',
      {
        url: page.url.replace(
          prefix,
          'https://api.npmjs.org/downloads/point/last-week/',
        ),
      },
      { id: page.id },
    )
  }
}
run(fix_npm_download)

function remove_repo_org_page() {
  let rows = db.query(
    'select id, url from page where url like ?',
    'https://github.com/orgs/%',
  )
  for (let row of rows) {
    let page_id = row.id
    let url = cleanRepoUrl(row.url)
    if (url != row.url) {
      let repo_id = find(proxy.repo, { page_id })?.id
      if (repo_id) {
        deleteRepo(repo_id)
      }
    }
  }
}
run(remove_repo_org_page)

// e.g. 'https://github.com/pollenium/'
// e.g. 'https://github.com/image-charts/'
function remove_repo_author_page() {
  let rows = db
    .prepare<void[], { id: number; url: string }>(
      /* sql */ `
  select id, url from repo where url like 'https://github.com/%/'
  `,
    )
    .all()
  for (let row of rows) {
    let repo = parseRepoUrl(row.url)
    if (repo.name) {
      continue
    }
    deleteRepo(row.id)
  }
}
run(remove_repo_author_page)

function deleteRepo(repo_id: number) {
  if (!(repo_id in proxy.repo)) {
    return
  }
  db.prepare(
    /* sql */ `
update npm_package
set repo_id = null
where repo_id = :repo_id
`,
  ).run({ repo_id })
  let page_id = proxy.repo[repo_id].page_id
  delete proxy.repo[repo_id]
  if (!find(proxy.npm_package, { page_id })) {
    delete proxy.page[page_id]
  }
}

// remove '@' in repo.url
// remove extra '/' after origin in repo.url
function fix_repo_url() {
  let rows = db.query<{
    repo_id: number
    repo_url: string
    repository: string | null
    npm_package_id: number | null
    page_id: number
  }>(/* sql */ `
select repo.id as repo_id
, repo.url as repo_url
, npm_package.repository
, npm_package.id as npm_package_id
, npm_package.name
, repo.page_id
from repo
left join npm_package on npm_package.repo_id = repo.id
where url like '%@%'
   or url like 'https://github.com//%'
`)
  for (let row of rows) {
    let url = cleanRepoUrl(row.repository || row.repo_url)
    if (url == row.repo_url) continue
    // remove invalid repo
    deleteRepo(row.repo_id)
  }
}
run(fix_repo_url)

// remove extra package path after repo name
function remove_repository_pathname() {
  let rows = db.query<{
    id: number
    name: string
    repository: string
  }>(/* sql */ `
select id, name, repository
from npm_package
where repository like 'https://github.com/%/%/%'
  and repo_id is null
`)
  for (let row of rows) {
    let repo_url = cleanRepoUrl(row.repository)
    if (repo_url) {
      let repo = storeRepo(repo_url)
      proxy.npm_package[row.id].repo_id = repo.id!
    }
  }
}
run(remove_repository_pathname)

function fix_npm_repository() {
  let rows = db.query<{ id: number; repository: string }>(/* sql */ `
    select id, repository
    from npm_package
    where repository is not null
      and repo_id is null
    `)
  for (let { id, repository } of rows) {
    let repo_url = cleanRepoUrl(repository)
    if (!repo_url) {
      // e.g. "https://developers.reddit.com/"
      continue
    }
    let repo = find(proxy.repo, { url: repo_url })
    if (!repo) {
      let {
        host,
        username: repo_username,
        name: repo_name,
      } = parseRepoUrl(repo_url)
      let repo_id = proxy.repo.push({
        domain_id: getId(proxy.domain, 'host', host),
        author_id: getId(proxy.author, 'username', repo_username),
        name: repo_name,
        is_fork: null,
        url: repo_url,
        desc: null,
        programming_language_id: null,
        website: null,
        stars: null,
        watchers: null,
        forks: null,
        readme: null,
        last_commit: null,
        is_public: null,
        page_id: getId(proxy.page, 'url', repo_url),
      })
      repo = proxy.repo[repo_id]
    }
    proxy.npm_package[id].repo_id = repo.id!
  }
}
run(fix_npm_repository)

function set_repo_domain() {
  let rows = db.query(/* sql */ `
select id from repo
where domain_id is null
`)
  for (let row of rows) {
    let repo = proxy.repo[row.id]
    let { host } = parseRepoUrl(repo.url)
    repo.domain_id = getId(proxy.domain, 'host', host)
  }
}
run(set_repo_domain)

function check_repo_is_public() {
  // let repos = filter(proxy.repo, { is_public: null })
  // for (let repo of repos) {
  //   let url = cleanRepoUrl(repo.url)
  //   repo.is_public = !!url
  // }
  db.run(/* sql */ `
update repo
set is_public = null
where is_public = 1
  and page_id in (
    select id from page
    where check_time is null
  )
`)
}
run(check_repo_is_public)

function fix_relative_npm_package_name() {
  // e.g. fix "../serve-static" to "serve-static"

  let update_dep_1 = db.prepare<{ new_id: number; old_id: number }>(/* sql */ `
update npm_package_dependency
set dependency_id = :new_id
where dependency_id  = :old_id
`)

  let update_dep_2 = db.prepare<{ new_id: number; old_id: number }>(/* sql */ `
update npm_package_dependency
set package_id = :new_id
where package_id  = :old_id
`)

  let update_keyword = db.prepare<{
    new_id: number
    old_id: number
  }>(/* sql */ `
update npm_package_keyword
set npm_package_id = :new_id
where npm_package_id  = :old_id
`)

  let rows = db
    .prepare<
      void[],
      {
        id: number
        name: string
        page_id: number
        download_page_id: number
        dependent_page_id: number
      }
    >(
      /* sql */ `
select
  id
, name
, page_id
, download_page_id
, dependent_page_id
from npm_package
where name like '../%'
`,
    )
    .all()

  for (let row of rows) {
    let name = row.name.replace('../', '')
    let new_id =
      find(proxy.npm_package, { name })?.id || storeNpmPackage({ name })
    let old_id = row.id
    update_dep_1.run({ new_id, old_id })
    update_dep_2.run({ new_id, old_id })
    update_keyword.run({ new_id, old_id })
    delete proxy.npm_package[row.id]
    delete proxy.page[row.page_id]
    delete proxy.page[row.download_page_id]
    delete proxy.page[row.dependent_page_id]
  }
}
run(fix_relative_npm_package_name)

// Remove extra parts in repo.url
// For example:
// - '/wiki'
// - '/releases'
// - '/issues'
// - '/tree'
function remove_repo_url_suffix() {
  let rows = db
    .prepare<
      void[],
      {
        repo_id: number
        page_id: number
        url: string
      }
    >(
      /* sql */ `
select
  id as repo_id
, page_id
, url
from repo
where url like 'https://github.com/%/%/%'
`,
    )
    .all()
  for (let row of rows) {
    let url = cleanRepoUrl(row.url)
    if (url == row.url) continue

    let repo = proxy.repo[row.repo_id]

    /* unlink foreign key references */
    let npm_packages = filter(proxy.npm_package, { repo_id: repo.id })
    for (let npm_package of npm_packages) {
      npm_package.repo_id = null
    }
    del(proxy.repo_keyword, { repo_id: repo.id! })
    delete proxy.repo[repo.id!]

    /* delete page */
    delete proxy.page[row.page_id]
    if (!url) continue

    /* store corrected repo url */
    repo = storeRepo(url)

    /* restore version foreign key references */
    for (let npm_package of npm_packages) {
      npm_package.repo_id = repo.id!
    }
  }
}
run(remove_repo_url_suffix)

function deleteNpmPackage(npm_package_id: number) {
  db.transaction(() => {
    let npm_package = proxy.npm_package[npm_package_id]
    if (npm_package.repo_id) {
      deleteRepo(npm_package.repo_id)
    }
    let { page_id, download_page_id, dependent_page_id } = npm_package
    delete proxy.npm_package[npm_package_id]
    delete proxy.page[page_id]
    delete proxy.page[download_page_id]
    delete proxy.page[dependent_page_id]
  })()
}

function fix_npm_registry_url() {
  // component is an old package manager (you can do component install lib-name)
  // e.g. "component/assert" -> "assert"
  let id_list = db
    .prepare(
      /* sql */ `
select id from npm_package where name like 'component/%'
`,
    )
    .pluck()
    .all() as number[]
  for (let npm_package_id of id_list) {
    let npm_package = proxy.npm_package[npm_package_id]

    // check for name clash
    let renamed_npm_package = find(proxy.npm_package, {
      name: npm_package.name.replace('component/', ''),
    })
    if (renamed_npm_package) {
      console.log('del', npm_package_id)
      update(
        proxy.npm_package_dependency,
        { dependency_id: npm_package_id },
        { dependency_id: renamed_npm_package.id! },
      )
      update(
        proxy.npm_package_dependency,
        { package_id: npm_package_id },
        { package_id: renamed_npm_package.id! },
      )
      deleteNpmPackage(npm_package_id)
      continue
    }
    console.log('rename', npm_package_id)

    // e.g. "component/assert"
    npm_package.name = checked_replace(npm_package.name, 'component/', '')

    let page = npm_package.page!
    // e.g. "https://registry.npmjs.org/component/assert"
    page.url = checked_replace(
      page.url,
      'https://registry.npmjs.org/component/',
      'https://registry.npmjs.org/',
    )
    page.check_time = null

    page = npm_package.download_page!
    // e.g. "https://api.npmjs.org/downloads/point/last-week/component/assert"
    page.url = checked_replace(
      page.url,
      'https://api.npmjs.org/downloads/point/last-week/component/',
      'https://api.npmjs.org/downloads/point/last-week/',
    )
    page.check_time = null

    page = npm_package.dependent_page!
    // e.g. "https://www.npmjs.com/browse/depended/component/assert?offset=0"
    page.url = checked_replace(
      page.url,
      'https://www.npmjs.com/browse/depended/component/',
      'https://www.npmjs.com/browse/depended/',
    )
    page.check_time = null
  }
}
run(fix_npm_registry_url)

function checked_replace(text: string, pattern: string, into: string) {
  if (text.includes(pattern)) {
    return text.replace(pattern, into)
  }
  throw new Error(`Failed to find pattern "${pattern}" in text "${text}"`)
}

function migrate_repo(from_id: number, to_id: number) {
  update(proxy.npm_package, { repo_id: from_id }, { repo_id: to_id })
  let rows = filter(proxy.repo_keyword, { repo_id: from_id })
  for (let row of rows) {
    let has = find(proxy.repo_keyword, {
      repo_id: to_id,
      keyword_id: row.keyword_id,
    })
    if (has) {
      delete proxy.repo_keyword[row.id!]
    } else {
      row.repo_id = to_id
    }
  }
  let page_id = proxy.repo[from_id].page_id
  delete proxy.repo[from_id]
  delete proxy.page[page_id]
}

function remove_hash_in_repo() {
  let ids = db
    .prepare<void[], number>(
      /* sql */ `
  select id from repo where name like '%#%'
  `,
    )
    .pluck()
    .all()
  for (let id of ids) {
    let repo = proxy.repo[id]
    let page = repo.page!
    let url = repo.url
    let clean_url = url.split('#')[0]
    if (url != clean_url) {
      let clean_repo = find(proxy.repo, { url: clean_url })
      if (clean_repo) {
        migrate_repo(repo.id!, clean_repo.id!)
        continue
      }
    }
    repo.name = repo.name.split('#')[0]
    repo.url = repo.url.split('#')[0]
    page.url = page.url.split('#')[0]
  }
}
run(remove_hash_in_repo)

function remove_bracket_in_repo() {
  let ids = db
    .prepare<void[], number>(
      /* sql */ `
  select id from repo where name like '%)'
  `,
    )
    .pluck()
    .all()
  for (let id of ids) {
    let repo = proxy.repo[id]
    repo.name = repo.name.replace(/\)$/, '').replace(/\.git$/, '')
    repo.url = repo.url.replace(/\)$/, '').replace(/\.git$/, '')
    let page = repo.page!
    page.url = page.url.replace(/\)$/, '').replace(/\.git$/, '')
  }
}
run(remove_bracket_in_repo)

function remove_dot_git_in_repo() {
  let ids = db
    .prepare<void[], number>(
      /* sql */ `
  select id from repo where name like '%.git'
  `,
    )
    .pluck()
    .all()
  for (let id of ids) {
    let repo = proxy.repo[id]
    let page = repo.page!
    let url = repo.url
    let clean_url = url.split('.git')[0]
    if (url != clean_url) {
      let clean_repo = find(proxy.repo, { url: clean_url })
      if (clean_repo) {
        migrate_repo(repo.id!, clean_repo.id!)
        continue
      }
    }
    repo.name = repo.name.split('.git')[0]
    repo.url = repo.url.split('.git')[0]
    page.url = page.url.split('.git')[0]
  }
}
run(remove_dot_git_in_repo)

type NameRow = { id: number; name: string }

function rename_npm_package(row: NameRow, new_name: string) {
  let new_npm_package = find(proxy.npm_package, { name: new_name })
  if (!new_npm_package) {
    let scope = new_name.startsWith('@')
      ? new_name.split('/')[0].slice(1)
      : undefined
    let desc = proxy.npm_package[row.id].desc
    let new_id = storeNpmPackage({ scope, name: new_name, desc })
    new_npm_package = proxy.npm_package[new_id]
  }
  let old_id = row.id
  let new_id = new_npm_package.id!
  function move_id<T extends object>(
    table: T[],
    filter: Partial<T>,
    data: Partial<T>,
  ): void {
    if (count(table, data)) {
      del(table, filter)
    } else {
      update(table, filter, data)
    }
  }
  move_id(
    proxy.npm_package_dependency,
    { dependency_id: old_id },
    { dependency_id: new_id },
  )
  move_id(
    proxy.npm_package_dependency,
    { package_id: old_id },
    { package_id: new_id },
  )
  move_id(
    proxy.npm_package_keyword,
    { npm_package_id: old_id },
    { npm_package_id: new_id },
  )
  deleteNpmPackage(row.id)
}

// e.g. fix @angular/cdk/table -> @angular/cdk
function fix_npm_package_name_with_path() {
  let rows = db
    .prepare<void[], NameRow>(
      /* sql */ `
  select id, name from npm_package
  where name like '%/%/%'
  `,
    )
    .all()
  for (let row of rows) {
    let parts = row.name.split('/')
    parts.pop()
    let new_name = parts.join('/')
    rename_npm_package(row, new_name)
  }
}

run(fix_npm_package_name_with_path)

// e.g. _yargs-parser@7.0.0@yargs-parser -> yargs-parser
function fix_npm_package_name_with_version() {
  let timer = startTimer('scan npm_package with version in name')
  let rows = db
    .prepare<void[], NameRow>(
      /* sql */ `
select id, name from npm_package
where name like '_%@%@%'
`,
    )
    .all()
  timer.next('rename npm_packages')
  timer.setEstimateProgress(rows.length)
  for (let row of rows) {
    let parts = row.name.split('@')
    let new_name = parts.pop()!
    rename_npm_package(row, new_name)
    timer.tick()
  }
  timer.end()
}
run(fix_npm_package_name_with_version)

function remove_malicious_package() {
  let rows = db
    .prepare<void[], NameRow>(
      /* sql */ `
select id, name from npm_package
where name like '%on%=%'
`,
    )
    .all()
  for (let row of rows) {
    if (!row.name.match(/on[\w]+=/)) {
      continue
    }
    console.log()
    console.log('remove malicious npm_package:', row)
    del(proxy.npm_package_keyword, { npm_package_id: row.id })
    del(proxy.npm_package_dependency, { package_id: row.id })
    del(proxy.npm_package_dependency, { dependency_id: row.id })
    deleteNpmPackage(row.id)
  }
}
run(remove_malicious_package)

// e.g. "ssylvia/ember-uuid" -> "ember-uuid"
async function fix_extra_author_name() {
  let rows = db
    .prepare<
      void[],
      {
        id: number
        name: string
        url: string
      }
    >(
      /* sql */ `
select
  npm_package.id
, npm_package.name
, page.url
from npm_package
inner join page on page.id = page_id
where name not like '@%'
  and name like '%/%'
`,
    )
    .all()
  for (let row of rows) {
    // e.g. "https://registry.npmjs.org/ssylvia/ember-uuid"
    let url = row.url
    if (await is_npm_package_exist(url)) {
      // npm now allows this kind of name?
      continue
    }

    // 1. check if we should add @
    // e.g. "ssylvia/ember-uuid" -> "@ssylvia/ember-uuid"
    let new_name = '@' + row.name
    url = row.url.replace(row.name, new_name)
    if (await is_npm_package_exist(url)) {
      db.transaction(rename_npm_package)(row, new_name)
      continue
    }

    // 2. check if we should remove author name
    // e.g. "ssylvia/ember-uuid" -> "ember-uuid"
    new_name = row.name.split('/').slice(1).join('/')
    url = row.url.replace(row.name, new_name)
    if (await is_npm_package_exist(url)) {
      db.transaction(rename_npm_package)(row, new_name)
      continue
    }

    throw new Error('invalid npm_package name: ')
  }
}
runAsync(fix_extra_author_name)

async function is_npm_package_exist(url: string) {
  let res = await fetch(url)
  let json = await res.json()
  let pkg = npm_package_detail_parser.parse(json)
  if (pkg == 'Not Found' || ('error' in pkg && pkg.error == 'Not found')) {
    return false
  }
  return true
}
