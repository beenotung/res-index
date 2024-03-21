import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tag', table => table.dropUnique(['name']))
  await knex.schema.renameTable('tag', 'keyword')
  await knex.schema.alterTable('keyword', table => table.unique(['name']))
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('keyword', table => table.dropUnique(['name']))
  await knex.schema.renameTable('keyword', 'tag')
  await knex.schema.alterTable('tag', table => table.unique(['name']))
}
