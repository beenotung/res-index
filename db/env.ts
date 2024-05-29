import { config } from 'dotenv'
import { populateEnv } from 'populate-env'

config()

export let env = {
  NODE_ENV: 'development',
}

populateEnv(env, { mode: 'halt' })
