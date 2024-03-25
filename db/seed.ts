import { find, seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { db } from './db'
import { cleanRepoUrl, parseRepoUrl } from './format'

// This file serve like the knex seed file.
//
// You can setup the database with initial config and sample data via the db proxy.

function fix_npm_detail() {
  let prefix = 'https://www.npmjs.com/package/'
  let pages = db.query(`select id, url from page where url like '${prefix}%'`)
  for (let page of pages) {
    db.update(
      'page',
      {
        url: page.url.replace(prefix, 'https://registry.npmjs.org/'),
      },
      { id: page.id },
    )
  }
}
fix_npm_detail()

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
      let { username: repo_username, name: repo_name } = parseRepoUrl(repo_url)
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
        page_id: repo_page_id,
      })
      repo = proxy.repo[repo_id]
    }
    proxy.npm_package[id].repo_id = repo.id!
  }
}
fix_npm_repository()
