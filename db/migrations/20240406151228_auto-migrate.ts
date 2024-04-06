import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.unique(['name'])
  })
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.dropUnique(['name'])
  })
}
