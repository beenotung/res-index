import { o } from '../jsx/jsx.js'
import SourceCode from '../components/source-code.js'
import { mapArray } from '../components/fragment.js'
import { DynamicContext } from '../context.js'
import Style from '../components/style.js'
import { db } from '../../../db/db.js'
import { Script } from '../components/script.js'
import { EarlyTerminate } from '../helpers.js'
import { ProgrammingLanguageSpan } from '../components/programming-language.js'
import { Link } from '../components/router.js'
import { nodeToVNode } from '../jsx/vnode.js'
import { Element } from '../jsx/types.js'
import { newDB } from 'better-sqlite3-schema'
import { DAY } from '@beenotung/tslib/time.js'
import { Routes } from '../routes.js'
import { prepared_statement_cache, query_cache, sql_cache } from '../cache.js'
import { compare } from '@beenotung/tslib/compare.js'
import { env } from '../../../db/env.js'
import { readFileSync, writeFileSync } from 'fs'
import { readJsonFileSync, writeJsonFileSync } from '@beenotung/tslib/fs.js'

// Calling <Component/> will transform the JSX into AST for each rendering.
// You can reuse a pre-compute AST like `let component = <Component/>`.

// If the expression is static (not depending on the render Context),
// you don't have to wrap it by a function at all.

let style = Style(/* css */ `
#searchForm label {
  display: block;
  width: 100%;
  margin: 0.25rem;
}
.hint {
  border-inline-start: 3px solid #748;
  background-color: #edf;
  padding: 1rem;
  margin: 0.5rem 0;
  width: fit-content;
}
.hint code {
  background-color: #fef;
  outline: 1px solid #aaa;
  border-radius: 0.25rem;
  padding: 0.1rem;
  display: inline-block;
}
.hide-hints .hint,
.hide-hints #hideHintsBtn
{
  display: none;
}
#showHintsBtn {
  display: none;
}
.hide-hints #showHintsBtn {
  display: block;
}
.list {
  padding: 0.25rem;
}
.res-group,
.res {
  padding: 0.25rem;
  padding-bottom: 0.5rem;
}
.res-desc {
  margin-top: 0.25rem;
}
`)

let script = Script(/* javascript */ `
function autoFocusKeyword() {
  if (searchForm?.keyword) {
    searchForm.keyword.focus()
    return
  }
  setTimeout(autoFocusKeyword, 33)
}
autoFocusKeyword()

function hideHints() {
  let hide_interval = +localStorage.getItem('hide_interval') || 0
  if (!hide_interval) {
    hide_interval = 1
  } else {
    hide_interval *= 1.5
  }
  localStorage.setItem('hide_interval', hide_interval)
  let hide_hint_until = Date.now() + hide_interval * ${DAY}
  localStorage.setItem('hide_hint_until', hide_hint_until)
  searchForm.classList.add('hide-hints')
}
function showHints() {
  localStorage.removeItem('hide_hint_until')
  localStorage.removeItem('hide_interval')
  searchForm.classList.remove('hide-hints')
}
function autoHideHints() {
  console.log('autoHideHints')
  let hide_hint_until = +localStorage.getItem('hide_hint_until')
  if (Date.now() < hide_hint_until) {
    searchForm.classList.add('hide-hints')
  }
}
autoHideHints()
`)

type SelectedRepo = {
  name: string
  desc: string | null
  url: string
  programming_language: string | null
  username: string
  is_fork: number | null
  deprecated: number | null
  host: string | null
}

let select_repo = db.prepare<void[], SelectedRepo>(/* sql */ `
select
  repo.name
, repo.desc
, repo.url
, ifnull(
    programming_language.name,
    case npm_package.has_types
      when 1 then 'Typescript'
      when 0 then 'Javascript'
    end)
  as programming_language
, author.username
, repo.is_fork
, npm_package.deprecated
, domain.host
from repo
inner join author on author.id = repo.author_id
inner join domain on domain.id = repo.domain_id
left join programming_language on programming_language.id = repo.programming_language_id
left join npm_package on npm_package.repo_id = repo.id
where repo.is_public = 1
`)

type SelectedNpmPackage = {
  name: string
  username: string
  desc: string | null
  weekly_downloads: number | null
  programming_language: string | null
  deprecated: number | null
}

