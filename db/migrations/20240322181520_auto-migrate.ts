import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('author'))) {
    await knex.schema.createTable('author', table => {
      table.increments('id')
      table.text('username').notNullable().unique()
      table.timestamps(false, true)
    })
  }
  await knex.raw('alter table `repo` add column `author_id` integer not null references `author`(`id`)')
  await knex.raw('alter table `npm_package` add column `author_id` integer null references `author`(`id`)')
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw('alter table `npm_package` drop column `author_id`')
  await knex.raw('alter table `repo` drop column `author_id`')
  await knex.schema.dropTableIfExists('author')
}
