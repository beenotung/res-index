import { proxy } from './proxy'
import { filter, find, notNull } from 'better-sqlite3-proxy'

export function cleanRepoUrl(url: string | null): string | null {
  if (!url) return null

  url = remove_suffix(url, ')')

  url = url.trim()
  if (url.length <= 1) return null

  switch (url) {
    case 'TBC':
    case 'FIXME':
    case 'npm/security-holder':
    case 'none':
      return null
  }

  // skip non-git urls
  // e.g. "keybase://team/blockades.cobox/cobox-crypto"
  if (url.startsWith('keybase://')) {
    return null
  }

  // e.g. "//github.com/synedra/astra-setup"
  url = url.replace(/^\/\/github.com\//, 'https://github.com/')

  // e.g. "https: //github.com/FredrikOseberg/react-util-kit"
  url = url.replace(/^https: /, 'https:')

  // e.g. "https ://github.com/Wandalen/wDocParser"
  url = url.replace(/^https :\/\//, 'https://')

  // e.g. "htttps://github.com/archisdi/zuu"
  url = url.replace(/^htttps:/, 'https:')

  // e.g. "git@github.com:https://github.com/LambdaIM/HdkeyJs"
  url = url.replace(/.+https:\/\//, 'https://')

  // e.g. "git clone https://services.sungard.com/git/scm/~ricky.casey/cio-mobile-app"
  url = remove_prefix(url, 'git clone ')

  // e.g. "+https://github.com/swc-project/plugins"
  url = remove_prefix(url, '+')

  // e.g. "git+https://github.com/beenotung/tslib.git"
  url = remove_prefix(url, 'git+')

  // e.g. "https://github.com/keystonejs/keystone.git#main"
  url = url.split('#')[0]

  // e.g. "https://github.com/citelab/JAM.git"
  url = remove_suffix(url, '.git')

  // e.g. "https://github.com//RobPethick/react-custom-scrollbars-2"
  url = url.replaceAll('//', '/').replace('https:/', 'https://')

  // e.g. "https+git://github.com/pburtchaell/react-notification"
  url = url.replace(/^https\+git:\/\//, 'https://')

  // e.g. "hhttps://github.com/RodrigoMattosoSilveira/rms-sparklines"
  url = url.replace(/^hhttps:\/\//, 'https://')

  // e.g. "htts://github.com/sandhawke/webgram-logins"
  url = url.replace(/^htts:\/\//, 'https://')

  // e.g. "htps://github.com/ember-data/ember-data-rfc395-data"
  url = url.replace(/^htps:\/\//, 'https://')

  // e.g. "ttps://github.com/jmaver-plume/kafkajs-msk-iam-authentication-mechanism"
  url = url.replace(/^ttps:\/\//, 'https://')

  // e.g. "https:://github.com/angeljunior/instagram-scraper-nodejs"
  url = url.replace(/^https::\/\//, 'https://')

  // e.g. "html://github.com/qiuwenwu/mm_html"
  url = url.replace(/^html:\/\//, 'https://')

  // e.g. "git://github:terra-money/wallet-provider"
  url = url.replace('/github:', '/github.com:')
  url = url.replace('/gitlab:', '/gitlab.com:')

  // e.g. "git://github.com/beenotung/erlang.js"
  url = url.replace(/^git:\/\//, 'https://')

  // e.g. "gitssh://git@github.com/SRND/Topo"
  url = url.replace(/^gitssh:\/\/git@/, 'ssh://git@')

  // e.g. "ssh://git@github.com/beenotung/http-deceiver"
  url = url.replace(/^ssh:\/\/[\w-.]+@/, 'https://')

  // e.g. "ssh://gerrit.brightsign.biz:29418/bacon/fatback"
  url = url.replace(/^ssh:\/\//, 'https://')

  // e.g. "git:@github.com/acosom/node-rdkafka-acosom"
  url = url.replace(/^git:@/, 'git@')

  // e.g. "git@github.com:maleck13/readline"
  // e.g. "git@github.com/coaraco/nest-tslint"
  url = url.replace(
    /^[\w-.]+@([\w-.]+)[:/]([\w-./]+)$/,
    (_, host, pathname) => `https://${host}/${pathname}`,
  )

  // e.g. "http://github.com/jprichardson/terst"
  url = url.replace(/^http:\/\//, 'https://')

  // e.g. "https://github.com:uscreen/shipit-deploy-cd"
  url = url.replace(
    /^https:\/\/([\w-.]+):([\w-./]+)$/,
    (_, host, pathname) => `https://${host}/${pathname}`,
  )

  // e.g. "https://git@bitbucket.org/knetikmedia/splyt-sdk-js"
  url = url.replace(
    /^https:\/\/[\w-.]+@([\w-.]+)/,
    (_, rest) => `https://${rest}`,
  )

  // e.g. "github:Azure/azure-sdk-for-js"
  url = url.replace(/^github:/, 'https://github.com/')

  // e.g. "bitbucket.org:mysearchbot/traverz-core-ui"
  // e.g. "code.aliyun.com:673671308/typeS_crawler"
  url = url.replace(
    /^([\w-]+)\.([\w-.]+):([\w-./]+)$/,
    (_, host, ltd, pathname) => `https://${host}.${ltd}/${pathname}`,
  )

  // remove username before org name
  // e.g. "https://github.com/gozala/@multiformats/base-x" -> "https://github.com/multiformats/base-x"
  url = url.replace(
    /^(\w+):\/\/([\w-.]+)\/[\w-.]+\/@([\w-.]+)\/([\w-.]+)$/,
    (_, protocol, host, org, pathname) =>
      `${protocol}://${host}/${org}/${pathname}`,
  )

  // e.g. "github.com/Ruthirakumar/firstRepostory"
  url = url.replace(
    /^([\w-]+)\.([\w-.]+)\/([\w-.]+)\/([\w-./]+)$/,
    (_, host, ltd, org, pathname) =>
      `https://${host}.${ltd}/${org}/${pathname}`,
  )

  // e.g. "Gotop1711/file-type/tree/file-type-browser-es5"
  if (!url.startsWith('https://') && url.match(/^[\w- ]+\/[\w-./]+$/)) {
    url = 'https://github.com/' + url
  }

  // e.g. "https://github.com/orgs/privy-io"
  url = url.replace(/^https:\/\/github.com\/orgs\//, 'https://github.com/')

  // skip author page
  // e.g. "https://github.com/textioHQ/"
  let parts = url.split('/')
  if (!parts[4]) {
    return null
  }
  // e.g. "https://github.com//acosom"
  if (url.startsWith('https://github.com//')) {
    return null
  }

  // e.g. "https://www.github.com/DefinitelyTyped/DefinitelyTyped"
  url = url.replace(/^https:\/\/www\./, 'https://')

  // e.g. "https://github.com/github.com/Akryum/guijs"
  url = url.replace(
    /^https:\/\/github.com\/github.com\//,
    'https://github.com/',
  )

  if (
    (!url.startsWith('https://github.com/') &&
      !url.startsWith('https://gitlab.com/') &&
      !url.startsWith('https://gitee.com/') &&
      !url.startsWith('https://bitbucket.org/')) ||
    // e.g. "/Users/David/app/git/yotelopago"
    url.startsWith('/Users/')
  ) {
    // skip private repo
    return null
  }

  if (!url.startsWith('https://')) {
    throw new Error('Invalid repository url: ' + url)
  }

  if (url.startsWith('https://github.com/')) {
    let parts = url.split('/')
    let type = parts[5]
    switch (type) {
      case undefined:
        break
      // e.g. "https://github.com/myntra/applique-ui/tree/release/packages/@myntra/eslint-config-standard"
      case 'tree':
      // e.g. "https://github.com/MOACChain/chain3/releases"
      case 'releases':
      // e.g. "https://github.com/mozilla/eslint-plugin-no-unsanitized/issues"
      case 'issues':
      // e.g. "https://github.com/hagevvashi/twsh/issue"
      case 'issue':
      // e.g. "https://github.com/ZupIT/beagle-backend-ts/wiki/CLI"
      case 'wiki':
      // e.g. "https://github.com/pnpm/pnpm/blob/main/fs/graceful-fs"
      case 'blob':
      // e.g. "https://github.com/DSMNET/DSMNET/"
      case '':
      // e.g. "https://github.com/redux-things/redux-actions-assertions/t"
      case 't':
        url = parts.slice(0, 5).join('/')
        break
      default:
        // e.g. "https://github.com/RajaRj25/NewProject.git/react-native-awesome-module"
        if (parts[4].endsWith('.git')) {
          url = parts.slice(0, 5).join('/')
          break
        }

        // e.g. "https://github.com/pyth-network/pyth-js/pyth-common-js"
        let repo = parseRepoUrl(url)
        if (
          url.startsWith('https://github.com/') &&
          repo.username &&
          repo.name
        ) {
          url = parts.slice(0, 5).join('/')
          break
        }

        throw new Error(`Unexpected github repo url: ${url}`)
    }
  }

  let repo = parseRepoUrl(url)
  // e.g. 'https://github.com/pollenium/'
  // e.g. 'https://github.com/image-charts/
  if (!repo.name) {
    if (url.startsWith('https://github.com/')) {
      return null
    }
    throw new Error(`Incomplete repo url: ` + url)
  }

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

function remove_prefix(text: string, pattern: string): string {
  return text.startsWith(pattern) ? text.substring(pattern.length) : text
}

function remove_suffix(text: string, pattern: string): string {
  return text.endsWith(pattern) ? text.slice(0, -pattern.length) : text
}

function test() {
  let rows = filter(proxy.npm_package, { repository: notNull })
  for (let row of rows) {
    let url = cleanRepoUrl(row.repository)
    if (
      url?.startsWith('https://') &&
      (!url.substring('https://'.length).includes(':') || url.match(/:\d+/)) &&
      (!url.substring('https://'.length).includes('@') ||
        url?.includes('/@dao-xyz/')) &&
      !url.includes('readline') &&
      !url.includes('base-x') &&
      true
    ) {
      // normal?
    } else {
      console.log(row.repository, '->', url)
    }
    if (
      url &&
      ((!url.startsWith('https://') && url.includes(':')) ||
        (url.includes('@') && !url.includes('@dao-xyz')))
    ) {
      debugger
      console.log('???')
      process.exit(1)
    }
  }
}
// if (process.argv[1] == __filename) {
//   test()
// }
