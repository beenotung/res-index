import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `repo` add column `stars` integer null')
  await knex.raw('alter table `repo` add column `watchers` integer null')
  await knex.raw('alter table `repo` add column `forks` integer null')
  await knex.raw('alter table `repo` add column `readme` text null')
  await knex.raw('alter table `npm_package` add column `readme` text null')
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw('alter table `npm_package` drop column `readme`')
  await knex.raw('alter table `repo` drop column `readme`')
  await knex.raw('alter table `repo` drop column `forks`')
  await knex.raw('alter table `repo` drop column `watchers`')
  await knex.raw('alter table `repo` drop column `stars`')
}
