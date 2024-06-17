import { ParseResult, Parser, array, or, string } from 'cast.ts'

export let npm_keywords_parser = or([
  // e.g. npm_package "gears" use string with comma: "io, net, object, prototype, console"
  string(),
  array(
    or([
      string(),
      // e.g. npm package "@divriots/dockit-stencil" put string[][] in the keywords field
      array(string()),
    ]) as Parser<string | string[]>,
  ),
])

export function parse_npm_keywords(
  input: ParseResult<typeof npm_keywords_parser>,
): string[] {
  if (!input) return []
  if (typeof input == 'string') {
    return input.split(', ')
  }
  return input.flatMap(string_or_array => string_or_array)
}
