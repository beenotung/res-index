import { o } from '../jsx/jsx.js'
import { Routes } from '../routes.js'
import { apiEndpointTitle, title } from '../../config.js'
import Style from '../components/style.js'
import { Context, DynamicContext, getContextFormBody } from '../context.js'
import { mapArray } from '../components/fragment.js'
import { object, string } from 'cast.ts'
import { Link, Redirect } from '../components/router.js'
import { renderError } from '../components/error.js'
import { getAuthUser } from '../auth/user.js'
import { proxy } from '../../../db/proxy.js'
import { db } from '../../../db/db.js'

let pageTitle = 'Dataset'
let addPageTitle = 'Add Dataset'

let style = Style(/* css */ `
#Dataset table {
  border-collapse: collapse;
  margin-top: 0.25rem;
  margin-bottom: 1rem;
}
#Dataset td,
#Dataset th {
  border: 1px solid black;
  padding: 0.25rem;
}
`)

let page = (
  <>
    {style}
    <div id="Dataset">
      <h1>{pageTitle}</h1>
      <Main />
    </div>
  </>
)

let items = [
  { title: 'Android', slug: 'md' },
  { title: 'iOS', slug: 'ios' },
]

let count_checked_repo = db
  .prepare<void[], number>(
    /* sql */ `
select count(*) from repo
inner join page on page.id = repo.page_id
where page.check_time is not null
`,
  )
  .pluck()

let count_checked_npm_package = db
  .prepare<void[], number>(
    /* sql */ `
select count(*) from npm_package
inner join page as npm_page on npm_page.id = npm_package.page_id
inner join page as download_page on download_page.id = npm_package.download_page_id
inner join page as dependent_page on dependent_page.id = npm_package.dependent_page_id
where npm_page.check_time is not null
  and download_page.check_time is not null
  and dependent_page.check_time is not null
`,
  )
  .pluck()

function Main(attrs: {}, context: Context) {
  return (
    <>
      <div>Indexed Resources:</div>
      <table>
        <thead>
          <tr>
            <th>type</th>
            <th>checked</th>
            <th>total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>git repo</td>
            <td>{count_checked_repo.get()!.toLocaleString()}</td>
            <td>{proxy.repo.length.toLocaleString()}</td>
          </tr>
          <tr>
            <td>npm package</td>
            <td>{count_checked_npm_package.get()!.toLocaleString()}</td>
            <td>{proxy.npm_package.length.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
      <div>Resources to be indexed:</div>
      <ul>
        <li>pypi package</li>
        <li>composer package</li>
        <li>nuget package</li>
        <li>crates package</li>
      </ul>
    </>
  )
}

let routes: Routes = {
  '/dataset': {
    title: title(pageTitle),
    description: 'TODO',
    menuText: pageTitle,
    node: page,
  },
}

export default { routes }
