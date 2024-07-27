import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(/* sql */ `
    create index idx_checked_page on page(id) where check_time is not null
`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(/* sql */ `
    drop index idx_checked_page;
`)
}
