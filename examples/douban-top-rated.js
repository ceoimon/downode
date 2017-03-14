const {outputJSONSync} = require('fs-extra');
const downode = require('downode').default;
const {waitFor} = require('downode');

const doubanCookie = `Dont tell others`;
const imdbCookie = `Dont tell others, too`;

const doubanPageGroup = {
	concurrent: 10,
	cookie: doubanCookie
};

const doubanDetailGroup = {
	concurrent: 1,
	cookie: doubanCookie
};

const imdbGroup = {
	concurrent: 3,
	cookie: imdbCookie
};

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

const imdbMoviePosterPageRule = {
	poster: {
		selector: '#imageJson',
		how: 'html',
		convert: waitFor('../posterURL', url => scriptText => {
			const p = new RegExp(url);
			const str = scriptText.split('"src":"').filter(s => p.test(s))[0];
			const result = str.slice(0, str.indexOf('","w"'));
			return result;
		}),
		download: {
			path: './imdbPoster',
			extension: 'png',
			// filename: '{{../titleWitoutSpace}}' // Original title
			filename: '{{../../title}}' // Chinese title
		},
		concurrent: 10,
	},
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
		rules: imdbMoviePosterPageRule,
		priority: 0,
		group: imdbGroup,
	},
	posterURL: {
		selector: '.poster a',
		attr: 'href',
		convert: url => url.replace('?ref_=tt_ov_i', '') + '/tr',
		hide: true
	}
});

// const imdbTopRatedMoviesPageRule = {
// 	title: 'title',
// 	desc: '.byline',
// 	movies: {
// 		list: '.titleColumn > a',
// 		attr: 'href',
// 		rules: imdbMoviePageRuleWithPoster,
// 		priority: 1,
// 		group: imdbGroup,
// 		globalPriority: 2
// 	}
// };

const doubanMoviePageRule = {
	title: {
		selector: 'title',
		convert: title => title.trim().slice(0, -5)
	},
	rating: '.rating_num',
	director: 'a[rel="v:directedBy"]',
	stars: {
		list: 'a[rel="v:starring"]',
		max: 3
	},
	genre: {
		list: 'span[property="v:genre"]'
	},
	duration: 'span[property="v:runtime"]',
	storyline: '.all.hidden',
	imdbID: {
		selector: 'a[href^="http://www.imdb.com/title"]'
	},
	imdb: {
		selector: 'a[href^="http://www.imdb.com/title"]',
		attr: 'href',
		rules: imdbMoviePageRuleWithPoster,
		group: imdbGroup,
	},
	poster: {
		selector: '.nbgnbg img',
		attr: 'src',
		download: {
			path: './doubanPoster',
			filename: '{{./title}}',
			extension: 'png',
		},
		concurrent: 25
	}
};

const doubanTopRatedMoviesPageRule = {
	page: '.thispage',
	movies: {
		list: '.hd a',
		attr: 'href',
		rules: doubanMoviePageRule,
		group: doubanDetailGroup,
	}
};

// downode('http://www.imdb.com/chart/top', imdbTopRatedMoviesPageRule)
// 	.then(result => {
// 		console.log(result);
// 	})
// 	.catch(err => {
// 		console.log(err);
// 	});

downode('https://movie.douban.com/top250', Object.assign({}, {
	title: '#content h1',
	desc: '.pl',
	pages: {
		list: '.paginator a',
		attr: 'href',
		rules: doubanTopRatedMoviesPageRule,
		group: doubanPageGroup,
		max: 9
	}
}, doubanTopRatedMoviesPageRule), {
	entryCookie: doubanCookie,
	totalConcurrent: 100,
	mode: 'df'
})
	.then(result => {
		let {
			title,
			desc,
			page,
			movies,
			pages
		} = result;

		pages = [{page, movies}, ...pages];

		outputJSONSync('./result.json', {
			title,
			desc,
			pages
		}, undefined, 2);
	})
	.catch(err => console.log(err));
