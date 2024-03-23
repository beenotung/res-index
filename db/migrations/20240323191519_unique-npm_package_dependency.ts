import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package_dependency', table => {
    table.unique(['package_id', 'dependency_id', 'type'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package_dependency', table => {
    table.dropUnique(['package_id', 'dependency_id', 'type'])
  })
}
