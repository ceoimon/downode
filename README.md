# downode

[![NPM version](https://img.shields.io/npm/v/downode.svg?style=flat-square)](https://npmjs.com/package/downode) ![Node Version](https://img.shields.io/badge/node-7.6.0+-brightgreen.svg?style=flat-square) [![CircleCI](https://img.shields.io/circleci/token/7f386e510229d21208ec6b8443fb73f4ad595982/project/github/ceoimon/downode/master.svg?style=flat-square)](https://circleci.com/gh/ceoimon/downode) [![Coverage Status](https://coveralls.io/repos/github/ceoimon/downode/badge.svg?branch=master&style=flat-square)](https://coveralls.io/github/ceoimon/downode?branch=master)

**downode** is a easy-to-use scraper for general usage. Simple but powerful.


## Installation

```bash
npm i -S downode
```


## Features

- **Composable:** downode supports nested Rule, you can reuse/compose your `Page Rule` / `Rule` arbitrarily.

- **Concurrent control:** Control all the network requests with simple config option.

- **Reference mechanism:** You can reference other scraped data easily and asynchronously.


## Documentations

- [Getting Start](./docs/quick-start.md)
- [Rule's Options Guide](./docs/options-guide.md)
- [Concurent Control](./docs/concurrent-control.md)
- [Reference Mechanism](./docs/reference-mechanism.md)


## Examples

There is a [example](./examples/douban-top-rated-250-movies.js) to scrape Douban Top Rated 250 Movies.

## API

### `downode(entryURL, pageRule, globalOptions?)`

scrape the given URL page with given `Page Rule`

*NOTE: if you're using commonjs module, you'll need to use `require('downode').default` to get this main function*

**Params**

- **string** `entryURL` - The target URL you want to start with.
- **Object** `pageRule` - The `Page Rule` for the entry page, a set of `Rule`.
	- `Rule` (Object|String|RefVarWaiter) - Specify what/how to scrape. see [Rule's Options Guide](./docs/options-guide.md)
- **Object** `globalOptions` - Global config options. 
	- `totalConcurrent` (number? = 50) - Max concurrent number for global task prority queue. see [Concurent Control](./docs/concurrent-control.md)
	- `mode` ('default' | 'df' | 'bf') - Global task prority queue mode. see [Concurent Control](./docs/concurrent-control.md)
	- `entryCookie` (string) - `cookie` for entry request.
	- `rate` (number? = 0) - Default `rate` option for `Rules`.
	- `concurrent` (number? = 5) - Default `concurrent` option for `Rules`.
	- `request` (Object? = 0) - Default `request` option for `Rules`.
	- `userAgents` ((string[] | string)? = MOST_COMMON_USER_AGENTS) - Default `userAgents` option for `Rules`.
	- `retry` (number? = 3) - Default `retry` option for `Rules`.
	- `retryTimeout` (number? = 2000) - Default `retryTimeout` option for `Rules`.
	
**Return**

- **Promise** - resolve a result Object with same structure to your Page Rule


### `waitFor(...refPaths, callback)`

Function overloading: 
- `waitFor(refPathsArray, callback)`
- `waitFor(refPathsObject, callback)`

Create a `Reference Variable Waiter`. Invoke the callback when all `Reference Variables` are available.

*To learn more about reference mechanism, please head to [reference-mechanism](./docs/reference-mechanism.md)*

**Params**

- **string[]** `refPaths`: `Reference Paths` passed one by one.
	- or **string[]** `refPathsArray`: A array contains all `Reference Paths`
	- or **object** `refPathsObject`: A object contains key value map to `Reference Paths`
- **Function** `callback`

**Return**

- **any** - Return what callback return.


## Related

downode is inspired by these projects:

- [scrape-it](https://github.com/IonicaBizau/scrape-it)
- [node-crawler](https://github.com/bda-research/node-crawler)


## Roadmap

- [ ] Proxy Rule Option
- [ ] Post Rule Option
- [ ] Authorization/Cookie propogation
- [ ] CLI support
- [ ] Incremental scrape
- [ ] Dynamic generate website scrape support


## License

MIT
