/**
 * This file is auto generated, do not edit it manually.
 *
 * update command: npm run update
 */

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

export type GeoIpParts = {
  id?: null | number
  hash: string
  content: string
}

export type GeoIp = {
  id?: null | number
  hash: string
  content: string
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
  nickname: null | string
}

export type RequestLog = {
  id?: null | number
  method_id: number
  method?: Method
  url_id: number
  url?: Url
  user_agent_id: null | number
  user_agent?: UserAgent
  geo_ip_id: null | number
  geo_ip?: GeoIp
  request_session_id: null | number
  request_session?: RequestSession
  user_id: null | number
  user?: User
  timestamp: number
}

export type ErrorLog = {
  id?: null | number
  timestamp: number
  title: string
  error: string
  client_url_id: number
  client_url?: Url
  api_url_id: number
  api_url?: Url
  request_log_id: number
  request_log?: RequestLog
}

export type VerificationAttempt = {
  id?: null | number
  passcode: string // char(6)
  email: null | string
  tel: null | string
}

export type VerificationCode = {
  id?: null | number
  uuid: null | string
  passcode: string // char(6)
  email: null | string
  tel: null | string
  request_time: number
  revoke_time: null | number
  match_id: null | number
  match?: VerificationAttempt
  user_id: null | number
  user?: User
}

export type ContentReport = {
  id?: null | number
  reporter_id: null | number
  reporter?: User
  type: string
  remark: null | string
  submit_time: number
  reviewer_id: null | number
  reviewer?: User
  review_time: null | number
  accept_time: null | number
  reject_time: null | number
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

export type CollectApiLog = {
  id?: null | number
  url: string
  status: null | number
  start_time: number
  end_time: null | number
}

export type DBProxy = {
  method: Method[]
  url: Url[]
  ua_type: UaType[]
  geo_ip_parts: GeoIpParts[]
  geo_ip: GeoIp[]
  request_session: RequestSession[]
  ua_bot: UaBot[]
  user_agent: UserAgent[]
  ua_stat: UaStat[]
  user: User[]
  request_log: RequestLog[]
  error_log: ErrorLog[]
  verification_attempt: VerificationAttempt[]
  verification_code: VerificationCode[]
  content_report: ContentReport[]
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
  collect_api_log: CollectApiLog[]
}

export let proxy = proxySchema<DBProxy>({
  db,
  tableFields: {
    method: [],
    url: [],
    ua_type: [],
    geo_ip_parts: [],
    geo_ip: [],
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
      ['geo_ip', { field: 'geo_ip_id', table: 'geo_ip' }],
      ['request_session', { field: 'request_session_id', table: 'request_session' }],
      ['user', { field: 'user_id', table: 'user' }],
    ],
    error_log: [
      /* foreign references */
      ['client_url', { field: 'client_url_id', table: 'url' }],
      ['api_url', { field: 'api_url_id', table: 'url' }],
      ['request_log', { field: 'request_log_id', table: 'request_log' }],
    ],
    verification_attempt: [],
    verification_code: [
      /* foreign references */
      ['match', { field: 'match_id', table: 'verification_attempt' }],
      ['user', { field: 'user_id', table: 'user' }],
    ],
    content_report: [
      /* foreign references */
      ['reporter', { field: 'reporter_id', table: 'user' }],
      ['reviewer', { field: 'reviewer_id', table: 'user' }],
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
    collect_api_log: [],
  },
})
