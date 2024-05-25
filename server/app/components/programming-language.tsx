import { o } from '../jsx/jsx.js'

export function ProgrammingLanguageSpan(name: string | null) {
  if (!name) return
  let code: string
  switch (name) {
    case 'TypeScript':
      code = 'Typescript'
      break
    case 'JavaScript':
      code = 'Javascript'
      break
    default:
      code = name
      break
  }
  return (
    <>
      <span title={`Programming Language: ${name}`}>[{code}]</span>{' '}
    </>
  )
}
