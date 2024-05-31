import { chromium } from 'playwright'
import { fetch_retry } from '@beenotung/tslib/async/network'
import { DAY } from '@beenotung/tslib/time'
import { db } from './db'
import { del, filter, find, getId } from 'better-sqlite3-proxy'
import { GracefulPage } from 'graceful-playwright'
import { later } from '@beenotung/tslib/async/wait'
import { NpmPackage, NpmPackageDependency, proxy, Repo } from './proxy'
import { startTimer } from '@beenotung/tslib/timer'
import { writeFileSync } from 'fs'
import {
  ParseResult,
  Parser,
  array,
  boolean,
  date,
  dateString,
  dict,
  email,
  int,
  literal,
  nullable,
  object,
  optional,
  or,
  string,
  url,
} from 'cast.ts'
import { cleanRepoUrl, parseRepoUrl } from './format'
import { getLanguageId } from './store'

// TODO get repo list from username (npm package > repo > username > repo list)
// TODO continues updates each pages

async function main() {
  let browser = await chromium.launch({ headless: false })
  let page = new GracefulPage({ from: browser })
  if (proxy.repo.length == 0) {
    await collectGithubRepositories(page, { username: 'beenotung', page: 1 })
  }
  if (proxy.npm_package.length == 0) {
    await collectNpmPackages(page, { scope: 'beenotung' })
  }
  // await collectGithubRepoDetails(
  //   page,
  //   find(proxy.repo, { name: 'ts-liveview' })!,
  // )
  await collectPendingPages(page)
  await page.close()
  await browser.close()
  console.log('done.')
}

let select_pending_page = db.prepare<
  void[],
  { id: number; url: string }
>(/* sql */ `
with incomplete_page as (
  select page_id from repo where is_public is null
)
select
  page.id
, page.url
from page
where page.check_time is null
  or page.id in (select page_id from incomplete_page)
order by page.id asc
`)

async function collectPendingPages(page: GracefulPage) {
  let timer = startTimer('collect pending pages')
  let dependent_rate_limited = false
  for (;;) {
    let pages = select_pending_page.all()
    if (pages.length == 0) break
    if (dependent_rate_limited) {
      await later(5000)
      dependent_rate_limited = false
    }
    timer.setEstimateProgress(pages.length)
    for (let { id, url } of pages) {
      // timer.progress(' > url: ' + url)
      if (
        // e.g. "https://github.com/beenotung?page=1&tab=repositories"
        url.startsWith('https://github.com/') &&
        url.includes('&tab=repositories')
      ) {
        await checkGithubRepositories(page, url)
      } else if (
        // e.g. "https://github.com/beenotung/res-index"
        url.startsWith('https://github.com/')
      ) {
        let repo = find(proxy.repo, { page_id: id! })
        if (!repo)
          throw new Error('failed to find repository from page, url: ' + url)
        await collectGithubRepoDetails(page, repo)
      } else if (
        // e.g. "https://registry.npmjs.org/@beenotung/tslib"
        url.startsWith('https://registry.npmjs.org/')
      ) {
        let npm_package = find(proxy.npm_package, { page_id: id! })
        if (!npm_package)
          throw new Error('failed to find npm package from page, url: ' + url)
        await collectNpmPackageDetail(npm_package)
      } else if (
        // e.g. "https://api.npmjs.org/downloads/point/last-week/@beenotung/tslib"
        url.startsWith('https://api.npmjs.org/downloads/point/last-week/')
      ) {
        let npm_package = find(proxy.npm_package, { download_page_id: id! })
        if (!npm_package)
          throw new Error('failed to find npm package from page, url: ' + url)
        await collectNpmPackageDownloads(npm_package)
      } else if (
        // e.g. "https://www.npmjs.com/browse/depended/@beenotung/tslib?offset=0"
        url.startsWith('https://www.npmjs.com/browse/depended/')
      ) {
        if (dependent_rate_limited) continue
        let res = await checkNpmPackageDependents(page, url)
        if (res == 'rate limited') {
          dependent_rate_limited = true
        }
      } else if (find(proxy.repo, { page_id: id! })) {
        // e.g. "https://gitlab.com/plade/sdks/js"
        // e.g. "https://git.reyah.ga/reyah/libraries/reyah-oauth-provider"
        // TODO handle gitlab
        continue
      } else {
        throw new Error(`unsupported page, url: ${url}`)
      }
      timer.tick()
    }
  }
  timer.end()
}

