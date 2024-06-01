import { o } from '../jsx/jsx.js'
import { existsSync, readFileSync } from 'fs'
import { Link } from '../components/router.js'
import { prerender } from '../jsx/html.js'
import SourceCode from '../components/source-code.js'
import { title } from '../../config.js'

// The JSX expression don't need to be re-built on every render
let About = (
  <div id="about">
    <h1>About Resource Index (res-index)</h1>
    <p>
      res-index is a searchable index for development resources, including
      github repo and npm packages.
    </p>
    <h2>Why yet another index?</h2>
    <p>
      <strong>
        In short, the search functionality on google and github are unsatisfied.
        This project aim to build a better alternative and potentially improve
        google's search result.
      </strong>
    </p>
    <p>
      Sometime I want to search for a npm package but google cannot return that
      result even after I added "npm", "github", or even the combination of
      exact author username and package name.
    </p>
    <p>
      Similarly, it's sometime hopeless to search for a non-popular package by
      name on github if you cannot recall the author's username.
    </p>
    <p>
      Sometime google can not show the corresponding npm page but instead shows
      it on "socket.dev" or "snyk.io".
    </p>
    <p>
      Pasting the exact npm url in subsequence search doesn't seem effective at
      hinting google to index the pages.
    </p>
    <p>
      This project aim to actively index some github repositories and npm
      packages to enable more inclusive searching.
    </p>
    <p>
      In addition, this project try be SEO-friendly. Hopefully, it can improve
      google's search result overtime.
    </p>
    <h2>Open Source License</h2>
    <p>
      This project is open sourced, this source code is available on{' '}
      <a href="https://github.com/beenotung/res-index" target="_blank">
        Github
      </a>{' '}
      and licensed with <Link href="/LICENSE">BSD-2-Clause</Link>.
    </p>
    <p>
      This is free, libre, and open-source software. It comes down to four
      essential freedoms{' '}
      <a
        href="https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2"
        target="_blank"
      >
        [ref]
      </a>
      :
      <ul>
        <li>The freedom to run the program as you wish, for any purpose</li>
        <li>
          The freedom to study how the program works, and change it so it does
          your computing as you wish
        </li>
        <li>The freedom to redistribute copies so you can help others</li>
        <li>
          The freedom to distribute copies of your modified versions to others
        </li>
      </ul>
    </p>
    <SourceCode page="about.tsx" />
  </div>
)

const License = prerender(
  <p style="white-space:pre-wrap">
    {existsSync('LICENSE')
      ? readFileSync('LICENSE').toString()
      : 'LICENSE file is missing. You can put it in the project root directory, alone-side with the package.json'}
  </p>,
)

const Help = prerender(
  <p style="white-space:pre-wrap">{readFileSync('help.txt').toString()}</p>,
)

let routes = {
  '/about/:mode?': {
    title: title('About'),
    description:
      'About res-index - A searchable index for development resources, including github repo and npm packages',
    menuText: 'About',
    menuUrl: '/about',
    menuMatchPrefix: true,
    node: About,
    streaming: true,
  },
  '/LICENSE': {
    title: 'BSD 2-Clause License of res-index',
    description:
      'res-index is a free open source project licensed under the BSD 2-Clause License',
    node: License,
  },
  '/help.txt': {
    title: 'Get started',
    description:
      'res-index is powered by ts-liveview. This page shows you how to run a ts-liveview project locally and introduce the available npm scripts.',
    node: Help,
  },
}

export default { routes }