let select_npm_package = db.prepare<void[], SelectedNpmPackage>(/* sql */ `
select
  npm_package.name
, author.username
, npm_package.desc
, npm_package.weekly_downloads
, case npm_package.has_types
    when 1 then 'Typescript'
    when 0 then 'Javascript'
  end as programming_language
, npm_package.deprecated
from npm_package
left join author on author.id = author_id
where repo_id is null
  and npm_package.not_found_time is null
`)

type ResItem = {
  /* for filtering */
  sortKey: string
  host: string | null
  /* for display */
  name: string
  desc: string | null
  url: string
  programming_language: string | null
  username: string
  weekly_downloads: number | null
  is_fork: number | null
  deprecated: number | null
}

let all_file = 'data/all.json'

function select_all(): ResItem[] {
  let items: ResItem[] = []

  if (env.NODE_ENV != 'export') {
    items = readJsonFileSync(all_file)
    if (!(items.length > 0)) {
      throw new Error('missing data in file: ' + all_file)
    }
    return items
  }

  let repos = select_repo.all()
  for (let repo of repos) {
    items.push(
      Object.assign(repo, {
        weekly_downloads: null,
        sortKey: repo.name.toLowerCase(),
      }),
    )
  }

  let npm_packages = select_npm_package.all()
  for (let npm_package of npm_packages) {
    items.push(
      Object.assign(npm_package, {
        url: `https://www.npmjs.com/package/${npm_package.name}`,
        is_fork: null,
        sortKey: npm_package.name.toLowerCase(),
        host: 'www.npmjs.com',
      }),
    )
  }

  return items
}

let allItems = select_all()
allItems.sort((a, b) => compare(a.sortKey, b.sortKey))

function remove_unused_items() {
  allItems = allItems.filter(item => {
    if (item.name == '-' || item.name == '~') {
      return false
    }
    return true
  })
}

remove_unused_items()

if (env.NODE_ENV == 'export' && import.meta.filename == process.argv[1]) {
  writeJsonFileSync(all_file, allItems)
}

function build_search_query(params: URLSearchParams) {
  let action = params.get('form_action')
  let host = params.get('host')
  let username = params.get('username')
  let name = params.get('name')
  let language = params.get('language')
  let desc = params.get('desc')
  let prefix = params.get('prefix')

  let matchedItems = allItems

  let skip_npm = false
  if (host) {
    let include_npm = false
    let include_other = false
    for (let part of host.split(' ')) {
      part = part.trim()
      if (!part) continue
      if (part.startsWith('-npm')) {
        skip_npm = true
        break
      }
      if (part.startsWith('npm')) {
        include_npm = true
        continue
      }
      include_other = true
    }
    skip_npm ||= include_other && !include_npm
  }

  function search() {
    if (prefix) {
      let pattern = prefix.toLowerCase()
      matchedItems = matchedItems.filter(item =>
        item.sortKey.startsWith(pattern),
      )
    }

    searchField(host, item => item.host)
    searchField(username, item => item.username)
    searchField(name, item => item.name)
    searchField(desc, item => item.desc)

    searchLanguage()

    return matchedItems
  }

  function searchField(
    value: string | null | undefined,
    viewFn: (item: ResItem) => string | null,
  ) {
    if (!value) return
    for (let part of value.split(' ')) {
      part = part.trim()
      if (!part) continue

      let not = part[0] == '-'
      if (not) {
        part = part.slice(1)
      }

      let full = part.startsWith('"') && part.endsWith('"')
      if (full) {
        part = part.slice(1, -1)
      }

      part = part.toLowerCase()

      matchedItems = matchedItems.filter(item => {
        let value = viewFn(item)?.toLowerCase()
        let matched = full ? value == part : value && value.includes(part)
        return not ? !matched : matched
      })
    }
  }

  function searchLanguage() {
    if (language) {
      let positive_languages: string[] = []
      let negative_languages: string[] = []
      for (let name of language.split(' ')) {
        if (!name) continue

        let target: string[]
        let not = name[0] == '-'
        if (not) {
          name = name.slice(1)
          target = negative_languages
        } else {
          target = positive_languages
        }

        name = name.toLowerCase()
        if (name == 'js') {
          name = 'javascript'
        } else if (name == 'ts') {
          name = 'typescript'
        }

        target.push(name)
      }
      if (positive_languages.length > 0) {
        matchedItems = matchedItems.filter(item =>
          positive_languages.includes(
            (item.programming_language || '').toLowerCase(),
          ),
        )
      }
      if (negative_languages.length > 0) {
        matchedItems = matchedItems.filter(
          item =>
            !negative_languages.includes(
              (item.programming_language || '').toLowerCase(),
            ),
        )
      }
    }
  }

  return {
    search,
    skip_npm,
    /* from params */
    action,
    host,
    username,
    name,
    language,
    desc,
    prefix,
  }
}

