import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  {
    const rows = await knex.select('id', 'version').from('npm_package')
    await knex.raw('alter table `npm_package` drop column `version`')
    await knex.raw("alter table `npm_package` add column `version` text null")
    for (let row of rows) {
      await knex('npm_package').update({ version: row.version }).where({ id: row.id })
    }
  }
  {
    const rows = await knex.select('id', 'homepage').from('npm_package')
    await knex.raw('alter table `npm_package` drop column `homepage`')
    await knex.raw("alter table `npm_package` add column `homepage` text null")
    for (let row of rows) {
      await knex('npm_package').update({ homepage: row.homepage }).where({ id: row.id })
    }
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  // FIXME: alter column (npm_package.homepage) to be non-nullable not supported in sqlite
  // you may set it to be non-nullable with sqlite browser manually
  // FIXME: alter column (npm_package.version) to be non-nullable not supported in sqlite
  // you may set it to be non-nullable with sqlite browser manually
}
