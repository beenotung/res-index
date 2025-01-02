import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.schema.renameTable('npm_api_log', 'collect_api_log')
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.renameTable('collect_api_log', 'npm_api_log')
}
