import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.index('repo_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.dropIndex('repo_id')
  })
}
