import { isIP } from '@beenotung/tslib/url'

let general_sites = ['github.com', 'gitlab.com', 'bitbucket.org']

export function cleanRepoUrl(url: string): string | null {
  switch (url) {
    case 'TBC':
    case 'FIXME':
    case 'npm/security-holder':
      // e.g. npm package: typescript3 -> npm/security-holder
      return null
  }

  // e.g. npm package: "post-or-save-package"
  if (url == 'git+') {
    return null
  }

  // e.g. 'git clone https://services.sungard.com/git/scm/~ricky.casey/cio-mobile-app'
  if (url.startsWith('git clone ')) {
    url = url.substring('git clone '.length)
  }

  // skip general site without repository name
  // e.g. 'gitlab.com'
  if (general_sites.includes(url)) {
    return null
  }

  // fix protocol part
  url = url
    .replace(/\/^/, '')
    .replace(/\.git$/, '')
    // e.g. "git+https://github.com/beenotung/better-sqlite3-schema.git"
    .replace(/^git\+https:\/\//, 'https://')
    // e.g. "git+http://git.nrayvarz.ir/and-official/rayvarz/eoffice/rayflmc"
    .replace(/^git\+http:\/\//, 'http://')
    // e.g. "git://github.com/beenotung/erlang.js.git"
    .replace(/^git:\/\//, 'https://')
    // e.g. "git+ssh://git@github.com/beenotung/http-deceiver"
    .replace(/^git\+ssh:\/\/git@/, 'https://')
    // e.g. "ssh://git@github.com/yarnpkg/berry"
    .replace(/^ssh:\/\/git@/, 'https://')
    // e.g. "http://github.com/jprichardson/terst"
    .replace(/^http:\/\/github.com\//, 'https://github.com/')

  // skip IP-based repositories
  // e.g. "http://10.70.71.36/vue/ei"
  if (isIP(url)) {
    return null
  }

  // skip private repositories
  if (
    (url.startsWith('http://') && url.includes(':')) ||
    url.startsWith('http://git.nrayvarz.ir')
  ) {
    return null
  }

  // e.g. "git@github.com:maleck13/readline"
  // e.g. "git@gitlab.beisencorp.com:ux-cnpm/calendar.git"
  let match = url.replace(/\.git$/, '').match(/^git@(.*):(.*)/)
  if (match) {
    url = 'https://' + match[1] + '/' + match[2]
  }

  // e.g. "github:Azure/azure-sdk-for-js"
  if (url.startsWith('github:')) {
    url = url.replace('github:', 'https://github.com/')
  }

  let parts = url.split('/')

  // e.g. "github.com/bwqdxxg/Bwqdxxg-TsLint"
  if (parts.length == 3 && general_sites.includes(parts[0])) {
    url = 'https://' + url
    parts = url.split('/')
  }

  if (!url.startsWith('https://')) {
    // e.g. git over ssh?
    throw new Error('Invalid repository url: ' + url)
  }

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

  // skip author page
  // e.g. "https://github.com/textioHQ/"
  if (!parts[4]) {
    return null
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