function Page(attrs: {}, context: SearchContext) {
  let { params, query } = context
  let { prefix } = query

  let matchedItems = query.search()
  let match_count = matchedItems.length

  let languageCounts: Record<string, number> = {}
  for (let item of matchedItems) {
    let name = item.programming_language
    if (!name) continue
    let count = languageCounts[name] || 0
    languageCounts[name] = count + 1
  }
  let languageOptions = mapArray(
    Object.entries(languageCounts).sort((a, b) => b[1] - a[1]),
    ([name, count]) => (
      <option value={name}>
        {name} ({count})
      </option>
    ),
  )

  type Match =
    | { type: 'item'; item: ResItem; sortKey: string }
    | { type: 'group'; group: Group; sortKey: string }
  let matches: Match[]

  type Group = {
    prefix: string
    resItems: ResItem[]
  }

  let total_match_threshold = 36
  let group_match_threshold = 5
  if (match_count > total_match_threshold) {
    let prefix_length = prefix ? prefix.length + 1 : 1
    let groupDict: Record<string, Group> = {}
    for (let repo of matchedItems) {
      let prefix = repo.name.slice(0, prefix_length).toLowerCase()
      let group = groupDict[prefix]
      if (!group) {
        group = { prefix, resItems: [repo] }
        groupDict[prefix] = group
      } else {
        group.resItems.push(repo)
      }
    }
    matches = Object.values(groupDict).map(group => ({
      type: 'group',
      group,
      sortKey: group.prefix.toLowerCase(),
    }))
  } else {
    matches = matchedItems.map(item => ({
      type: 'item',
      item,
      sortKey: item.name.toLowerCase(),
    }))
  }
  matches = matches
    .flatMap((match): Match[] | Match => {
      if (
        match.type != 'group' ||
        match.group.resItems.length > group_match_threshold
      )
        return match
      return match.group.resItems.map(item => ({
        type: 'item',
        item,
        sortKey: item.name,
      }))
    })
    .sort((a, b) => {
      if (a.type == 'group' && b.type != 'group') return +1
      if (a.type != 'group' && b.type == 'group') return -1
      if (a.sortKey < b.sortKey) return -1
      if (a.sortKey > b.sortKey) return +1
      return 0
    })

  let result: Element = [
    'div#result',
    {},
    [
      <p id="loadingMessage"></p>,
      prefix ? <p>repo/package prefix: {prefix}*</p> : null,
      <p>{match_count.toLocaleString()} matches</p>,
      <div class="list">
        {mapArray(matches, match => {
          if (match.type == 'item') {
            return MatchedItem(match.item)
          }
          let {
            group: { prefix, resItems: repos },
          } = match
          let count = repos.length
          if (count == 1) {
            return MatchedItem(repos[0])
          }
          params.set('prefix', prefix)
          let href = '/?' + params
          return (
            <div class="res-group">
              <Link href={href}>pattern: {prefix}*</Link> ({count} matches)
            </div>
          )
        })}
      </div>,
    ],
  ]
  if (query.action == 'search' && context.type == 'ws') {
    context.ws.send(['update', nodeToVNode(result, context)])
    context.ws.send([
      'update-in',
      '#languageSelect',
      nodeToVNode(languageOptions, context),
    ])
    throw EarlyTerminate
  }
  return (
    <form
      id="searchForm"
      data-trim-empty
      onsubmit="emitForm(event); loadingMessage.textContent='searching...'"
    >
      <input name="form_action" value="search" hidden />
      <label>
        Repo Host:{' '}
        <input name="host" placeholder="e.g. npmjs" value={query.host} />
      </label>
      <label>
        Username:{' '}
        <input
          name="username"
          placeholder="e.g. beeno"
          value={query.username}
        />
      </label>
      <label>
        Repo/Package name:{' '}
        <input
          name="name"
          placeholder={'e.g. react event'}
          value={query.name}
        />
      </label>
      <label style="width: fit-content">
        Programming Languages:{' '}
        <input
          name="language"
          placeholder={'e.g. typescript javascript'}
          value={query.language}
        />
        <br />
        <details>
          <summary>Counts by language</summary>
          <select
            style="width: 100%;"
            multiple
            oninput="searchForm.language.value=Array.from(this.selectedOptions,option=>option.value).join(' ')"
            id="languageSelect"
          >
            {languageOptions}
          </select>
        </details>
      </label>
      <label>
        Description:{' '}
        <input name="desc" placeholder={'e.g. 倉頡'} value={query.desc} />
      </label>
      <input type="submit" value="Search" />
      <div style="margin-top: 0.5rem">
        <button
          type="button"
          id="hideHintsBtn"
          onclick="hideHints()"
          title="Hide hints for 24 hours"
        >
          Hide Hints
        </button>
        <button type="button" id="showHintsBtn" onclick="showHints()">
          Show Hints
        </button>
      </div>
      <p class="hint">
        Hint: you can search by multiple keywords, separated by space, e.g.{' '}
        <code>react event</code> as searching for repos containing{' '}
        <code>react</code> and <code>event</code> in the name (appearing any
        order).
      </p>
      <p class="hint">
        Hint: you can indicate negative keywords with hyphen prefix, e.g.{' '}
        <code>-react -ng- chart</code> as searching for <code>chart</code>{' '}
        libraries while excluding those framework-specific libraries having{' '}
        <code>react</code> or <code>ng-</code> in the name.
      </p>
      <p class="hint">
        Hint: multiple keywords are combined with "and" for most fields, but
        they're combined with "or" for programming languages.
      </p>
      <p class="hint">
        Hint: the keyboards are matched partially for most fields, but is
        matched exactly for programming languages. So searching{' '}
        <code>Java</code> will not match <code>Javascript</code> repos.
      </p>
      <p class="hint">
        Hint: if a keyword is wrapped with double quotes, it is matched in full.
        For example searching <code>speed</code> will matched for{' '}
        <code>frank-dspeed</code> but searching <code>"speed"</code> will not
        match for that user. This feature does not apply to the language field
        as it's always matched in full.
      </p>
      {result}
    </form>
  )
}

