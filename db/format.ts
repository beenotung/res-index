import { isIP } from '@beenotung/tslib/url'
import { proxy } from './proxy'
import { filter, notNull } from 'better-sqlite3-proxy'

export function cleanRepoUrl(url: string | null): string | null {
  if (!url || url.length <= 1) return null

  switch (url) {
    case 'TBC':
    case 'FIXME':
    case 'npm/security-holder':
    case 'none':
      return null
  }

  // e.g. "git@github.com:https://github.com/LambdaIM/HdkeyJs"
  url = url.replace(/.+https:\/\//, 'https://')

  // e.g. "git clone https://services.sungard.com/git/scm/~ricky.casey/cio-mobile-app"
  url = remove_prefix(url, 'git clone ')

  // e.g. "+https://github.com/swc-project/plugins"
  url = remove_prefix(url, '+')

  // e.g. "git+https://github.com/beenotung/tslib.git"
  url = remove_prefix(url, 'git+')
  url = remove_suffix(url, '.git')

  // e.g. "hhttps://github.com/RodrigoMattosoSilveira/rms-sparklines"
  url = url.replace(/^hhttps:\/\//, 'https://')

  // e.g. "htts://github.com/sandhawke/webgram-logins"
  url = url.replace(/^htts:\/\//, 'https://')

  // e.g. "git://github:terra-money/wallet-provider"
  url = url.replace('/github:', '/github.com:')
  url = url.replace('/gitlab:', '/gitlab.com:')

  // e.g. "git://github.com/beenotung/erlang.js"
  url = url.replace(/^git:\/\//, 'https://')

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

  // skip author page
  // e.g. "https://github.com/textioHQ/"
  let parts = url.split('/')
  if (!parts[4]) {
    return null
  }

  if (!url.startsWith('https://')) {
    throw new Error('Invalid repository url: ' + url)
  }

  // e.g. "https://www.github.com/DefinitelyTyped/DefinitelyTyped"
  url = url.replace(/^https:\/\/www\./, 'https://')

  if (
    !url.startsWith('https://github.com/') &&
    !url.startsWith('https://gitlab.com/') &&
    !url.startsWith('https://gitee.com/') &&
    !url.startsWith('https://bitbucket.org/')
  ) {
    // skip private repo
    return null
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
