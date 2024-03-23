import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.renameColumn('last_publish', 'last_publish_time')
  })
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('npm_package', table => {
    table.renameColumn('last_publish_time', 'last_publish')
  })
}