function MatchedItem(res: ResItem) {
  let { desc, programming_language } = res
  return (
    <div class="res">
      <div>
        {ProgrammingLanguageSpan(programming_language)}
        <b>{res.name}</b> {res.deprecated ? <span>(deprecated)</span> : null}{' '}
        {res.username ? <sub>by {res.username}</sub> : null}{' '}
        {res.is_fork ? <sub>(fork)</sub> : null}{' '}
      </div>
      <a target="_blank" href={res.url}>
        {res.url}
      </a>
      {desc ? <div class="res-desc">{desc}</div> : null}
    </div>
  )
}

function build_search_query_test() {
  allItems = []

  function seedRepo(id: number, url: string, programming_language: string) {
    // e.g. [ 'https:', '', 'github.com', 'beenotung', 'create-ts-liveview' ]
    let parts = url.split('/')
    let host = parts[2]
    let username = parts[3]
    let name = parts[4]
    let item: ResItem = {
      name,
      desc: null,
      url,
      programming_language,
      username,
      is_fork: null,
      deprecated: null,
      host,
      sortKey: name.toLowerCase(),
      weekly_downloads: null,
    }
    allItems.push(item)
    return item
  }
  let samples = [
    seedRepo(
      1,
      'https://github.com/beenotung/create-ts-liveview',
      'Javascript',
    ),
    seedRepo(2, 'https://github.com/beenotung/ts-liveview', 'Typescript'),
    seedRepo(
      3,
      'https://github.com/beenotung/better-sqlite3-proxy',
      'Typescript',
    ),
    seedRepo(4, 'https://github.com/beenotung/net-files', 'HTML'),
    seedRepo(5, 'https://github.com/beenotung/safepic', 'HTML'),
    seedRepo(6, 'https://github.com/beenotung/ga-experiment', 'Java'),
    seedRepo(7, 'https://github.com/beenotung/vue-datepicker', 'Vue'),
    seedRepo(8, 'https://github.com/beenotung/sodoku', 'C'),
    seedRepo(9, 'https://github.com/beenotung/fair-task-pool', 'Typescript'),
    seedRepo(10, 'https://github.com/valor-software/ng2-charts', 'Typescript'),
    seedRepo(11, 'https://github.com/help-me-mom/ng-mocks', 'Typescript'),
    seedRepo(12, 'https://github.com/DethAriel/ng-recaptcha', 'Typescript'),
  ]

  function testLanguage(name: string, language: string, expected: any[]) {
    name = `[Language TestSuit] ${name}`
    let params = new URLSearchParams({ language })
    test(name, params, expected)
  }
  function testName(name: string, repoName: string, expected: any[]) {
    name = `[Name TestSuit] ${name}`
    let params = new URLSearchParams({ name: repoName })
    test(name, params, expected)
  }
  function test(name: string, params: URLSearchParams, expected: any[]) {
    let query = build_search_query(params)

    let actual = query.search()

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      console.error('[fail]', name, {
        expected,
        actual,
      })
      process.exit(1)
    }
    console.log('[pass]', name)
  }
  testLanguage('empty query', '', samples)
  testLanguage(
    'single positive language',
    'Typescript',
    samples.filter(repo => repo.programming_language == 'Typescript'),
  )
  testLanguage(
    'multiple positive languages',
    'Typescript Javascript',
    samples.filter(
      repo =>
        repo.programming_language == 'Typescript' ||
        repo.programming_language == 'Javascript',
    ),
  )
  testLanguage(
    'single negative language',
    '-Javascript',
    samples.filter(repo => repo.programming_language != 'Javascript'),
  )
  testLanguage(
    'multiple negative languages',
    '-Typescript -Javascript -Java',
    samples.filter(
      repo =>
        repo.programming_language != 'Typescript' &&
        repo.programming_language != 'Javascript' &&
        repo.programming_language != 'Java',
    ),
  )
  testLanguage(
    'mixed positive and negative languages',
    'Typescript -Javascript',
    samples.filter(repo => repo.programming_language == 'Typescript'),
  )
  testName(
    'single keyword',
    'ga',
    samples.filter(repo => repo.name.includes('ga')),
  )
  testName(
    'multiple keywords',
    'net files',
    samples.filter(
      repo => repo.name.includes('net') && repo.name.includes('files'),
    ),
  )
  testName(
    'negative keyword',
    '-ng',
    samples.filter(repo => !repo.name.includes('ng')),
  )
  testName(
    'positive keyword with hyphen suffix',
    'ng-',
    samples.filter(repo => repo.name.includes('ng-')),
  )
  testName(
    'negative keyword with hyphen suffix',
    '-ng-',
    samples.filter(repo => !repo.name.includes('ng-')),
  )
  testName(
    'multiple keywords with hyphen suffix (continue)',
    'ng- mock',
    samples.filter(
      repo => repo.name.includes('ng-') && repo.name.includes('mock'),
    ),
  )
  testName(
    'multiple keywords with hyphen suffix (separated)',
    'fair- pool',
    samples.filter(
      repo => repo.name.includes('fair-') && repo.name.includes('pool'),
    ),
  )
  console.log('all passed')
}
if (env.NODE_ENV != 'export' && process.argv[1] == import.meta.filename) {
  build_search_query_test()
}

