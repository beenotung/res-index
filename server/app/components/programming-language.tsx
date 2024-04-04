import { o } from '../jsx/jsx.js'

export function ProgrammingLanguageSpan(name: string | undefined) {
  let code: string
  switch (name) {
    case undefined:
      return
    case 'Typescript':
      code = 'TS'
      break
    case 'Javascript':
      code = 'JS'
      break
    default:
      code = name
      break
  }
  return <span title={`Programming Language: ${name}`}>[{code}]</span>
}