async function collectGithubRepositories(
  page: GracefulPage,
  options: {
    username: string
    /** @description starts at 1 */
    page: number
  },
) {
  let indexUrl = `https://github.com/${options.username}?page=${options.page}&tab=repositories`
  let res = await checkGithubRepositories(page, indexUrl)
  if (res.nextUrl) {
    await collectGithubRepositories(page, {
      username: options.username,
      page: options.page + 1,
    })
  }
}
async function checkGithubRepositories(
  page: GracefulPage,
  /** @example "https://github.com/beenotung?page=1&tab=repositories" */
  indexUrl: string,
) {
  let username = new URL(indexUrl).pathname.replace('/', '')
  await page.goto(indexUrl)
  let res = await page.evaluate(() => {
    let repos = Array.from(
      document.querySelectorAll('.public[itemprop="owns"]'),
      div => {
        let is_fork = div.classList.contains('fork')
        let url = div.querySelector<HTMLAnchorElement>(
          'a[itemprop="name codeRepository"]',
        )?.href
        if (!url) {
          throw new Error('failed to get repo url')
        }
        let desc = div
          .querySelector('[itemprop="description"]')
          ?.textContent?.trim()
        let tags = Array.from(
          div.querySelectorAll<HTMLAnchorElement>('a.topic-tag'),
          a => a.innerText,
        )
        let programming_language = div.querySelector<HTMLSpanElement>(
          '[itemprop="programmingLanguage"]',
        )?.innerText
        let update_time = div
          .querySelector('relative-time')
          ?.getAttribute('datetime')
        if (!update_time) {
          throw new Error('failed to get repo update time')
        }
        return {
          is_fork,
          url,
          desc,
          tags,
          programming_language,
          update_time: new Date(update_time).getTime(),
        }
      },
    )
    let nextUrl = document.querySelector<HTMLAnchorElement>('a[rel=next]')?.href
    return { repos, nextUrl }
  })
  let indexPayload = JSON.stringify(res)
  let now = Date.now()
  db.transaction(() => {
    /* index page */
    let indexPage = find(proxy.page, { url: indexUrl })
    if (!indexPage) {
      proxy.page.push({
        url: indexUrl,
        payload: indexPayload,
        check_time: now,
        update_time: now,
      })
      storeRepos()
    } else {
      indexPage.check_time = now
      if (indexPage.payload != indexPayload) {
        indexPage.payload = indexPayload
        indexPage.update_time = now
        storeRepos()
      }
    }

    function storeRepos() {
      for (let repoData of res.repos) {
        /* repo page */
        let repoPage = find(proxy.page, { url: repoData.url })
        if (!repoPage) {
          let id = proxy.page.push({
            url: repoData.url,
            payload: null,
            check_time: null,
            update_time: repoData.update_time,
          })
          repoPage = proxy.page[id]
        } else {
          if (repoPage.update_time != repoData.update_time) {
            repoPage.update_time = repoData.update_time
          }
        }

        /* repo */
        let repo = find(proxy.repo, { url: repoData.url })
        let desc = repoData.desc || null
        let programming_language_id = repoData.programming_language
          ? getId(
              proxy.programming_language,
              'name',
              repoData.programming_language,
            )
          : null
        if (!repo) {
          let { name, host } = parseRepoUrl(repoData.url)
          let id = proxy.repo.push({
            domain_id: getId(proxy.domain, 'host', host),
            author_id: getId(proxy.author, 'username', username),
            name,
            is_fork: repoData.is_fork,
            url: repoData.url,
            desc,
            programming_language_id,
            website: null,
            stars: null,
            watchers: null,
            forks: null,
            readme: null,
            last_commit: null,
            is_public: true,
            page_id: repoPage.id!,
          })
          repo = proxy.repo[id]
        } else {
          if (repo.desc != desc) repo.desc = desc
          if (repo.programming_language_id != programming_language_id)
            repo.programming_language_id = programming_language_id
        }
        let repo_id = repo.id!

        /* repo tags */
        for (let row of filter(proxy.repo_keyword, { repo_id })) {
          if (!repoData.tags.includes(row.keyword!.name)) {
            delete proxy.repo_keyword[row.id!]
          }
        }
        for (let name of repoData.tags) {
          let keyword_id = getId(proxy.keyword, 'name', name)
          find(proxy.repo_keyword, { repo_id, keyword_id }) ||
            proxy.repo_keyword.push({ repo_id, keyword_id })
        }
      }
    }
  })()
  return res
}