// And it can be pre-rendered into html as well
// let Home = prerender(content)

type SearchContext = DynamicContext & {
  params: URLSearchParams
  query: ReturnType<typeof build_search_query>
}

let content = (
  <div id="home">
    {style}
    <h1>FOSS Git Repository & NPM Package Index</h1>
    <Page />
    {script}
    <SourceCode page="home.tsx" />
  </div>
)

let routes = {
  '/': {
    menuText: 'Search',
    resolve(context) {
      let params = new URLSearchParams(context.routerMatch?.search)
      let query = build_search_query(params)

      let ctx = context as SearchContext
      ctx.params = params
      ctx.query = query

      function getTitle() {
        let acc = ''

        function add(text: string | null): void {
          if (!text) return
          if (acc) {
            acc += ' '
          }
          acc += text
        }

        add(query.desc)
        add(query.name || (acc ? 'resources' : 'Resources'))
        if (query.prefix) {
          add(`(${query.prefix}*)`)
        }
        if (query.language) {
          add('in ' + query.language)
        }
        if (query.host) {
          add('on ' + query.host)
        }
        if (query.username) {
          add('by ' + query.username)
        }

        return acc.trim()
      }

      return {
        title: getTitle() + ' | FOSS Git Repositories & NPM Packages',
        description:
          'Getting Started with ts-liveview - a server-side rendering realtime webapp framework with progressive enhancement',
        node: content,
      }
    },
  },
} satisfies Routes

export default { routes }
