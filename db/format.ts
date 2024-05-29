import { isIP } from '@beenotung/tslib/url'

let general_sites = ['github.com', 'gitlab.com', 'bitbucket.org']

export function cleanRepoUrl(url: string): string | null {
  switch (url) {
    case '-':
    case 'none':
    case 'TBC':
    case 'FIXME':
    case 'npm/security-holder':
      // e.g. npm package: typescript3 -> npm/security-holder
      return null
  }

  // e.g. "https://www.npmjs.com/package/fkww"
  if (url.startsWith('https://www.npmjs.com/')) {
    return null
  }

  // e.g. "+https://github.com/swc-project/plugins"
  if (url.startsWith('+http')) {
    url = url.substring(1)
  }

  // e.g. "hhttps://github.com/RodrigoMattosoSilveira/rms-sparklines"
  if (url.startsWith('hhttps://')) {
    url = url.substring(1)
  }

  // e.g. "lukeed/sirv"
  if (url.match(/^[\w-.]+\/[\w-.]+$/)) {
    url = 'https://github.com/' + url
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
    // e.g. "https://git@bitbucket.org/knetikmedia/splyt-sdk-js"
    .replace(/:\/\/git@/, '://')

  if (url.includes('@') && url.startsWith('https://')) {
    let parts = url.split('/')
    if (parts.length == 6 && parts[4].startsWith('@')) {
      // remove username before org name
      // e.g. "https://github.com/gozala/@multiformats/base-x"
      parts[4] = parts[4].substring(1)
      parts.splice(3, 1)
    } else if (
      parts.length == 5 &&
      parts[2].includes('@') &&
      !parts[2].startsWith('@') &&
      !parts[2].endsWith('@')
    ) {
      // remove username before hostname
      // e.g. "https://estepin@bitbucket.org/estepin/g-mfo-anket-sdk"
      parts[2] = parts[2].split('@').pop()!
    }
    url = parts.join('/')
  }

  // skip IP-based repositories
  // e.g. "http://10.70.71.36/vue/ei"
  // e.g. "git@39.105.32.169:/mnt/git/elmer-redux"
  if (
    isIP(
      url.startsWith('git@')
        ? 'http://' + url.replace('git@', '').split(':')[0]
        : url,
    )
  ) {
    return null
  }

  // skip private repositories
  if (
    (url.startsWith('http://') && url.includes(':')) ||
    url.startsWith('http://git.nrayvarz.ir')
  ) {
    return null
  }

  // e.g. "Luiz Didier/firebox-components"
  if (url.includes(' ')) {
    return null
  }

  url = url
    // e.g. "git@gitlab.beisencorp.com:ux-cnpm/calendar.git"
    .replace(/\.git$/, '')
    // e.g. "git@github.com:maleck13/readline"
    .replace(/^git@/, '')
    // e.g. "git:@github.com/acosom/node-rdkafka-acosom"
    .replace(/^git:@/, '')
    // e.g. "github:Azure/azure-sdk-for-js"
    .replace(/^github:/, 'https://github.com/')
    // e.g. "github.com:indreshvishwakarma/sync-provider"
    .replace(/^github.com:/, 'https://github.com/')
    // e.g. "gitlab.com:TemplateMonster/PlasmaPlatform/Frontend/tm-service-dummy"
    .replace(/^gitlab.com:/, 'https://gitlab.com/')
    // e.g. "htts://github.com/sandhawke/webgram-logins"
    .replace(/^htts:\/\//, 'https://')

  // e.g. "github.com/acosom/node-rdkafka-acosom"
  if (url.startsWith('github.com/') && url.split('/').length == 3) {
    url = url.replace(/github.com/, 'https://github.com/')
  }

  // e.g. "git//git.epam.com/Yaroslav_Kharchenko/jsmp"
  if (url.includes('/git.epam.com/')) {
    // skip private repository
    return null
  }

  // e.g. "gitlab.teamhologram.ninja:Hologram/holokit"
  let match = url.match(/^(gitlab\.[\w-.]+):[\w-.]+\/[\w-.]+$/)
  if (match && match[1] !== 'gitlab.com') {
    // skip private repository
    return null
  }

  // e.g. "github.com-godspeed:godspeedsystems/gs-node-service"
  match = url.match(/^(github\.[\w-.]+):[\w-.]+\/[\w-.]+$/)
  if (match && match[1] !== 'github.com') {
    // skip private repository
    return null
  }

  // e.g. "statechannels/monorepo/blob/master/packages/client-api-schema"
  if (
    url.match(/^[\w\/-]+$/) &&
    !url.includes('github') &&
    !url.includes('gitlab')
  ) {
    url = 'https://github.com/' + url
  }

  if (!url.startsWith('https://')) {
    // e.g. git over ssh?
    throw new Error('Invalid repository url: ' + url)
  }

  let parts = url.split('/')

  // e.g. "github.com/bwqdxxg/Bwqdxxg-TsLint"
  if (parts.length == 3 && general_sites.includes(parts[0])) {
    url = 'https://' + url
    parts = url.split('/')
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
