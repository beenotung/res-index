import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('npm_package'))) {
    await knex.schema.createTable('npm_package', table => {
      table.increments('id')
      table.text('name').notNullable()
      table.text('version').notNullable()
      table.text('desc').nullable()
      table.integer('last_publish').nullable()
      table.integer('weekly_downloads').nullable()
      table.text('unpacked_size').nullable()
      table.integer('total_files').nullable()
      table.integer('issues').nullable()
      table.integer('pull_requests').nullable()
      table.text('repository').nullable()
      table.integer('repo_id').unsigned().nullable().references('repo.id')
      table.text('homepage').notNullable()
      table.integer('page_id').unsigned().notNullable().references('page.id')
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('npm_package')
}
