import { del, filter, find, seedRow } from 'better-sqlite3-proxy'
import { GracefulPage } from 'graceful-playwright'
import { chromium } from 'playwright'
import { NpmPackage, proxy, NpmPackageDependency } from './proxy'
import { db } from './db'
import { later } from '@beenotung/tslib/async/wait'
import {
  array,
  date,
  dateString,
  dict,
  int,
  object,
  optional,
  string,
} from 'cast.ts'
import { writeFileSync } from 'fs'

async function main() {
  let browser = await chromium.launch({ headless: false })
  let page = new GracefulPage({ from: browser })
  // await collectGithubRepositories(page, { username: 'beenotung', page: 1 })
  // await collectNpmPackages(page, { scope: 'beenotung' })
  for (let npm_package of filter(proxy.npm_package, { last_publish: null })) {
    await collectNpmPackageDetail(npm_package)
  }
  for (let npm_package of filter(proxy.npm_package, {
    weekly_downloads: null,
  })) {
    await collectNpmPackageDownloads(npm_package)
  }
  await page.close()
  await browser.close()
  console.log('collect done.')
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
        let programming_language_id = !repoData.programming_language
          ? null
          : find(proxy.programming_language, {
              name: repoData.programming_language,
            })?.id ||
            proxy.programming_language.push({
              name: repoData.programming_language,
            })
        if (!repo) {
          let id = proxy.repo.push({
            is_fork: repoData.is_fork,
            url: repoData.url,
            desc,
            programming_language_id,
            website: null,
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
          let keyword_id =
            find(proxy.keyword, { name })?.id || proxy.keyword.push({ name })
          find(proxy.repo_keyword, { repo_id, keyword_id }) ||
            proxy.repo_keyword.push({ repo_id, keyword_id })
        }
      }
    }
  })()
  if (res.nextUrl) {
    await collectGithubRepositories(page, {
      username: options.username,
      page: options.page + 1,
    })
  }
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
        let npm_package = storeNpmPackage(pkg)
        if (npm_package.desc != pkg.desc) npm_package.desc = pkg.desc
      }
    }
  })()
}

function storeNpmPackage(pkg: { name: string }) {
  /* npm package page */
  let pkgUrl = `https://registry.npmjs.org/${pkg.name}`
  let pkgPage = find(proxy.page, { url: pkgUrl })
  if (!pkgPage) {
    let id = proxy.page.push({
      url: pkgUrl,
      payload: null,
      check_time: null,
      update_time: null,
    })
    pkgPage = proxy.page[id]
  }

  /* download trend page */
  let downloadUrl = `https://api.npmjs.org/downloads/point/last-week/${pkg.name}`
  let downloadPage = find(proxy.page, { url: downloadUrl })
  if (!downloadPage) {
    let id = proxy.page.push({
      url: downloadUrl,
      payload: null,
      check_time: null,
      update_time: null,
    })
    downloadPage = proxy.page[id]
  }

  /* npm package */
  let npm_package = find(proxy.npm_package, { name: pkg.name })
  if (!npm_package) {
    let id = proxy.npm_package.push({
      name: pkg.name,
      version: null,
      desc: null,
      create_time: null,
      last_publish: null,
      weekly_downloads: null,
      unpacked_size: null,
      file_count: null,
      repository: null,
      repo_id: null,
      homepage: null,
      page_id: pkgPage.id!,
      download_page_id: downloadPage.id!,
    })
    npm_package = proxy.npm_package[id]
  }

  return npm_package
}

let npmPackageDetailParser = object({
  name: string(),
  versions: dict({
    key: string({ sampleValue: '0.0.1' }),
    value: object({
      dependencies: optional(
        dict({
          key: string({ sampleValue: 'better-sqlite3' }),
          value: string({ sampleValue: '^7.1.0' }),
        }),
      ),
      devDependencies: optional(
        dict({
          key: string({ sampleValue: 'better-sqlite3' }),
          value: string({ sampleValue: '^7.1.0' }),
        }),
      ),
      peerDependencies: optional(
        dict({
          key: string({ sampleValue: 'better-sqlite3' }),
          value: string({ sampleValue: '^7.1.0' }),
        }),
      ),
      optionalDependencies: optional(
        dict({
          key: string({ sampleValue: 'better-sqlite3' }),
          value: string({ sampleValue: '^7.1.0' }),
        }),
      ),
      dist: object({
        fileCount: optional(int({ min: 1 })),
        unpackedSize: optional(int({ min: 1 })),
      }),
    }),
  }),
  time: dict({ key: string(), value: date() }),
  description: optional(string()),
  homepage: optional(string()),
  keywords: optional(array(string())),
  repository: optional(
    object({
      type: optional(string({ sampleValue: 'git' })),
      url: string({
        sampleValue:
          'git+https://github.com/beenotung/better-sqlite3-schema.git',
      }),
    }),
  ),
})
let packageTimeParser = object({
  modified: optional(date()),
  created: optional(date()),
})

