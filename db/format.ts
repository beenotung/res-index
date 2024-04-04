export function cleanRepoUrl(url: string): string | null {
  if (url == 'TBC') {
    return null
  }

  url = url
    .replace(/\/^/, '')
    .replace(/\.git$/, '')
    // e.g. "git+https://github.com/beenotung/better-sqlite3-schema.git"
    .replace(/^git\+https:\/\//, 'https://')
    // e.g. "git://github.com/beenotung/erlang.js.git"
    .replace(/^git:\/\//, 'https://')
    // e.g. "git+ssh://git@github.com/beenotung/http-deceiver"
    .replace(/^git\+ssh:\/\/git@/, 'https://')
    // e.g. "ssh://git@github.com/yarnpkg/berry"
    .replace(/^ssh:\/\/git@/, 'https://')
    // e.g. "http://github.com/jprichardson/terst"
    .replace(/^http:\/\/github.com\//, 'https://github.com/')

  // e.g. "git@github.com:maleck13/readline"
  let match = url.match(/^git@(.*):(.*)/)
  if (match) {
    url = 'https://' + match[1] + '/' + match[2]
  }

  if (!url.startsWith('https://')) {
    // e.g. git over ssh?
    throw new Error('Invalid repository url: ' + url)
  }

  let parts = url.split('/')

  // e.g. "https://developers.reddit.com/"
  if (parts.length < 5) {
    return null
  }

  // e.g. "https://th-adcc.visualstudio.com/Zenith/_git/zenith-common"
  if (parts[2].endsWith('visualstudio.com')) {
    // skip private repositories
    return null
  }

  // e.g. "https://github.com/azawakh/twsh/issue"
  // e.g. "https://github.com/citelab/JAMScript/lib/jdiscovery"
  if (url.startsWith('https://github.com/')) {
    while (parts.length > 5) {
      parts.pop()
    }
  }

  // e.g. "https://gitlab.com/plade/sdks/js"
  // e.g. "https://git.reyah.ga/reyah/libraries/reyah-oauth-provider"
  if (parts.length > 5) {
    // throw new Error('Invalid repository url: ' + url)
  }

  url = parts.join('/')
  return url
}

export function parseRepoUrl(url: string) {
  // e.g. [ 'https:', '', 'github.com', 'beenotung', 'zstd.ts' ]
  // e.g. [ 'https:', '', 'gitlab.com', 'plade', 'sdks', 'js' ]
  let parts = url.split('/')
  let host = parts[2]
  let username = parts[3]
  let name = parts.slice(4).join('/')
  return { host, username, name }
}
