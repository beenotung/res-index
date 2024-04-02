import { o } from '../jsx/jsx.js'
import { prerender } from '../jsx/html.js'
import SourceCode from '../components/source-code.js'
import { mapArray } from '../components/fragment.js'
import { proxy } from '../../../db/proxy.js'
import { DynamicContext } from '../context.js'
import Style from '../components/style.js'
import { db } from '../../../db/db.js'
import { Script } from '../components/script.js'
import { VElement } from '../../../client/jsx/types.js'
import { EarlyTerminate } from '../helpers.js'

// Calling <Component/> will transform the JSX into AST for each rendering.
// You can reuse a pre-compute AST like `let component = <Component/>`.

// If the expression is static (not depending on the render Context),
// you don't have to wrap it by a function at all.

let style = Style(/* css */ `
.list {
  padding: 0.25rem;
}
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

let select_repo = db
  .prepare(
    /* sql */ `
select id from repo
where name like :keyword
`,
  )
  .pluck()

function Page(attrs: {}, context: DynamicContext) {
  let params = new URLSearchParams(context.routerMatch?.search)
  let keyword = params.get('keyword') || ''
  let repos = select_repo
    .all({ keyword: '%' + keyword + '%' })
    .map((id: any) => proxy.repo[id])
  let result: VElement = [
    'div#result',
    {},
    [
      <p>{repos.length} matches</p>,
      <div class="list">
        {mapArray(repos, repo => (
          <div class="repo">
            <div>
              <b>{repo.name}</b> <sub>by {repo.author!.username}</sub>
            </div>
            <a target="_blank" href={repo.url}>
              {repo.url}
            </a>
          </div>
        ))}
      </div>,
    ],
  ]
  if (context.type == 'ws') {
    context.ws.send(['update', result])
    throw EarlyTerminate
  }
  return (
    <form onsubmit="emitForm(event)" id="searchForm">
      <label>
        Keyword: <input name="keyword" value={keyword} />
      </label>{' '}
      <input type="submit" value="Search" />
      {result}
    </form>
  )
}

// And it can be pre-rendered into html as well
// let Home = prerender(content)

export default content
