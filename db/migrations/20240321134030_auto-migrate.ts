import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repo_keyword', table => {
    table.renameColumn('tag_id', 'keyword_id')
  })
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repo_keyword', table => {
    table.renameColumn('keyword_id', 'tag_id')
  })
}
