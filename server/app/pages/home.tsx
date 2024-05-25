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
searchForm.keyword.focus()
`)

let content = (
  <div id="home">
    {style}
    <h1>FOSS Git Repository & NPM Package Index</h1>
    <Page />
    {script}
    <SourceCode page="home.tsx" />
  </div>
)

type MatchedNpmPackage = {
  name: string
  username: string
  desc: string | null
  weekly_downloads: number | null
  has_types: boolean | null
  deprecated: number | null
}

type MatchedItem = {
  name: string
  desc: string | null
  url: string
  programming_language: string | null
  username: string
  weekly_downloads: number | null
  is_fork: number | null
  deprecated: number | null
}

function Page(attrs: {}, context: DynamicContext) {
  let params = new URLSearchParams(context.routerMatch?.search)
  let action = params.get('action')
  let host = params.get('host')
  let username = params.get('username')
  let name = params.get('name')
  let prefix = params.get('prefix')

  let search_repo_bindings: Record<string, string> = {}
  let search_repo_bind_count = 0

  let search_npm_package_bindings: Record<string, string> = {}
  let search_npm_package_bind_count = 0

  let search_repo_sql = /* sql */ `
select
  repo.name
, repo.desc
, repo.url
, programming_language.name as programming_language
, author.username
, repo.is_fork
, npm_package.deprecated
from repo
inner join author on author.id = repo.author_id
inner join domain on domain.id = repo.domain_id
left join programming_language on programming_language.id = repo.programming_language_id
left join npm_package on npm_package.repo_id = repo.id
where repo.is_public = 1
`

  let search_npm_package_sql = /* sql */ `
select
  npm_package.name
, author.username
, npm_package.desc
, npm_package.weekly_downloads
, npm_package.has_types
, npm_package.deprecated
from npm_package
left join author on author.id = author_id
where repo_id is null
`

  if (prefix) {
    search_repo_sql += /* sql */ `
  and repo.name like :prefix
`
    search_npm_package_sql += /* sql */ `
  and npm_package.name like :prefix
`
    search_repo_bindings.prefix = prefix.toLowerCase() + '%'
    search_npm_package_bindings.prefix = prefix.toLowerCase() + '%'
  }

  // add bindings for search_repo
  let qs: [string | null, string][] = [
    [host, 'domain.host'],
    [username, 'author.username'],
    [name, 'repo.name'],
  ]
  for (let [value, field] of qs) {
    if (value) {
      for (let part of value.split(' ')) {
        part = part.trim()
        if (!part) continue
        search_repo_bind_count++
        let bind = 'b' + search_repo_bind_count
        if (part[0] == '-') {
          part = part.slice(1)
          search_repo_sql += /* sql */ `
  and ${field} not like :${bind}
`
        } else {
          search_repo_sql += /* sql */ `
  and ${field} like :${bind}
`
        }
        search_repo_bindings[bind] = '%' + part + '%'
      }
    }
  }

  // add bindings for search_npm_package
  qs = [
    [username, 'author.username'],
    [name, 'npm_package.name'],
  ]
  for (let [value, field] of qs) {
    if (value) {
      for (let part of value.split(' ')) {
        search_npm_package_bind_count++
        let bind = 'b' + search_npm_package_bind_count
        if (part[0] == '-') {
          part = part.slice(1)
          search_npm_package_sql += /* sql */ `
  and ${field} not like :${bind}
`
        } else {
          search_npm_package_sql += /* sql */ `
  and ${field} like :${bind}
`
        }
        search_npm_package_bindings[bind] = '%' + part + '%'
      }
    }
  }
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

  let matchedItems = db
    .prepare<{}, MatchedItem>(search_repo_sql)
    .all(search_repo_bindings)

  let matchedPackages = skip_npm
    ? []
    : db
        .prepare<{}, MatchedNpmPackage>(search_npm_package_sql)
        .all(search_npm_package_bindings)
  for (let npm_package of matchedPackages) {
    // FIXME move to render part to avoid bug when collapsed into prefix pattern?
    let { name, username, has_types } = npm_package
    if (!username && name.startsWith('@')) {
      username = name.split('/')[0].substring(1)
      npm_package.username = username
    }
    if (name.startsWith('@' + username)) {
      name = name.substring(username.length + 2)
    }
    matchedItems.push({
      name,
      desc: npm_package.desc,
      url: `https://www.npmjs.com/package/${npm_package.name}`,
      programming_language:
        has_types == true
          ? 'Typescript'
          : has_types == false
            ? 'Javascript'
            : null,
      username,
      weekly_downloads: npm_package.weekly_downloads,
      is_fork: null,
      deprecated: npm_package.deprecated,
    })
  }

  let match_count = matchedItems.length

  type Match =
    | { type: 'item'; item: MatchedItem; sortKey: string }
    | { type: 'group'; group: Group; sortKey: string }
  let matches: Match[]

  type Group = {
    prefix: string
    resItems: MatchedItem[]
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
      prefix ? <p>repo/package prefix: {prefix}*</p> : null,
      <p>{match_count} matches</p>,
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
  if (action == 'search' && context.type == 'ws') {
    context.ws.send(['update', nodeToVNode(result, context)])
    throw EarlyTerminate
  }
  return (
    <form onsubmit="emitForm(event)" id="searchForm">
      <input name="action" value="search" hidden />
      <label>
        Repo Host: <input name="host" placeholder="e.g. npmjs" value={host} />
      </label>
      <label>
        Username:{' '}
        <input name="username" placeholder="e.g. beeno" value={username} />
      </label>
      <label>
        Repo/Package name:{' '}
        <input name="name" placeholder={'e.g. react event'} value={name} />
      </label>
      <input type="submit" value="Search" />
      <p class="hint">
        Hint: you can search by multiple keywords, separated by space, e.g.
        "react event" as searching for repos containing "react" and "event" in
        the name (appearing any order).
      </p>
      <p class="hint">
        Hint: you can indicate negative keywords with hyphen prefix, e.g.
        "-react -ng- chart" as searching for "chart" libraries while excluding
        those framework-specific libraries having "react" or "ng-" in the name.
      </p>
      {result}
    </form>
  )
}

function MatchedItem(res: MatchedItem) {
  let { desc, programming_language } = res
  return (
    <div class="res">
      <div>
        {programming_language
          ? ProgrammingLanguageSpan(programming_language)
          : null}
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

// And it can be pre-rendered into html as well
// let Home = prerender(content)

export default content