let nullable_int = nullable(int({ min: 0 }))
let nullable_date = nullable(date())

// FIXME handle case when it is private or deleted
async function collectGithubRepoDetails(page: GracefulPage, repo: Repo) {
  // e.g. "https://github.com/beenotung/ts-liveview"
  let response = await page.goto(repo.url)
  if (response?.status() == 429) {
    console.log('rate limited?', response?.headers())
  }
  let is_404 = await page.evaluate(() => {
    return !!document.querySelector(
      '[alt="404 “This is not the web page you are looking for”"]',
    )
  })
  if (is_404) {
    let payload = JSON.stringify({ is_404 })
    let now = Date.now()
    db.transaction(() => {
      /* repo page */
      let page = repo.page!
      page.check_time = now
      if (page.payload == payload && repo.is_public == false) return
      page.payload = payload
      page.update_time = now

      /* repo */
      if (repo.is_public != false) repo.is_public = false
    })()
    return
  }
  let is_empty = await page.evaluate(() => {
    for (let h3 of document.querySelectorAll('h3')) {
      if (h3.innerText == 'This repository is empty.') {
        return true
      }
    }
  })
  if (!is_empty) {
    await (
      await page.getPage()
    ).waitForSelector('[data-testid="latest-commit-details"] relative-time')
  }
  let res = await page.evaluate(() => {
    let p = document.querySelector<HTMLParagraphElement>('.Layout-sidebar h2+p')
    let desc =
      p?.previousElementSibling?.textContent == 'About' ? p.innerText : null

    let website =
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          '.Layout-sidebar a.text-bold[role="link"]',
        ),
        a => a.href,
      ).find(href => href) || null

    let topics = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        // e.g. "/topics/typescript"
        '.Layout-sidebar a.topic-tag[href*="/topics/"]',
      ),
      a => a.innerText,
    )

    let stars =
      document.querySelector(
        // e.g. "/beenotung/ts-liveview/stargazers"
        `.Layout-sidebar a[href="${location.pathname}/stargazers"] strong`,
      )?.textContent || null

    let watchers =
      document.querySelector(
        // e.g. "/beenotung/ts-liveview/watchers"
        `.Layout-sidebar a[href="${location.pathname}/watchers"] strong`,
      )?.textContent || null

    let forks =
      document.querySelector(
        // e.g. "/beenotung/ts-liveview/forks"
        `.Layout-sidebar a[href="${location.pathname}/forks"] strong`,
      )?.textContent || null

    // FIXME check why it is null for some repo, e.g. https://github.com/beenotung/knex
    let programming_language =
      document.querySelector(
        // e.g. "/beenotung/ts-liveview/search?l=typescript"
        `.Layout-sidebar a[href*="${location.pathname}/search?l="] .text-bold`,
      )?.textContent || null

    let last_commit =
      document
        .querySelector<HTMLTimeElement>(
          '[data-testid="latest-commit-details"] relative-time',
        )
        ?.getAttribute('datetime') || null

    let readme =
      document.querySelector<HTMLElement>(
        '.Layout-main article[itemprop="text"]',
      )?.innerText || null

    return {
      desc,
      website,
      topics,
      stars,
      watchers,
      forks,
      programming_language,
      last_commit,
      readme,
    }
  })

  let payload = JSON.stringify(res)
  let now = Date.now()
  // saveJSON('repo.json', payload)
  db.transaction(() => {
    /* repo page */
    let page = repo.page!
    page.check_time = now
    if (page.payload == payload && repo.is_public != null) return
    page.payload = payload
    page.update_time = now

    /* repo */
    let repo_id = repo.id!
    if (repo.is_public == null) repo.is_public = true
    if (repo.desc != res.desc) repo.desc = res.desc
    if (repo.website != res.website) repo.website = res.website

    let stars = nullable_int.parse(res.stars)
    if (repo.stars != stars) repo.stars = stars

    let watchers = nullable_int.parse(res.watchers)
    if (repo.watchers != watchers) repo.watchers = watchers

    let forks = nullable_int.parse(res.forks)
    if (repo.forks != forks) repo.forks = forks

    let programming_language_id = getLanguageId(res.programming_language)
    if (repo.programming_language_id != programming_language_id)
      repo.programming_language_id = programming_language_id

    let last_commit = nullable_date.parse(res.last_commit)?.getTime() || null
    if (repo.last_commit != last_commit) repo.last_commit = last_commit

    if (repo.readme != res.readme) repo.readme = res.readme

    /* repo tags */
    for (let row of filter(proxy.repo_keyword, { repo_id })) {
      if (!res.topics.includes(row.keyword!.name)) {
        delete proxy.repo_keyword[row.id!]
      }
    }
    for (let name of res.topics) {
      let keyword_id = getId(proxy.keyword, 'name', name)
      find(proxy.repo_keyword, { repo_id, keyword_id }) ||
        proxy.repo_keyword.push({ repo_id, keyword_id })
    }
  })()
}

