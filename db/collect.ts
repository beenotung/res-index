import { filter, find, seedRow } from 'better-sqlite3-proxy'
import { GracefulPage } from 'graceful-playwright'
import { chromium } from 'playwright'
import { NpmPackage, proxy } from './proxy'
import { db } from './db'
import { later } from '@beenotung/tslib/async/wait'
import { array, date, dict, int, object, optional, string } from 'cast.ts'

async function main() {
  let browser = await chromium.launch({ headless: false })
  let page = new GracefulPage({ from: browser })
  await collectGithubRepositories(page, { username: 'beenotung', page: 1 })
  await collectNpmPackages(page, { scope: 'beenotung' })
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
        for (let row of filter(proxy.repo_tag, { repo_id })) {
          if (!repoData.tags.includes(row.tag!.name)) {
            delete proxy.repo_tag[row.id!]
          }
        }
        for (let tag of repoData.tags) {
          let tag_id =
            find(proxy.tag, { name: tag })?.id || proxy.tag.push({ name: tag })
          find(proxy.repo_tag, { repo_id, tag_id }) ||
            proxy.repo_tag.push({ repo_id, tag_id })
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

        /* npm package */
        let npm_package = find(proxy.npm_package, { name: pkg.name })
        if (!npm_package) {
          let id = proxy.npm_package.push({
            name: pkg.name,
            version: null,
            desc: pkg.desc,
            last_publish: null,
            weekly_downloads: null,
            unpacked_size: null,
            total_files: null,
            repository: null,
            repo_id: null,
            homepage: null,
            page_id: pkgPage.id!,
          })
          npm_package = proxy.npm_package[id]
        } else {
          if (npm_package.desc != pkg.desc) npm_package.desc = pkg.desc
        }
        /* TODO npm package keywords */
        /* TODO npm package dependencies */
      }
    }
  })()
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
        fileCount: int({ min: 1 }),
        unpackedSize: int({ min: 1 }),
      }),
    }),
  }),
  time: dict({ key: string(), value: date() }),
  description: string(),
  homepage: string(),
  keywords: array(string()),
  repository: object({
    type: string({ sampleValue: 'git' }),
    url: string({
      sampleValue: 'git+https://github.com/beenotung/better-sqlite3-schema.git',
    }),
  }),
})

async function collectNpmPackageDetail(npm_package: NpmPackage) {
  let res = await fetch(npm_package.page!.url)
  let payload = await res.text()
  let pkg = npmPackageDetailParser.parse(JSON.parse(payload))
  let now = Date.now()
  db.transaction(() => {
    let page = npm_package.page!
    page.check_time = now
    if (page.payload == payload) return
    page.payload = payload
    page.update_time = now
    let { version, publish_time } = Object.entries(pkg.time)
      .map(([version, date]) => ({
        version,
        publish_time: date.getTime(),
      }))
      .sort((a, b) => b.publish_time - a.publish_time)[0]
    if (npm_package.version != version) version
    if (npm_package.last_publish != publish_time) publish_time
    // TODO collect weekly download from another API
    // npm_package.weekly_downloads = '?'
    let versionDetail = pkg.versions[version]
    if (!versionDetail)
      throw new Error(
        `failed to find npm package version detail, name: ${npm_package.name}, version: ${version}`,
      )
    if (npm_package.unpacked_size != versionDetail.dist.unpackedSize)
      npm_package.unpacked_size = versionDetail.dist.unpackedSize
    if (npm_package.file_count != versionDetail.dist.fileCount)
      npm_package.file_count = versionDetail.dist.fileCount
    let repository = pkg.repository.url
    npm_package.repository = pkg.repository.url
    npm_package.repo_id = '?'
    npm_package.homepage = '?'
  })()
}

main().catch(e => console.error(e))
