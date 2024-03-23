import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  await knex.raw('alter table `repo` add column `name` text not null')
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.raw('alter table `repo` drop column `name`')
}
