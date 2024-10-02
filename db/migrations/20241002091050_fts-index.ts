import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(/* sql */ `
create virtual table repo_fts using fts5(id,name,name_rev,desc,desc_rev);
`)

  await knex.raw(/* sql */ `
create virtual table npm_package_fts using fts5(id,name,name_rev,desc,desc_rev);
`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('drop table repo_fts')
  await knex.raw('drop table npm_package_fts')
}
