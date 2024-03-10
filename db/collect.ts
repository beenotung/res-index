import { filter, find, seedRow } from 'better-sqlite3-proxy'
import { GracefulPage } from 'graceful-playwright'
import { chromium } from 'playwright'
import { proxy } from './proxy'
import { db } from './db'

async function main() {
  let browser = await chromium.launch({ headless: false })
  let page = new GracefulPage({ from: browser })
  await collectGithubRepositories(
    page,
    'https://github.com/beenotung?tab=repositories',
  )
  await collectNpmPackages(page, 'beenotung', 0)
  await page.close()
  await browser.close()
  console.log('collect done.')
}

async function collectGithubRepositories(page: GracefulPage, indexUrl: string) {
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
    await collectGithubRepositories(page, res.nextUrl)
  }
}

async function collectNpmPackages(
  page: GracefulPage,
  scope: string,
  /** @description starts at zero */
  pageNum: number,
) {
  let perPage = 100
  let indexUrl = `https://www.npmjs.com/settings/${scope}/packages?page=${pageNum}&perPage=${perPage}`
  await page.goto(indexUrl)
  let packages = await page.evaluate(() => {
    return Array.from(
      document.body.querySelectorAll<HTMLAnchorElement>(
        'li section a[href*="/package/"]',
      ),
      a => {
        let url = a.href
        let section = a.closest('section')
        if (!section) {
          throw new Error('failed to find package section')
        }
        let desc = section.querySelector('p.lh-copy')?.textContent?.trim()
        return { url, desc }
      },
    )
  })
  // TODO store into DB
  // TODO go to detail page, collect repository url, homepage, weekly downloads, version, last publish, unpacked size, total files
  if (packages.length === perPage) {
    await collectNpmPackages(page, scope, pageNum + 1)
  }
}

main().catch(e => console.error(e))
