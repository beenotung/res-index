import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repo_keyword', table => {
    table.unique(['repo_id', 'keyword_id'])
  })
  await knex.schema.alterTable('npm_package_keyword', table => {
    table.unique(['npm_package_id', 'keyword_id'])
  })
  await knex.schema.alterTable('npm_package_dependency', table => {
    table.unique(['package_id', 'dependency_id', 'type'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repo_keyword', table => {
    table.dropUnique(['repo_id', 'keyword_id'])
  })
  await knex.schema.alterTable('npm_package_keyword', table => {
    table.dropUnique(['npm_package_id', 'keyword_id'])
  })
  await knex.schema.alterTable('npm_package_dependency', table => {
    table.dropUnique(['package_id', 'dependency_id', 'type'])
  })
}
