import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package_keyword', table => {
    table.unique(['keyword_id', 'npm_package_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package_keyword', table => {
    table.dropUnique(['keyword_id', 'npm_package_id'])
  })
}
