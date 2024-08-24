import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repo', table => {
    table.index('is_public')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repo', table => {
    table.dropIndex('is_public')
  })
}