async function collectNpmPackages(
  page: GracefulPage,
  options: { scope: string },
) {
  let indexUrl = `https://www.npmjs.com/~${options.scope}`
  await page.goto(indexUrl)
  for (;;) {
    let res = await page.evaluate(() => {
      let links =
        document.querySelectorAll<HTMLAnchorElement>('a[href*="?page="]')
      for (let link of links) {
        if (link.innerText == 'show more packages') {
          link.click()
          return 'loading' as const
        }
        if (link.innerText == 'loading') {
          return 'loading' as const
        }
      }
    })
    if (res == 'loading') {
      await later(500)
      continue
    }
    break
  }
  let res = await page.evaluate(() => {
    let packages = Array.from(
      document.body.querySelectorAll<HTMLAnchorElement>(
        'li section a[href*="/package/"]',
      ),
      a => {
        let url = a.href
        let name = url.match(/\/package\/(.*)/)?.[1]
        if (!name) {
          throw new Error('failed to parse package name, url: ' + url)
        }
        let section = a.closest('section')
        if (!section) {
          throw new Error('failed to find package section')
        }
        let desc =
          section.querySelector('p.lh-copy')?.textContent?.trim() || null
        return { name, desc }
      },
    )
    return { packages }
  })

  let indexPayload = JSON.stringify(res)
  let now = Date.now()
  db.transaction(() => {
    /* index page */
    let indexPage = find(proxy.page, { url: indexUrl })
    if (!indexPage) {
      proxy.page.push({
        url: indexUrl,
        payload: indexPayload,
        check_time: now,
        update_time: now,
      })
      storePackages()
    } else {
      indexPage.check_time = now
      if (indexPage.payload != indexPayload) {
        indexPage.payload = indexPayload
        indexPage.update_time = now
        storePackages()
      }
    }
    function storePackages() {
      for (let pkg of res.packages) {
        storeNpmPackage({
          scope: options.scope,
          name: pkg.name,
          desc: pkg.desc,
        })
      }
    }
  })()
}

function storeNpmPackage(pkg: {
  scope?: string
  name: string
  desc?: string | null
}): number {
  /* npm package page */
  let package_page_url = `https://registry.npmjs.org/${pkg.name}`
  let package_page_id = getPageId(package_page_url)

  /* download trend page */
  let download_page_url = `https://api.npmjs.org/downloads/point/last-week/${pkg.name}`
  let download_page_id = getPageId(download_page_url)

  /* dependent page */
  let dependent_page_url = `https://www.npmjs.com/browse/depended/${pkg.name}?offset=0`
  let dependent_page_id = getPageId(dependent_page_url)

  /* npm package */
  let npm_package = find(proxy.npm_package, { name: pkg.name })
  if (!npm_package) {
    let id = proxy.npm_package.push({
      author_id: pkg.scope ? getId(proxy.author, 'username', pkg.scope) : null,
      name: pkg.name,
      version: null,
      desc: pkg.desc || null,
      create_time: null,
      last_publish_time: null,
      unpublish_time: null,
      weekly_downloads: null,
      unpacked_size: null,
      file_count: null,
      repository: null,
      repo_id: null,
      homepage: null,
      readme: null,
      deprecated: null,
      has_types: null,
      page_id: package_page_id,
      download_page_id,
      dependent_page_id,
    })
    return id
  } else {
    if (pkg.scope) {
      let author_id = getId(proxy.author, 'username', pkg.scope)
      if (npm_package.author_id != author_id) npm_package.author_id = author_id
    }
    if (pkg.desc && npm_package.desc != pkg.desc) npm_package.desc = pkg.desc
    return npm_package.id!
  }
}

