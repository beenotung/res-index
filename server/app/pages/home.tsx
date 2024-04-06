import { o } from '../jsx/jsx.js'
import { prerender } from '../jsx/html.js'
import SourceCode from '../components/source-code.js'
import { mapArray } from '../components/fragment.js'
import { Repo, proxy } from '../../../db/proxy.js'
import { DynamicContext } from '../context.js'
import Style from '../components/style.js'
import { db } from '../../../db/db.js'
import { Script } from '../components/script.js'
import { VElement } from '../../../client/jsx/types.js'
import { EarlyTerminate } from '../helpers.js'
import { ProgrammingLanguageSpan } from '../components/programming-language.js'

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
where true
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

  let matches: (
    | { type: 'repo'; repo: Repo }
    | { type: 'group'; groups: Group[] }
  )[]

  type Group = {
    prefix: string
    repos: Repo[]
  }

  let group_threshold = 5
  if (match_count > group_threshold) {
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
    let groups = Object.values(groupDict)
    matches = [{ type: 'group', group }]
  } else {
    matches = repos.map(repo => ({ type: 'repo', repo }))
  }

  let result: VElement = [
    'div#result',
    {},
    [
      <p>{match_count} matches</p>,
      <div class="list">
        {mapArray(matches, match => {
          if (match.type == 'group') {
            return [
              match.groups.map(group => {
                let count = group.repos.length
                if (count == 1) {
                  return RepoItem(group.repos[0])
                }
                return (
                  <div class="repo-group">
                    <span>Repo pattern: {group.prefix}*</span>{' '}
                    <span>({group.repos.length} matches)</span>
                  </div>
                )
              }),
            ]
          }
          let repo = match.repo
          return RepoItem(repo)
        })}
      </div>,
    ],
  ]
  if (action == 'search' && context.type == 'ws') {
    context.ws.send(['update', result])
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
  return (
    <div class="repo">
      <div>
        {ProgrammingLanguageSpan(repo.programming_language?.name)}{' '}
        <b>{repo.name}</b> <sub>by {repo.author!.username}</sub>
      </div>
      <a target="_blank" href={repo.url}>
        {repo.url}
      </a>
    </div>
  )
}

// And it can be pre-rendered into html as well
// let Home = prerender(content)

export default content
