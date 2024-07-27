import { filter, find, seedRow, getId, update, del } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { db } from './db'
import { cleanRepoUrl, parseRepoUrl } from './format'
import { readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import {
  hasTypes,
  npm_package_detail_parser,
  storeNpmPackage,
  storeRepo,
} from './collect'
import { getLanguageId } from './store'
import { env } from './env'

// This file serve like the knex seed file.
//
// You can setup the database with initial config and sample data via the db proxy.

function run(fn: () => unknown) {
  process.stdout.write(fn.name + '()...')
  console.time(fn.name)
  db.transaction(fn)()
  process.stdout.write('\r')
  console.timeEnd(fn.name)
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

function getNpmPackageLatestVersion(payload: string) {
  let json = JSON.parse(payload)
  let pkg = npm_package_detail_parser.parse(json)
  if (!('versions' in pkg)) return
  let version_name = pkg['dist-tags']?.latest
  if (!version_name) return
  let version = pkg.versions[version_name]
  return version
}

function set_npm_package__deprecated() {
  let rows = db
    .prepare<void[], { id: number; payload: string }>(
      /* sql */ `
select
  npm_package.id
, page.payload
from npm_package
inner join page on page.id = npm_package.page_id
where npm_package.deprecated is null
  and page.payload is not null
`,
    )
    .all()
  for (let row of rows) {
    let version = getNpmPackageLatestVersion(row.payload)
    if (!version) continue

    let deprecated = 'deprecated' in version && version.deprecated != false
    proxy.npm_package[row.id].deprecated = deprecated
  }
}
run(set_npm_package__deprecated)

function set_npm_package__has_types() {
  let rows = db
    .prepare<void[], { id: number; payload: string }>(
      /* sql */ `
select
  npm_package.id
, page.payload
from npm_package
inner join page on page.id = npm_package.page_id
where npm_package.has_types is null
  and page.payload is not null
`,
    )
    .all()
  for (let row of rows) {
    let version = getNpmPackageLatestVersion(row.payload)
    if (!version) continue

    let types = version.types
    if (Array.isArray(types)) {
      types = types.join()
    }

    let has_types = hasTypes(version.types) || hasTypes(version.typings)
    proxy.npm_package[row.id].has_types = has_types
  }
}
run(set_npm_package__has_types)

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

function fix_npm_package_deprecated() {
  let ids = db
    .prepare(
      /* sql */ `
select
  npm_package.id
from npm_package
inner join page on page.id = npm_package.page_id
where npm_package.deprecated is null
  and npm_package.unpublish_time is null
  and page.payload is not null
`,
    )
    .pluck()
    .all() as number[]
  let select = db.prepare(/* sql */ `
select
  npm_package.version
, page.payload
from npm_package
inner join page on page.id = npm_package.page_id
where npm_package.id = :id
limit 1
`)
  let update = db.prepare(/* sql */ `
update npm_package
set deprecated = :deprecated
where id = :id
`)
  let n = ids.length
  let i = 0
  for (let id of ids) {
    i++
    process.stdout.write(`\r fix_npm_package_deprecated progress: ${i}/${n}...`)
    let row = select.get({ id }) as { version: string; payload: string }
    let payload = JSON.parse(row.payload)
    writeFileSync('npm.json', JSON.stringify(payload, null, 2))
    let pkg = npm_package_detail_parser.parse(payload)
    if ('error' in pkg) continue
    if (!('versions' in pkg)) continue
    let version = pkg.versions[row.version]
    let deprecated =
      version && 'deprecated' in version && version.deprecated != false
    update.run({
      id,
      deprecated: deprecated ? 1 : 0,
    })
  }
  process.stdout.write(
    `\r` +
      ' '.repeat(` fix_npm_package_deprecated progress: ${i}/${n}...`.length) +
      '\r',
  )
}
run(fix_npm_package_deprecated)

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
