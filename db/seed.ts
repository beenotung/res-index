import { find, seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { db } from './db'
import { cleanRepoUrl, parseRepoUrl } from './format'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { env } from 'process'
import { homedir } from 'os'
import { execSync } from 'child_process'

// This file serve like the knex seed file.
//
// You can setup the database with initial config and sample data via the db proxy.

function seed_sample_data() {
  function reset() {
    db.exec('delete from repo')
    db.exec('delete from page')
    db.exec('delete from author')
    db.exec('delete from programming_language')
  }
  // reset()

  function getLanguageId(name: string): number {
    return (
      find(proxy.programming_language, { name })?.id ||
      proxy.programming_language.push({ name })
    )
  }

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

  let repo_id = 0

  let hosts = ['github.com', 'gitlab.com', 'bitbucket.org']
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
        repo_id++
        let url = `https://${host}/${username}/${repo}`
        proxy.page[repo_id] = {
          url,
          payload: null,
          check_time: null,
          update_time: null,
        }
        proxy.repo[repo_id] = {
          author_id,
          name: repo,
          is_fork: false,
          url,
          desc: 'stub',
          programming_language_id: detectLanguage(repo_dir),
          website: null,
          stars: null,
          watchers: null,
          forks: null,
          readme: null,
          last_commit: null,
          page_id: repo_id,
        }
      }
    }
  }
}
if ('dev' || proxy.repo.length == 0) {
  seed_sample_data()
}

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
