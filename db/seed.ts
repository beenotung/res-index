import { filter, find, seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { db } from './db'
import { cleanRepoUrl, parseRepoUrl } from './format'
import { readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { npm_package_detail_parser } from './collect'
import { getLanguageId } from './store'

// This file serve like the knex seed file.
//
// You can setup the database with initial config and sample data via the db proxy.

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
      let author_id =
        find(proxy.author, { username })?.id || proxy.author.push({ username })

      let user_dir = join(host_dir, username)
      let repos = readdirSync(user_dir)
      for (let repo of repos) {
        let repo_dir = join(user_dir, repo)
        if (!statSync(repo_dir).isDirectory()) continue

        let domain_id =
          find(proxy.domain, { host })?.id || proxy.domain.push({ host })

        let url = `https://${host}/${username}/${repo}`

        let page_id =
          find(proxy.page, { url })?.id ||
          proxy.page.push({
            url,
            payload: null,
            check_time: null,
            update_time: null,
          })

        find(proxy.repo, { url }) ||
          proxy.repo.push({
            domain_id,
            author_id,
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
            page_id,
          })
      }
    }
  }
}
seed_local_repo()

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
fix_language_name()

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
      continue
    }
    update_page_url.run({ id: page.id, new_url })
  }
}
fix_npm_page_url()

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
set_npm_package__deprecated()

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

    let has_types = !!(types?.trim() || version.typings?.trim())
    proxy.npm_package[row.id].has_types = has_types
  }
}
set_npm_package__has_types()

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
fix_npm_download()

function remove_invalid_repo_url() {
  let rows = db.query<{
    npm_package_id: number
    repo_id: number
    page_id: number
    repo_url: string
  }>(/* sql */ `
    select
      npm_package.id as npm_package_id
    , repo.id as repo_id
    , repo.page_id as page_id
    , repo.url as repo_url
    from npm_package
    inner join repo on repo.id = npm_package.repo_id
    `)
  for (let row of rows) {
    let url = cleanRepoUrl(row.repo_url)
    if (url) continue
    proxy.npm_package[row.npm_package_id].repo_id = null
    delete proxy.repo[row.repo_id]
    delete proxy.page[row.page_id]
  }
}
db.transaction(remove_invalid_repo_url).immediate()

function fix_npm_repository() {
  let rows = db.query(/* sql */ `
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
      let domain_id =
        find(proxy.domain, { host })?.id || proxy.domain.push({ host })
      let repo_author_id =
        find(proxy.author, { username: repo_username })?.id ||
        proxy.author.push({ username: repo_username })
      let repo_page_id =
        find(proxy.page, { url: repo_url })?.id ||
        proxy.page.push({
          url: repo_url,
          payload: null,
          check_time: null,
          update_time: null,
        })
      let repo_id = proxy.repo.push({
        domain_id,
        author_id: repo_author_id,
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
        is_public: !!cleanRepoUrl(repo_url),
        page_id: repo_page_id,
      })
      repo = proxy.repo[repo_id]
    }
    proxy.npm_package[id].repo_id = repo.id!
  }
}
fix_npm_repository()

function set_repo_domain() {
  let rows = db.query(/* sql */ `
select id from repo
where domain_id is null
`)
  for (let row of rows) {
    let repo = proxy.repo[row.id]
    let { host } = parseRepoUrl(repo.url)
    let domain_id =
      find(proxy.domain, { host })?.id || proxy.domain.push({ host })
    repo.domain_id = domain_id
  }
}
set_repo_domain()

function check_repo_is_public() {
  let repos = filter(proxy.repo, { is_public: null })
  for (let repo of repos) {
    let url = cleanRepoUrl(repo.url)
    repo.is_public = !!url
  }
}
check_repo_is_public()

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
fix_npm_package_deprecated()
