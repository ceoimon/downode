## Basic scrape

Let's say you need to grab some IMDb movies info:

```js
const imdbMoviePageRule = {
	title: {
		selector: 'h1[itemprop="name"]',
		convert: title => title.slice(0, -7)
	},
	overview: {
		selector: '#title-overview-widget',
		data: {
			rating: 'span[itemprop=ratingValue]',
			year: {
				selector: '#titleYear',
				convert: title => title.slice(1, -1),
			},
			director: 'span[itemprop="director"]',
			stars: {
				list: 'span[itemprop=actors] span'
			},
			contentRating: {
				selector: 'meta[itemprop="contentRating"]',
				attr: 'content'
			},
		}
	},
	genre: {
		list: 'div[itemprop="genre"] a'
	},
	duration: {
		selector: 'time[itemprop="duration"]',
		eq: 1
	},
	storyline: {
		selector: 'div[itemprop="description"]',
		eq: 1
	}
};

downode('http://www.imdb.com/title/tt2771200', imdbMoviePageRule)
	.then(result => {
		console.log(result);
		/**
		{
			"title": "Beauty and the Beast",
			"overview": {
				"rating": "6.1",
				"year": "2017",
				"director": "Bill Condon",
				"stars": [
					"Emma Watson",
					"Dan Stevens",
					"Luke Evans"
				],
				"contentRating": "PG"
			},
			"genre": [
				"Family",
				"Fantasy",
				"Musical",
				"Romance"
			],
			"duration": "129 min",
			"storyline": "Disney's animated classic takes on a new form, with a
			widened mythology and an all-star cast. A young prince, imprisoned in the
			form of a beast, can be freed only by true love. What may be his only
			opportunity arrives when he meets Belle, the only human girl to ever visit
			the castle since it was enchanted."
		}
		*/
	})
	.catch(err => {
		console.log(err);
	});
```

Nothing special, right?

How about download the poster to your hardrive? And we don't want the poster preview thumbnail in the movie page, we need to dig out the real one.

```js
const imdbMoviePosterPageRule = {
	poster: {
		selector: '#imageJson',
		convert: waitFor('../posterURL', url => scriptText => {
			const p = new RegExp(url);
			const str = scriptText.split('"src":"').filter(s => p.test(s))[0];
			const result = str.slice(0, str.indexOf('","w"'));
			return result;
		}),
		download: {
			path: './imdbPoster',
			extension: 'png',
			filename: '{{../titleWitoutSpace}}'
		}
	}
};

const imdbMoviePageRuleWithPoster = Object.assign({}, imdbMoviePageRule, {
	titleWitoutSpace: {
		selector: 'h1[itemprop="name"]',
		convert: title => title.slice(0, -7).replace(/ /g, '-'),
		hide: true
	},
	posterPage: {
		selector: '.poster a',
		attr: 'href',
		rules: imdbMoviePosterPageRule
	},
	posterURL: {
		selector: '.poster a',
		attr: 'href',
		convert: url => url.replace('?ref_=tt_ov_i', '') + '/tr',
		hide: true
	}
});

downode('http://www.imdb.com/title/tt2771200', imdbMoviePageRuleWithPoster)
	.then(result => {
		console.log(result);
		/**
		{
			...
			"posterPage": {
				"poster": {
					"SAVED_PATH": ".../imdbPoster/Beauty-and-the-Beast.png"
				}
			}
		}
		*/
	})
	.catch(err => {
		console.log(err);
	});

```

And now you have a high definition poster!

But, I can do that manually, why...

OK, let's say we don't only need one movie's data and poster, we want all of the top rate movies! (IMDb Top 250)

```js
const imdbTopRateMoviesPageRule = {
	title: 'title',
	desc: '.byline',
	movies: {
		list: '.titleColumn > a',
		attr: 'href',
		rules: imdbMoviePageRuleWithPoster
	}
};

downode('http://www.imdb.com/chart/top', imdbTopRateMoviesPageRule)
	.then(result => {
		console.log(result);
		/**
		{
			"title": "IMDb Top 250 - IMDb",
			"desc": "Top 250 as rated by IMDb Users",
			"movies": [
				{
					"title": "The Shawshank Redemption",
					"overview": {
						"rating": "9.3",
						"year": "1994",
						"director": "Frank Darabont",
						"stars": [
							"Tim Robbins",
							"Morgan Freeman",
							"Bob Gunton"
						],
						"contentRating": "PG-12"
					},
					"genre": [
						"Crime",
						"Drama"
					],
					"duration": "142 min",
					"storyline": "Chronicles the experiences of a formerly successful
					banker as a prisoner in the gloomy jailhouse of Shawshank after
					being found guilty of a crime he did not commit. The film portrays
					the man's unique way of dealing with his new, torturous life; along
					the way he befriends a number of fellow prisoners, most notably a
					wise long-term inmate named Red.                Written
					by\nJ-S-Golden",
					"posterPage": {
						"poster": {
							"SAVED_PATH": ".../imdbPoster/The-Shawshank-Redemption.png"
						}
					}
				},
				......
			],
		}
		*/
	})
	.catch(err => {
		console.log(err);
	});
```

Furthermore you can also scrape Douban Top 250 (豆瓣 Top 250), and also grab the relative IMDb data and poster:

see [example file](./examples/douban-top-rate.js)
