import { proxySchema } from 'better-sqlite3-proxy'
import { db } from './db'

export type Method = {
  id?: null | number
  method: string
}

export type Url = {
  id?: null | number
  url: string
}

export type UaType = {
  id?: null | number
  name: string
  count: number
}

export type RequestSession = {
  id?: null | number
  language: null | string
  timezone: null | string
  timezone_offset: null | number
}

export type UaBot = {
  id?: null | number
  name: string
  count: number
}

export type UserAgent = {
  id?: null | number
  user_agent: string
  count: number
  ua_type_id: null | number
  ua_type?: UaType
  ua_bot_id: null | number
  ua_bot?: UaBot
}

export type UaStat = {
  id?: null | number
  last_request_log_id: number
}

export type User = {
  id?: null | number
  username: null | string
  password_hash: null | string // char(60)
  email: null | string
  tel: null | string
  avatar: null | string
  is_admin: null | boolean
}

export type RequestLog = {
  id?: null | number
  method_id: number
  method?: Method
  url_id: number
  url?: Url
  user_agent_id: null | number
  user_agent?: UserAgent
  request_session_id: null | number
  request_session?: RequestSession
  user_id: null | number
  user?: User
  timestamp: number
}

export type VerificationAttempt = {
  id?: null | number
  passcode: string // char(6)
  email: string
}

export type VerificationCode = {
  id?: null | number
  passcode: string // char(6)
  email: string
  request_time: number
  revoke_time: null | number
  match_id: null | number
  match?: VerificationAttempt
  user_id: null | number
  user?: User
}

export type Page = {
  id?: null | number
  url: string
  payload_hash: null | string
  check_time: null | number
  update_time: null | number
}

export type ProgrammingLanguage = {
  id?: null | number
  name: string
}

export type Author = {
  id?: null | number
  username: string
}

export type Domain = {
  id?: null | number
  host: string
}

export type Repo = {
  id?: null | number
  domain_id: number
  domain?: Domain
  author_id: number
  author?: Author
  name: string
  is_fork: null | boolean
  url: string
  desc: null | string
  programming_language_id: null | number
  programming_language?: ProgrammingLanguage
  website: null | string
  stars: null | number
  watchers: null | number
  forks: null | number
  readme: null | string
  last_commit: null | number
  is_public: null | boolean
  page_id: number
  page?: Page
}

export type Keyword = {
  id?: null | number
  name: string
}

export type RepoKeyword = {
  id?: null | number
  repo_id: number
  repo?: Repo
  keyword_id: number
  keyword?: Keyword
}

export type NpmPackage = {
  id?: null | number
  author_id: null | number
  author?: Author
  name: string
  version: null | string
  desc: null | string
  create_time: null | number
  last_publish_time: null | number
  unpublish_time: null | number
  weekly_downloads: null | number
  unpacked_size: null | number
  file_count: null | number
  repository: null | string
  repo_id: null | number
  repo?: Repo
  homepage: null | string
  readme: null | string
  deprecated: null | boolean
  has_types: null | boolean
  page_id: number
  page?: Page
  download_page_id: number
  download_page?: Page
  dependent_page_id: number
  dependent_page?: Page
  not_found_time: null | number
}

export type NpmPackageKeyword = {
  id?: null | number
  keyword_id: number
  keyword?: Keyword
  npm_package_id: number
  npm_package?: NpmPackage
}

export type NpmPackageDependency = {
  id?: null | number
  package_id: number
  package?: NpmPackage
  dependency_id: number
  dependency?: NpmPackage
  type: ('prod' | 'dev' | 'peer' | 'optional')
}

export type DBProxy = {
  method: Method[]
  url: Url[]
  ua_type: UaType[]
  request_session: RequestSession[]
  ua_bot: UaBot[]
  user_agent: UserAgent[]
  ua_stat: UaStat[]
  user: User[]
  request_log: RequestLog[]
  verification_attempt: VerificationAttempt[]
  verification_code: VerificationCode[]
  page: Page[]
  programming_language: ProgrammingLanguage[]
  author: Author[]
  domain: Domain[]
  repo: Repo[]
  keyword: Keyword[]
  repo_keyword: RepoKeyword[]
  npm_package: NpmPackage[]
  npm_package_keyword: NpmPackageKeyword[]
  npm_package_dependency: NpmPackageDependency[]
}

export let proxy = proxySchema<DBProxy>({
  db,
  tableFields: {
    method: [],
    url: [],
    ua_type: [],
    request_session: [],
    ua_bot: [],
    user_agent: [
      /* foreign references */
      ['ua_type', { field: 'ua_type_id', table: 'ua_type' }],
      ['ua_bot', { field: 'ua_bot_id', table: 'ua_bot' }],
    ],
    ua_stat: [],
    user: [],
    request_log: [
      /* foreign references */
      ['method', { field: 'method_id', table: 'method' }],
      ['url', { field: 'url_id', table: 'url' }],
      ['user_agent', { field: 'user_agent_id', table: 'user_agent' }],
      ['request_session', { field: 'request_session_id', table: 'request_session' }],
      ['user', { field: 'user_id', table: 'user' }],
    ],
    verification_attempt: [],
    verification_code: [
      /* foreign references */
      ['match', { field: 'match_id', table: 'verification_attempt' }],
      ['user', { field: 'user_id', table: 'user' }],
    ],
    page: [],
    programming_language: [],
    author: [],
    domain: [],
    repo: [
      /* foreign references */
      ['domain', { field: 'domain_id', table: 'domain' }],
      ['author', { field: 'author_id', table: 'author' }],
      ['programming_language', { field: 'programming_language_id', table: 'programming_language' }],
      ['page', { field: 'page_id', table: 'page' }],
    ],
    keyword: [],
    repo_keyword: [
      /* foreign references */
      ['repo', { field: 'repo_id', table: 'repo' }],
      ['keyword', { field: 'keyword_id', table: 'keyword' }],
    ],
    npm_package: [
      /* foreign references */
      ['author', { field: 'author_id', table: 'author' }],
      ['repo', { field: 'repo_id', table: 'repo' }],
      ['page', { field: 'page_id', table: 'page' }],
      ['download_page', { field: 'download_page_id', table: 'page' }],
      ['dependent_page', { field: 'dependent_page_id', table: 'page' }],
    ],
    npm_package_keyword: [
      /* foreign references */
      ['keyword', { field: 'keyword_id', table: 'keyword' }],
      ['npm_package', { field: 'npm_package_id', table: 'npm_package' }],
    ],
    npm_package_dependency: [
      /* foreign references */
      ['package', { field: 'package_id', table: 'npm_package' }],
      ['dependency', { field: 'dependency_id', table: 'npm_package' }],
    ],
  },
})
