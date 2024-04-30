import { o } from '../jsx/jsx.js'
import SourceCode from '../components/source-code.js'
import { mapArray } from '../components/fragment.js'
import { Repo, proxy } from '../../../db/proxy.js'
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
label {
  display: block;
  width: 100%;
  text-align: end;
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
.repo-group,
.repo {
  padding: 0.25rem;
  padding-bottom: 0.5rem;
}
.repo-desc {
  margin-top: 0.25rem;
}
`)

let script = Script(/* javascript */ `
searchForm.keyword.focus()
`)

let content = (
  <div id="home">
    {style}
    <h1>FOSS Git Repository Index</h1>
    <Page />
    {script}
    <SourceCode page="home.tsx" />
  </div>
)

function Page(attrs: {}, context: DynamicContext) {
  let params = new URLSearchParams(context.routerMatch?.search)
  let action = params.get('action')
  let host = params.get('host')
  let username = params.get('username')
  let name = params.get('name')
  let prefix = params.get('prefix')

  let bindings: Record<string, string> = {}
  let bindCount = 0

  let sql = /* sql */ `
select repo.id
from repo
inner join author on author.id = repo.author_id
inner join domain on domain.id = repo.domain_id
where repo.is_public = 1
`

  if (prefix) {
    sql += /* sql */ `
  and repo.name like :prefix
`
    bindings.prefix = prefix.toLowerCase() + '%'
  }

  let qs: [string | null, string][] = [
    [host, 'domain.host'],
    [username, 'author.username'],
    [name, 'repo.name'],
  ]
  for (let [value, field] of qs) {
    if (value) {
      for (let part of value.split(' ')) {
        bindCount++
        let bind = 'b' + bindCount
        if (part[0] == '-') {
          part = part.slice(1)
          sql += /* sql */ `
  and ${field} not like :${bind}
`
        } else {
          sql += /* sql */ `
  and ${field} like :${bind}
`
        }
        bindings[bind] = '%' + part + '%'
      }
    }
  }

  // console.log(sql)
  // console.log(bindings)

  let repos = db
    .prepare(sql)
    .pluck()
    .all(bindings)
    .map((id: any) => proxy.repo[id])

  let match_count = repos.length

  type Match =
    | { type: 'repo'; repo: Repo; sortKey: string }
    | { type: 'group'; group: Group; sortKey: string }
  let matches: Match[]

  type Group = {
    prefix: string
    repos: Repo[]
  }

  let total_match_threshold = 36
  let group_match_threshold = 5
  if (match_count > total_match_threshold) {
    let prefix_length = prefix ? prefix.length + 1 : 1
    let groupDict: Record<string, Group> = {}
    for (let repo of repos) {
      let prefix = repo.name.slice(0, prefix_length).toLowerCase()
      let group = groupDict[prefix]
      if (!group) {
        group = { prefix, repos: [repo] }
        groupDict[prefix] = group
      } else {
        group.repos.push(repo)
      }
    }
    matches = Object.values(groupDict).map(group => ({
      type: 'group',
      group,
      sortKey: group.prefix.toLowerCase(),
    }))
  } else {
    matches = repos.map(repo => ({ type: 'repo', repo, sortKey: repo.name.toLowerCase() }))
  }
  matches = matches
    .flatMap((match): Match[] | Match => {
      if (
        match.type != 'group' ||
        match.group.repos.length > group_match_threshold
      )
        return match
      return match.group.repos.map(repo => ({
        type: 'repo',
        repo,
        sortKey: repo.name,
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
      prefix ? <p>Repo prefix: {prefix}*</p> : null,
      <p>{match_count} matches</p>,
      <div class="list">
        {mapArray(matches, match => {
          if (match.type == 'group') {
            let {
              group: { prefix, repos },
            } = match
            let count = repos.length
            if (count == 1) {
              return RepoItem(repos[0])
            }
            params.set('prefix', prefix)
            let href = '/?' + params
            return (
              <div class="repo-group">
                Repo pattern:{' '}
                <Link href={href}>
                  {prefix}* ({count} matches)
                </Link>
              </div>
            )
          }
          let repo = match.repo
          return RepoItem(repo)
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
      <table>
        <tbody>
          {mapArray(
            [
              [
                'Repo host',
                <input name="host" placeholder="e.g. github" value={host} />,
              ],
              [
                'Username',
                <input
                  name="username"
                  placeholder="e.g. beeno"
                  value={username}
                />,
              ],
              [
                'Repo name',
                <input
                  name="name"
                  placeholder={'e.g. "react event"'}
                  value={name}
                />,
              ],
            ],
            ([label, input]) => (
              <tr>
                <td>
                  <label>{label}: </label>
                </td>
                <td>{input}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
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

function RepoItem(repo: Repo) {
  let { desc } = repo
  return (
    <div class="repo">
      <div>
        {ProgrammingLanguageSpan(repo.programming_language?.name)}{' '}
        <b>{repo.name}</b> <sub>by {repo.author!.username}</sub>
      </div>
      <a target="_blank" href={repo.url}>
        {repo.url}
      </a>
      {desc ? <div class='repo-desc'>{desc}</div> : null}
    </div>
  )
}

// And it can be pre-rendered into html as well
// let Home = prerender(content)

export default content
