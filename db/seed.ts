import { seedRow } from 'better-sqlite3-proxy'
import { proxy } from './proxy'
import { db } from './db'

// This file serve like the knex seed file.
//
// You can setup the database with initial config and sample data via the db proxy.

function fix_npm_detail() {
  let prefix = 'https://www.npmjs.com/package/'
  let pages = db.query(`select id, url from page where url like '${prefix}%'`)
  for (let page of pages) {
    db.update(
      'page',
      {
        url: page.url.replace(prefix, 'https://registry.npmjs.org/'),
      },
      { id: page.id },
    )
  }
}
fix_npm_detail()

function fix_npm_download() {
  let prefix = 'https://api.npmjs.org/downloads/point/last-day/'
  let pages = db.query(`select id, url from page where url like '${prefix}%'`)
  for (let page of pages) {
    db.update(
      'page',
      {
        url: page.url.replace(
          prefix,
          'https://api.npmjs.org/downloads/point/last-week/',
        ),
      },
      { id: page.id },
    )
  }
}
fix_npm_download()