let npm_repository_parser = or([
  object({
    type: optional(string({ sampleValue: 'git' })),
    url: optional(
      string({
        sampleValue:
          'git+https://github.com/beenotung/better-sqlite3-schema.git',
      }),
    ),
  }),
  string(),
])
let unpublish_npm_package_detail_parser = object({
  name: string(),
  time: object({
    created: date(),
    modified: optional(date()),
    unpublished: object({
      time: date(),
      versions: array(string()),
    }),
  }),
})
let types_parser = or([
  string(),
  array(string()),
  object({
    name: optional(string()),
    author: optional(string()),
    version: optional(string()),
    main: optional(string()),
    types: optional(string()),
  }),
]) as Parser<
  | string
  | string[]
  | {
      name?: string
      author?: string
      version?: string
      main?: string
      types?: string
    }
>
let published_npm_package_detail_parser = object({
  'name': string(),
  'dist-tags': optional(
    object({
      latest: string(),
    }),
  ),
  'versions': dict({
    key: string({ sampleValue: '0.0.1' }),
    value: object({
      types: optional(types_parser),
      typings: optional(types_parser),
      dependencies: optional(
        dict({
          key: string({ sampleValue: 'better-sqlite3' }),
          value: nullable(string({ sampleValue: '^7.1.0' })),
        }),
      ),
      devDependencies: optional(
        dict({
          key: string({ sampleValue: 'better-sqlite3' }),
          value: nullable(string({ sampleValue: '^7.1.0' })),
        }),
      ),
      peerDependencies: optional(
        or([
          dict({
            key: string({ sampleValue: 'better-sqlite3' }),
            value: nullable(string({ sampleValue: '^7.1.0' })),
          }),
          // invalid setup in eslint-config-canonical
          string(),
        ]) as Parser<Record<string, string | null> | string>,
      ),
      optionalDependencies: optional(
        dict({
          key: string({ sampleValue: 'better-sqlite3' }),
          value: nullable(string({ sampleValue: '^7.1.0' })),
        }),
      ),
      dist: object({
        fileCount: optional(int({ min: 1 })),
        unpackedSize: optional(int({ min: 1 })),
      }),
      _npmUser: optional(
        object({
          name: optional(string()),
        }),
      ),
      deprecated: optional(or([string(), boolean()])),
    }),
  }),
  'time': dict({ key: string(), value: date() }),
  'description': optional(string()),
  'homepage': optional(
    or([string(), array(string())]) as Parser<string | string[]>,
  ),
  'keywords': optional(array(string())),
  'repository': optional<ParseResult<typeof npm_repository_parser>>(
    npm_repository_parser,
  ),
  'bugs': optional(
    or([
      object({
        url: string({ sampleValue: 'https://github.com/azawakh/twsh/issue' }),
      }),
      object({
        email: email(),
      }),
      string({
        sampleValue:
          'https://github.com/babel/babel/issues?utf8=%E2%9C%93&q=is%3Aissue+label%3A%22pkg%3A%20core%22+is%3Aopen',
      }),
    ]) as Parser<{ url: string } | { email: string } | string>,
  ),
  'readme': optional(string()),
})
let not_found_npm_package_detail_parser = object({
  error: literal('Not found'),
})
export let npm_package_detail_parser = or([
  unpublish_npm_package_detail_parser,
  published_npm_package_detail_parser,
  not_found_npm_package_detail_parser,
])
let packageTimeParser = object({
  modified: optional(date()),
  created: optional(date()),
  unpublished: optional(
    object({
      time: date(),
      versions: array(string()),
    }),
  ),
})

