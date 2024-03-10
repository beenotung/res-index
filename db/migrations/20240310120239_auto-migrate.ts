import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `repo` drop column `update_time`')
  await knex.raw('alter table `repo` add column `website` text null')
  await knex.raw('alter table `repo` add column `page_id` integer not null references `page`(`id`)')
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw('alter table `repo` drop column `page_id`')
  await knex.raw('alter table `repo` drop column `website`')
  await knex.raw('alter table `repo` add column `update_time` integer not null')
}