async function collectNpmPackageDetail(npm_package: NpmPackage) {
  let page = npm_package.page!
  let url = page!.url
  let res = await fetch(url)
  let payload = await res.text()
  console.log('page:', page.id)
  let pkg = npmPackageDetailParser.parse(JSON.parse(payload))
  let now = Date.now()
  db.transaction(() => {
    /* npm package page */
    page.check_time = now
    if (page.payload == payload) return
    page.payload = payload
    page.update_time = now

    /* npm package */
    let timeList = Object.entries(pkg.time)
      .map(([version, date]) => ({
        version,
        publish_time: date.getTime(),
      }))
      .filter(item => item.version != 'modified' && item.version != 'created')
      .sort((a, b) => b.publish_time - a.publish_time)
    let { version, publish_time } = timeList[0]

    let packageTime = packageTimeParser.parse(pkg.time)
    let create_time = packageTime.created?.getTime() || null
    let modified_time = packageTime.modified?.getTime() || null

    if (npm_package.create_time != create_time)
      npm_package.create_time = create_time

    if (npm_package.last_publish != modified_time)
      npm_package.last_publish ||= modified_time

    if (npm_package.version != version) version

    if (npm_package.last_publish != publish_time) publish_time

    let versionDetail = pkg.versions[version]
    if (!versionDetail)
      throw new Error(
        `failed to find npm package version detail, name: ${npm_package.name}, version: ${version}`,
      )

    function findUnpackedSize() {
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

    let repository_url = pkg.repository?.url || null
    if (repository_url?.startsWith('git+https://')) {
      // e.g. "git+https://github.com/beenotung/better-sqlite3-schema.git"
      repository_url = repository_url.replace('git+https://', 'https://')
    } else if (repository_url?.startsWith('git://')) {
      // e.g. "git://github.com/beenotung/erlang.js.git"
      repository_url = repository_url
        .replace('git://', 'https://')
        .replace(/\.git$/, '')
    }
    if (npm_package.repository != repository_url)
      npm_package.repository = repository_url

    if (repository_url) {
      let repo = find(proxy.repo, { url: repository_url })
      if (repo && repo.id != npm_package.repo_id) {
        npm_package.repo_id = repo.id!
      }
    }

    let homepage = pkg.homepage || null
    if (npm_package.homepage != homepage) npm_package.homepage = homepage

    let npm_package_id = npm_package.id!

    /* npm package keywords */
    for (let row of filter(proxy.npm_package_keyword, { npm_package_id })) {
      if (!pkg.keywords || !pkg.keywords.includes(row.keyword!.name)) {
        delete proxy.npm_package_keyword[row.id!]
      }
    }
    for (let name of pkg.keywords || []) {
      let keyword_id =
        find(proxy.keyword, { name })?.id || proxy.keyword.push({ name })
      find(proxy.npm_package_keyword, { npm_package_id, keyword_id }) ||
        proxy.npm_package_keyword.push({ npm_package_id, keyword_id })
    }

    /* dependencies */
    storeDeps('prod', versionDetail.dependencies)
    storeDeps('dev', versionDetail.devDependencies)
    storeDeps('peer', versionDetail.peerDependencies)
    storeDeps('optional', versionDetail.optionalDependencies)
    function storeDeps(
      type: NpmPackageDependency['type'],
      deps: undefined | Record<string, string>,
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
        let dep_package = storeNpmPackage({ name })
        proxy.npm_package_dependency.push({
          package_id: npm_package_id,
          dependency_id: dep_package.id!,
          type,
        })
      }
    }
  })()
}

let npmPackageDownloadsParser = object({
  downloads: int({ min: 0, sampleValue: 96 }),
  start: dateString({ sampleValue: '2024-03-15"' }),
  end: dateString({ sampleValue: '2024-03-21' }),
  package: string({ sampleValue: 'url-router.ts' }),
})

async function collectNpmPackageDownloads(npm_package: NpmPackage) {
  let page = npm_package.download_page!
  let url = page.url
  let res = await fetch(url)
  let payload = await res.text()
  let json = npmPackageDownloadsParser.parse(JSON.stringify(payload))
  let now = Date.now()
  db.transaction(() => {
    /* npm download page */
    page.check_time = now
    if (page.payload == payload) return
    page.payload = payload
    page.update_time = now

    /* npm package */
    if (npm_package.weekly_downloads != json.downloads)
      npm_package.weekly_downloads = json.downloads
  })()
}

main().catch(e => console.error(e))