export function hasTypes(
  types: undefined | ParseResult<typeof types_parser>,
): boolean {
  if (Array.isArray(types)) {
    // e.g. npm package: "@arpit09/angular-vanilla" uses empty array in the "types" field
    types = types.join()
  }
  if (types && typeof types == 'object') {
    // e.g. npm package "@anclient/anreact" use object to represent the name,version,author,main,types
    types = types.types
  }
  return !!types?.trim()
}

function saveJSON(filename: string, payload: string) {
  writeFileSync(filename, JSON.stringify(JSON.parse(payload), null, 2))
}

async function collectNpmPackageDetail(npm_package: NpmPackage) {
  let page = npm_package.page!
  let url = page!.url
  let res = await fetch(url)
  let payload = await res.text()
  saveJSON('npm.json', payload)
  let _pkg = npm_package_detail_parser.parse(JSON.parse(payload))
  let now = Date.now()
  db.transaction(() => {
    /* npm package page */
    page.check_time = now
    if (page.payload == payload) return
    page.payload = payload
    page.update_time = now

    if ('error' in _pkg) return

    let packageTime = packageTimeParser.parse(_pkg.time)

    /* npm package */
    if (
      _pkg.time.unpublished &&
      'time' in _pkg.time.unpublished &&
      'versions' in _pkg.time.unpublished
    ) {
      if (npm_package.create_time != _pkg.time.created.getTime())
        npm_package.create_time = _pkg.time.created.getTime()
      if (npm_package.unpublish_time != _pkg.time.unpublished.time.getTime())
        npm_package.unpublish_time = _pkg.time.unpublished.time.getTime()
      return
    }
    let pkg = _pkg as ParseResult<typeof published_npm_package_detail_parser>
    let timeList = Object.entries(pkg.time)
      .map(([version, date]) => ({
        version,
        publish_time: date.getTime(),
      }))
      .sort((a, b) => b.publish_time - a.publish_time)

    let version_name = pkg['dist-tags']?.latest

    if (!version_name && packageTime.unpublished) {
      npm_package.unpublish_time = packageTime.unpublished.time.getTime()
      return
    }
    if (!version_name) {
      throw new Error(
        `no latest version specified, npm package name: ${npm_package.name}`,
      )
    }

    let publish_time = pkg.time[version_name]?.getTime()
    let version = pkg.versions[version_name]
    if (!publish_time || !version)
      throw new Error(
        `failed to find npm package version detail, name: ${npm_package.name}, version: ${version_name}`,
      )

    let create_time = packageTime.created?.getTime() || null
    if (npm_package.create_time != create_time)
      npm_package.create_time = create_time

    let deprecated = 'deprecated' in version && version.deprecated != false
    if (npm_package.deprecated != deprecated)
      npm_package.deprecated = deprecated

    let has_types = hasTypes(version.types) || hasTypes(version.typings)
    if (npm_package.has_types != has_types) npm_package.has_types = has_types

    function findAuthor() {
      if (version._npmUser?.name) {
        return version._npmUser.name
      }
      for (let time of timeList) {
        let version = pkg.versions[time.version]
        if (version?._npmUser?.name) {
          return version._npmUser.name
        }
      }
      return null
    }
    let author = findAuthor()
    let author_id = author ? getId(proxy.author, 'username', author) : null
    if (npm_package.author_id !== author_id) npm_package.author_id = author_id

    if (npm_package.version != version_name) npm_package.version = version_name

    if (npm_package.last_publish_time != publish_time)
      npm_package.last_publish_time = publish_time

    function findUnpackedSize() {
      if (version.dist.unpackedSize) {
        return version.dist.unpackedSize
      }
      for (let time of timeList) {
        let version = pkg.versions[time.version]
        if (version?.dist.unpackedSize) {
          return version.dist.unpackedSize
        }
      }
      return null
    }
    let unpacked_size = findUnpackedSize()
    if (npm_package.unpacked_size != unpacked_size)
      npm_package.unpacked_size = unpacked_size

    function findFileCount() {
      if (version?.dist.fileCount) {
        return version.dist.fileCount
      }
      for (let time of timeList) {
        let version = pkg.versions[time.version]
        if (version?.dist.fileCount) {
          return version.dist.fileCount
        }
      }
      return null
    }
    let file_count = findFileCount()
    if (npm_package.file_count != file_count)
      npm_package.file_count = file_count

    // e.g. "https://github.com/beenotung/zstd.ts"
    let repository =
      typeof pkg.repository == 'string'
        ? pkg.repository
        : pkg.repository?.url || null
    if (repository?.startsWith('/') && repository.split('/').length == 2) {
      // e.g. "/sand-common" for the npm package "sand-common"
      repository = null
    }
    if (repository?.startsWith('@') && repository.split('/').length == 2) {
      // e.g. "@buidly/sdk-dapp-with-lythra"
      repository = null
    }
    if (repository == 'URL_OF_YOUR_REPOSITORY') {
      // e.g. npm package: "terra-component-lib"
      repository = null
    }
    if (repository == 'git+') {
      // e.g. npm package: "post-or-save-package"
      repository = null
    }
    if (repository?.match(/^[\w-.]+\/[\w-.]+$/) && pkg.bugs) {
      // e.g. "Glimpse/Home"
      repository = null
    }
    if (!repository && pkg.bugs) {
      let url =
        typeof pkg.bugs == 'string'
          ? pkg.bugs
          : 'url' in pkg.bugs
            ? pkg.bugs.url
            : ''
      // e.g. "https://github.com/azawakh/twsh/issue"
      // e.g. "https://github.com/babel/babel/issues?utf8=%E2%9C%93&q=is%3Aissue+label%3A%22pkg%3A%20core%22+is%3Aopen"
      let parts = url.split('/')
      if (parts.length == 6) {
        parts.pop()
        repository = parts.join('/')
      }
    }
    let repo_url = repository ? cleanRepoUrl(repository) : null

    if (npm_package.repository != repository)
      npm_package.repository = repository

    if (repo_url) {
      let {
        host: repo_host,
        username: repo_username,
        name: repo_name,
      } = parseRepoUrl(repo_url)

      let repo = find(proxy.repo, { url: repo_url })
      if (!repo) {
        let repo_id = proxy.repo.push({
          domain_id: getId(proxy.domain, 'host', repo_host),
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
      if (repo.id != npm_package.repo_id) {
        npm_package.repo_id = repo.id!
      }
    }

    let homepage = pkg.homepage || null
    if (Array.isArray(homepage)) {
      homepage = homepage.find(url => url) || null
    }
    if (npm_package.homepage != homepage) npm_package.homepage = homepage

    let readme = pkg.readme || null
    if (npm_package.readme != readme) npm_package.readme = readme

    let npm_package_id = npm_package.id!

    /* npm package keywords */
    for (let row of filter(proxy.npm_package_keyword, { npm_package_id })) {
      if (!pkg.keywords || !pkg.keywords.includes(row.keyword!.name)) {
        delete proxy.npm_package_keyword[row.id!]
      }
    }
    for (let name of pkg.keywords || []) {
      let keyword_id = getId(proxy.keyword, 'name', name)
      find(proxy.npm_package_keyword, { npm_package_id, keyword_id }) ||
        proxy.npm_package_keyword.push({ npm_package_id, keyword_id })
    }

    /* dependencies */
    storeDeps('prod', version.dependencies)
    storeDeps('dev', version.devDependencies)
    if (typeof version.peerDependencies != 'string') {
      storeDeps('peer', version.peerDependencies)
    }
    storeDeps('optional', version.optionalDependencies)
    function storeDeps(
      type: NpmPackageDependency['type'],
      deps: undefined | Record<string, string | null>,
    ) {
      if (!deps) {
        del(proxy.npm_package_dependency, {
          package_id: npm_package_id,
          type,
        })
        return
      }
      let names = Object.keys(deps)
      for (let row of filter(proxy.npm_package_dependency, {
        package_id: npm_package_id,
        type,
      })) {
        if (!names.includes(row.dependency!.name)) {
          delete proxy.npm_package_dependency[row.id!]
        }
      }
      for (let name of names) {
        let dependency_package_id = storeNpmPackage({ name })
        find(proxy.npm_package_dependency, {
          package_id: npm_package_id,
          dependency_id: dependency_package_id,
          type,
        }) ||
          proxy.npm_package_dependency.push({
            package_id: npm_package_id,
            dependency_id: dependency_package_id,
            type,
          })
      }
    }
  })()
}

async function collectNpmPackageDependents(page: GracefulPage, name: string) {
  let indexUrl = `https://www.npmjs.com/browse/depended/${name}?offset=0`
  return await checkNpmPackageDependents(page, indexUrl)
}

async function checkNpmPackageDependents(page: GracefulPage, indexUrl: string) {
  let response = await page.goto(indexUrl)
  if (response?.status() == 429) {
    return 'rate limited' as const
  }
  let res = await page.evaluate(() => {
    let name = document
      .querySelector('h1 a[href*="/package/"]')
      ?.getAttribute('href')
      ?.replace('/package/', '')
    if (!name) {
      for (let h3 of document.querySelectorAll('h3')) {
        if (h3.innerText == 'looks like something unexpected occurred!') {
          return 'rate limited' as const
        }
      }
      throw new Error('failed to parse package name')
    }
    let packages = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('li a[href*="/package/"]'),
      a => {
        // e.g. "/package/webpack-dev-server"
        let name = a.getAttribute('href')?.replace('/package/', '')
        if (!name)
          throw new Error('failed to parse name of npm package dependent')
        let section = a.closest('section')
        if (!section)
          throw new Error('failed to locate section of npm package dependent')
        let scope = section
          .querySelector('a[href*="/~"]')
          ?.getAttribute('href')
          ?.replace('/~', '')
        if (!scope)
          throw new Error(
            'failed to parse scope (author) of npm package dependent',
          )
        let desc =
          section.querySelector<HTMLParagraphElement>('p.lh-copy')?.innerText ||
          null
        return { scope, name, desc }
      },
    )
    let link = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/browse/depended/"]',
      ),
    ).find(a => a.textContent == 'Next Page')
    let nextHref = link?.href || null
    return { name, packages, nextHref }
  })
  if (res == 'rate limited') {
    return res
  }
  let { nextHref, packages } = res
  let indexPayload = JSON.stringify(res)
  let now = Date.now()
  db.transaction(() => {
    /* index page */
    let indexPage = find(proxy.page, { url: indexUrl })
    if (!indexPage) {
      proxy.page.push({
        url: indexUrl,
        payload: indexPayload,
        check_time: now,
        update_time: now,
      })
      storePackages()
    } else {
      indexPage.check_time = now
      if (indexPage.payload != indexPayload) {
        indexPage.payload = indexPayload
        indexPage.update_time = now
        storePackages()
      }
    }

    /* next index page */
    if (nextHref) {
      getPageId(nextHref)
    }

    function storePackages() {
      for (let pkg of packages) {
        storeNpmPackage({
          scope: pkg.scope,
          name: pkg.name,
          desc: pkg.desc,
        })
      }
    }
  })()
  if (nextHref) {
    await checkNpmPackageDependents(page, nextHref)
  }
}

