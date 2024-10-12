import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.index('not_found_time')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.dropIndex('not_found_time')
  })
}
