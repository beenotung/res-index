import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('npm_api_log'))) {
    await knex.schema.createTable('npm_api_log', table => {
      table.increments('id')
      table.text('url').notNullable()
      table.integer('status').nullable()
      table.integer('start_time').notNullable()
      table.integer('end_time').nullable()
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('npm_api_log')
}
