import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repo', table => {
    table.unique(['page_id'])
  })
  await knex.schema.alterTable('npm_package', table => {
    table.unique(['page_id'])
    table.unique(['download_page_id'])
  })
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.dropUnique(['download_page_id'])
    table.dropUnique(['page_id'])
  })
  await knex.schema.alterTable('repo', table => {
    table.dropUnique(['page_id'])
  })
}