let npmPackageDownloadsParser = or([
  object({
    downloads: int({ min: 0, sampleValue: 96 }),
    start: dateString({ sampleValue: '2024-03-15"' }),
    end: dateString({ sampleValue: '2024-03-21' }),
    package: string({ sampleValue: 'url-router.ts' }),
  }),
  // e.g. not-found error for private packages
  object({ error: string() }),
])

async function collectNpmPackageDownloads(npm_package: NpmPackage) {
  let page = npm_package.download_page!
  let url = page.url
  let res = await fetch(url)
  let payload = await res.text()
  // saveJSON('download.json', payload)
  let json = npmPackageDownloadsParser.parse(JSON.parse(payload))
  let now = Date.now()
  db.transaction(() => {
    /* npm download page */
    page.check_time = now
    if (page.payload == payload) return
    page.payload = payload
    if ('error' in json) return
    page.update_time = parseNpmPackageDownloadsUpdateTime(json)

    /* npm package */
    if (npm_package.weekly_downloads != json.downloads)
      npm_package.weekly_downloads = json.downloads
  })()
}

function parseNpmPackageDownloadsUpdateTime(json: {
  /** @example '2024-03-21' */
  end: string
}) {
  let parts = json.end.split('-')
  let date = new Date()
  date.setFullYear(+parts[0], +parts[1] - 1, +parts[2])
  date.setHours(0, 0, 0, 0)
  return date.getTime() + 1 * DAY
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

function fetch(url: string) {
  return fetch_retry(url, 3)
}

if (process.argv[1] == __filename) {
  main().catch(e => console.error(e))
}
