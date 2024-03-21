import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('delete from `npm_package`')
  await knex.raw('alter table `npm_package` add column `download_page_id` integer not null references `page`(`id`)')
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw('alter table `npm_package` drop column `download_page_id`')
}
