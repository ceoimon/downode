## Rule, the World!

There two "Rule" used in downode: `Rule` and `Page Rule`.

`Rules` are what `Page Rules` "made of".

`Rules` used to to specify what/how to scrape.

You can use any string as a `Fieldname` to desribe your `Rule`.

A simplest `Rule` is like this:

```js
const pageRule = {
	// inside a `Page Rule`
	// ...other Rules
	Fieldname: '.CSS-selector'
}
```

And it can be a relative complicated plain JavaScript Object:

```js
const pageRule = {
	// inside a `Page Rule`
	// ...other Rules
	Fieldname: {
		selector: '.CSS-selector',

		// select the second element
		eq: 1 
	}
};
```

`Rule` Object can contain many `Rule Options`, to see all of them, go to [Rules Options Guide page](./api.md).

*`Rule` can also be a `Reference Variable Waiter` created by `waitFor`, see [Reference Mechanism](./reference-mechanism) for more information.*

A `Page Rule` is a `Rule` container. It contains all the `Rules` for one same page:

```js
const imdbMoviePageRule = {
	title: {
		selector: 'h1[itemprop="name"]',

		// convert the data.
		convert: title => title.slice(0, -7)
	},
	rating: 'span[itemprop=ratingValue]',
	stars: {
		// use `list` option to get a list of data.
		list: 'span[itemprop=actors] span'
	},
	contentRating: {
		selector: 'meta[itemprop="contentRating"]',

		// use `attr` option to get the HTML attrbute
		attr: 'content'
	},
	duration: {
		selector: 'time[itemprop="duration"]',
		eq: 1
	},
	// ...other Rules
};
```

## Basic scrape

`Page Rule` and `Entry URL` is all we need to scrape a page

downode will return a Promise and resolve a result Object with same structure to your Page Rule:

```js
const downode = require('downode').default;
const imdbMoviePageRule = {
	// ...
};

// downode main function return a Promise.
downode('http://www.imdb.com/title/tt2771200', imdbMoviePageRule)
	.then(result => console.log(result));
	/**
	 * {
	 *   title: '...',
	 *   rating: '...'
	 *   ...
	 * }
	 */
	.catch(err => console.log(err));
```

## Create new context

Sometimes you will want to grab a list of content with same structure.

Use `Rule`'s `data` options to create a new context:

```js
const imdbListPageRule = {
	filmSummaries: {
		list: '.list_item',

		// `Rule`'s `data` option will create a new `Page Rule Context`, which mean your CSS
		// selectors now relative to the outer selected element ('.list_item')
		data: {
			// entry a new Page Rule

			imdbID: {
				selector: 'a' // this is equal to '.list_item a'

				// grab the link, example: '/title/tt0028950/'
				attr: 'href'

				// convert to tt0028950
				convert: link => link.slice(7)
			},
			title: '.info a'
			// ...other Rules
		}
	}
	// ...other Rules
};
```

## Go deeper

Most of scraper/crawler support pagination mechanism, you can do more with downode's nested Page Rule:

```js
const anotherPageRule = {
	// ...
};

const someOtherPageRule = {
	Fieldname: {
		selector: '.CSS-selector',

		// grab the link
		attr: 'href',

		/**
		 * if you use `Rule`'s `rules` option, it will create a nested Page Rule,
		 * downode will automatic requests the `data` we scraped
		 * (if it is not a string, just ignores it).
		 * And use the new Page Rule to scrape the new Page.
		 */
		rules: anotherPageRule
	},
	// ...other Rules
};

const aPageRule = {
	Fieldname: {
		list: '.CSS-selector',
		attr: 'href',

		// you can nest deeper
		rules: someOtherPageRule
	},
};
```

## Download Resources

downode also provide a very handy way to downode resources:

```js
const aPageRule = {
	key: {
		list: '.CSS-selector',
		attr: 'href',

		// use `Rule`'s `download` option to download it
		// `download` option can be a boolean or a object.
		// if it is a boolean, resource will be download to the process's
		// current working directory with a random filename (base on time).
		download: true
	},
};

/**
 * Or you can use a config object to specify where to save the file.
 *
 */
aPageRule.key.download = {
	filename: 'ceoiomon',
	path: './profile' // relative to cwd
	extension: 'png'
}
```

## Advance usage

downode is so simple, but you can still make it powerful through compose different `Page Rules` and `Rules`.

You can start scrape pages with previous introduced features right now. And when you feel that's not enough for you requirement, check out these powerful features downode provided:

- [Concurrent Control](./concurrent-control.md)
- [Reference Mechanism](./reference-mechanism.md)
