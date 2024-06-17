import assert from 'assert'
import { parse_npm_keywords } from './npm_keywords'
import test from 'node:test'

test('parse string with comma', () => {
  let comma_string = 'io, net, object, prototype, console'
  assert.deepEqual(parse_npm_keywords(comma_string), comma_string.split(', '))
})
