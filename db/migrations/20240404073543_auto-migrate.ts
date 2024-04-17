import { Knex } from 'knex';

// prettier-ignore
export async function up(knex: Knex): Promise<void> {

  if (!(await knex.schema.hasTable('domain'))) {
    await knex.schema.createTable('domain', table => {
      table.increments('id')
      table.text('host').notNullable().unique()
      table.timestamps(false, true)
    })
  }
  await knex.raw('alter table `repo` add column `domain_id` integer null references `domain`(`id`)')
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw('alter table `repo` drop column `domain_id`')
  await knex.schema.dropTableIfExists('domain')
}
