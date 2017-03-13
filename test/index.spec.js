import {
	join as pathJoin,
	resolve as pathResolve
} from 'path';

import {
	propertyOf
} from 'lodash';
import nock from 'nock';

import {
	constant,
	default as downode,
	waitFor,
} from '../src';

import {
	asyncShouldThrowErrorMatch,
	chmodToReadOnlyAsync,
	ensureDirAsync,
	existAsync,
	removeAsync,
	setWindowsReadOnlyAsync,
} from './helper';

describe('Main function', () => {
	describe(`#${downode.name} × #${waitFor.name}`, () => {
		const tmpDir = pathJoin(__dirname, '/.tmp');
		const readOnlyTmpDir = pathJoin(__dirname, '/.read-only-tmp');
		const mockDir = pathJoin(__dirname, '/mock');
		const DTI = jasmine.DEFAULT_TIMEOUT_INTERVAL; // eslint-disable-line no-undef
		const _now = Date.now;

		const normalGroup = {
			rate: 50
		};

		const blogPageRulesBase = {
			title: 'title',
			'blog-link': {
				selector: 'a',
				attr: 'href'
			},
			posts: {
				list: '.article',
				data: {
					summary: '.summary',
					time: '.time'
				}
			},
		};

		const blogPageRules = Object.assign({}, blogPageRulesBase, {
			pages: {
				list: '.navigation a',
				eq: 1,
				attr: 'href',
				rules: blogPageRulesBase
			},
			'invalid pages urls': {
				list: '.navigation a',
				eq: 1,
				rules: blogPageRulesBase,
				hide: true
			},
			'invalid download urls': {
				list: '.navigation a',
				eq: 1,
				download: true,
				hide: true
			}
		});

		const aboutPageRules = {
			title: 'title',
			name: 'h1',
			hobbies: {
				list: '.hobbies>li',
				convert: (text, i) => `${i}. ${text[0].toUpperCase()}${text.slice(1)}`,
				download: false
			},
			'favor-colors': {
				selector: '.favor-color-desc',
				convert: text => {
					return text.replace(/.*colors is (.*)/, '$1').slice(0, -1).split(', ');
				}
			},
			'favor colors truly order': {
				list: '.favor-color',
				how: $elm => {
					const alt = $elm.attr('alt');
					let color;
					if (alt.startsWith('first')) {
						color = 0;
					} else if (alt.startsWith('second')) {
						color = 1;
					} else {
						color = 2;
					}
					return color;
				},
				hide: true // we don't need this.
			},
			'favorite-color': {
				selector: '.favor-color',
				eq: waitFor('./favor colors truly order[0]', i => i),
				attr: 'src',
				download: waitFor('./favor-colors', colors => ({
					path: tmpDir,
					filename: `${colors[0]}-{{../about/name}}_favorite_color`,
					extension: 'png'
				}))
			}
		};

		const anotherPageRules = {
			title: 'title',
			socials: {
				list: '.social li a'
			},
			name: {
				selector: '.name',
				convert: text => text.toLowerCase()
			},
			pictures: {
				list: '.truelyUrl',
				convert: text => text.replace('not_valid.com', 'cdn.com'),
				download: {
					path: tmpDir,
					filename: 'color{{index}}'
				},
				userAgents: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
			},
			colors: {
				list: '.truelyUrl',
				convert: text => text.replace('not_valid.com', 'cdn.com'),
				download: {
					path: tmpDir,
					filename: 'color',
					extension: '.{{index}}.jpg'
				},
			},
			colors2: {
				list: '.truelyUrl',
				convert: text => text.replace('not_valid.com', 'cdn.com'),
				download: {
					path: tmpDir,
					filename: 'color',
				},
				hide: true
			},
			colors3: {
				list: '.truelyUrl',
				convert: text => text.replace('not_valid.com', 'cdn.com'),
				download: {
					completePath: pathJoin(tmpDir, 'colors.png')
				},
				hide: true
			},
			profile: {
				selector: '.profile',
				attr: 'src',
				download: {
					path: tmpDir,
					filename: '{{./name{{index}}}}'
				}
			}
		};

		const rootPageRule = {
			title: 'title',
			h1: {
				selector: '#content h1',
				trim: true,
				group: normalGroup
			},
			content: {
				selector: '#content',
				data: {
					desc: {
						selector: '.describe',
						how: 'text',
						convert: text => text.toUpperCase().replace('.', '!')
					},
					truth: {
						selector: '.truth',
						trim: false,
						convert: text => text.toLowerCase().replace('!', '.')
					},
					'pic-name': {
						selector: '#pic',
						attr: 'alt',
						convert: text => text.replace(/ /g, '-')
					},
					pic: {
						selector: '#pic',
						attr: 'src',
						download: {
							path: tmpDir + '{{index}}',
							filename: '{{./pic-name}}',
						}
					}
				}
			},
			'background-pic': {
				selector: 'style',
				how: 'text',
				eq: 1,
				convert: text => /url\((.*?)\)/ig.exec(text)[1].replace(/['"]/g, ''),
				download: {
					extension: '.png',
					filename: '{{./title}}_background',
					path: tmpDir
				}
			},
			'cat-photo': {
				selector: 'img',
				eq: 1,
				how: 'html', // ignore
				attr: 'src',
				download: {
					completePath: pathJoin(tmpDir, 'cat.jpg{{index}}')
				}
			},
			'cat-photo-2': {
				selector: 'img',
				eq: 1,
				how: 'html', // ignore
				attr: 'src',
				download: {
					completePath: pathJoin(readOnlyTmpDir, 'cat.jpg{{index}}')
				},
				hide: true
			},
			'normal pic': {
				selector: '#normal-pic',
				attr: 'src',
				download: true
			},
			'invalid download url': {
				selector: '#normal-pic',
				download: true,
				priority: 0,
				group: normalGroup,
				globalPriority: 0,
				hide: true,
			},
			'invalid download url 1': {
				selector: '#normal-pic',
				convert: () => 1,
				download: true,
				hide: true,
				group: normalGroup
			},
			'invalid page url': {
				selector: '#normal-pic',
				rules: anotherPageRules,
				hide: true
			},
			'invalid page url 1': {
				selector: '#normal-pic',
				convert: () => 1,
				rules: anotherPageRules,
				hide: true,
				group: normalGroup
			},
			'invalid download url for list': {
				list: '#normal-pic',
				download: true,
				hide: true
			},
			'invalid download url for list 1': {
				list: '#normal-pic',
				convert: () => 1,
				download: true,
				hide: true
			},
			'invalid page url for list': {
				list: '#normal-pic',
				rules: anotherPageRules,
				hide: true
			},
			'invalid page url for list 1': {
				list: '#normal-pic',
				convert: () => 1,
				rules: anotherPageRules,
				hide: true
			},
			'invalid resource for download': {
				selector: '#invalid-link',
				attr: 'href',
				download: true,
				hide: true
			},
			'invalid resource for page': {
				selector: '#invalid-link',
				attr: 'href',
				rules: anotherPageRules,
				hide: true
			},
			'non html resource for page': {
				selector: 'script',
				attr: 'src',
				rules: anotherPageRules,
				hide: true
			},
			links: waitFor('./cat-photo', './background-pic', () => ({ // if use waitFor as Rule, you can't refer it.
				list: 'li a',
				max: 2,
				attr: 'href',
				hide: false
			})),
			blog: {
				selector: 'a[href="/blog"]',
				attr: 'href',
				rules: blogPageRules
			},
			about: {
				selector: 'li:nth-child(2) a',
				attr: 'href',
				rules: aboutPageRules
			},
			another: {
				selector: 'li:last-child a',
				attr: 'href',
				rules: anotherPageRules
			},
		};

		beforeEach(async () => {
			nock.cleanAll();
			nock.disableNetConnect();
			Date.now = jest.fn(() => 1024);
			jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000; // eslint-disable-line no-undef
			await Promise.all([
				removeAsync(tmpDir),
				removeAsync(pathJoin(pathResolve(process.cwd(), './'), 1024 + '.jpeg')),
				removeAsync(readOnlyTmpDir)
					.then(() => ensureDirAsync(readOnlyTmpDir))
					.then(() => chmodToReadOnlyAsync(readOnlyTmpDir))
					.then(() => setWindowsReadOnlyAsync(readOnlyTmpDir))
			]);
		});

		afterEach(async () => {
			nock.cleanAll();
			nock.enableNetConnect();
			Date.now = _now;
			jasmine.DEFAULT_TIMEOUT_INTERVAL = DTI; // eslint-disable-line no-undef
			await Promise.all([
				removeAsync(tmpDir),
				removeAsync(pathJoin(pathResolve(process.cwd(), './'), 1024 + '.jpeg')),
				removeAsync(readOnlyTmpDir)
			]);
		});

		it('throws error if entry URL is not valid', async () => {
			await asyncShouldThrowErrorMatch([downode('wat'), `expect url("wat") to be a valid URL`]);
		});

		it('works', async () => {
			nock('http://ceoimon.com').get('/').times(3).replyWithFile(200, pathJoin(mockDir, 'index.html'), {'Content-Type': 'text/html'});
			nock('http://ceoimon.com').get('/blog').times(3).reply(404);
			setTimeout(() => {
				nock('http://ceoimon.com').get('/blog').times(3).replyWithFile(200, pathJoin(mockDir, 'blog.html'), {'Content-Type': 'text/html'});
			}, 1000);
			nock('http://ceoimon.com').get('/blog/page1').times(3).replyWithFile(200, pathJoin(mockDir, 'blog1.html'), {'Content-Type': 'text/html'});
			nock('http://ceoimon.com').get('/blog/page2').times(3).replyWithFile(200, pathJoin(mockDir, 'blog2.html'), {'Content-Type': 'text/html'});
			nock('http://ceoimon.com').get('/blog/page3').times(3).replyWithFile(200, pathJoin(mockDir, 'blog3.html'), {'Content-Type': 'text/html'});
			nock('http://ceoimon.com').get('/blog/1').times(24).reply(404);
			nock('http://ceoimon.com').get('/blog/2').times(24).reply(404);
			nock('http://ceoimon.com').get('/blog/3').times(24).reply(404);
			nock('http://ceoimon.com').get('/about').times(3).replyWithFile(200, pathJoin(mockDir, 'about.html'), {'Content-Type': 'text/html'});
			nock('http://ceoimon.com').get('/index.css').times(3).replyWithFile(200, pathJoin(mockDir, 'index.css'), {'Content-Type': 'text/css'});
			nock('http://ceoimon.com').get('/script.min.js').times(6).replyWithFile(200, pathJoin(mockDir, 'script.min.js'), {'Content-Type': 'application/javascript'});
			nock('http://ceoimon.com').get('/invalid.min.js').times(3).replyWithError('reason: connect EAGAIN blahblahblah');
			nock('http://ceoimon.com').get('/invalid.min.js').times(24).reply(404);
			nock('http://ceoimon.com').get('/cat.jpg').times(6).replyWithFile(200, pathJoin(mockDir, 'cat.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://ceoimon.com').get('/background.png').times(3).replyWithFile(200, pathJoin(mockDir, 'background.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://ceoimon.com').get('/blue.jpg').times(3).replyWithFile(200, pathJoin(mockDir, 'blue.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://anothersite.com').get('/').times(3).replyWithFile(200, pathJoin(mockDir, 'another.html'), {'Content-Type': 'text/html'});
			nock('http://anothersite.com').get('/blue.jpg').times(3).replyWithFile(200, pathJoin(mockDir, 'blue.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://cdn.com').get('/pink.jpg').times(12).replyWithFile(200, pathJoin(mockDir, 'pink.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://cdn2.com').get('/pink.jpg').times(3).replyWithFile(200, pathJoin(mockDir, 'pink.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://cdn2.com').get('/blue.jpg').times(3).replyWithFile(200, pathJoin(mockDir, 'blue.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://cdn.com').get('/purple.jpg').times(12).replyWithFile(200, pathJoin(mockDir, 'purple.jpg'), {'Content-Type': 'image/jpeg'});
			nock('http://cdn.com').get('/yellow.jpg').times(12).replyWithFile(200, pathJoin(mockDir, 'yellow.jpg'), {'Content-Type': 'image/jpeg'});

			expect(await existAsync(tmpDir)).toBe(false);

			const [
				defaultModeResult,
				dfModeResult,
				bfModeResult
			] = await Promise.all([
				downode('http://ceoimon.com', rootPageRule),
				downode('http://ceoimon.com/', rootPageRule, {
					mode: 'df'
				}),
				downode('http://ceoimon.com', rootPageRule, {
					mode: 'bf',
					userAgents: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
				})
			]);

			await Promise.all([
				defaultModeResult,
				dfModeResult,
				bfModeResult
			].map(async result => {
				const {
					blog = {},
					about = {},
					another = {}
				} = result || {};

				const myFavorColorJPEGPath = pathJoin(tmpDir, 'my-favor-color.jpeg');
				const homepageBackgroundPNGPath = pathJoin(tmpDir, 'Homepage_background.png');
				const catJPGPath = pathJoin(tmpDir, 'cat.jpg');
				const pic1024JPEGPath = pathJoin(process.cwd(), '1024.jpeg');
				const pinkCeoimonFavoriteColorPNGPath = pathJoin(tmpDir, 'pink-ceoimon_favorite_color.png');
				const color0JPEGPath = pathJoin(tmpDir, 'color0.jpeg');
				const color1JPEGPath = pathJoin(tmpDir, 'color1.jpeg');
				const color2JPEGPath = pathJoin(tmpDir, 'color2.jpeg');
				const color00JPGPath = pathJoin(tmpDir, 'color_0.0.jpg');
				const color11JPGPath = pathJoin(tmpDir, 'color_1.1.jpg');
				const color22JPGPath = pathJoin(tmpDir, 'color_2.2.jpg');
				const colorUS0JPEGPath = pathJoin(tmpDir, 'color_0.jpeg');
				const colorUS1JPEGPath = pathJoin(tmpDir, 'color_1.jpeg');
				const colorUS2JPEGPath = pathJoin(tmpDir, 'color_2.jpeg');
				const colors0PNGPath = pathJoin(tmpDir, 'colors_0.png');
				const colors1PNGPath = pathJoin(tmpDir, 'colors_1.png');
				const colors2PNGPath = pathJoin(tmpDir, 'colors_2.png');
				const ceoimonJPEGPath = pathJoin(tmpDir, 'ceoimon.jpeg');

				const getProperty = propertyOf(result);

				const propertyToMatch = ([path, what]) => {
					expect(getProperty(path) || 'undefined').toMatch(what);
				};

				const propertyToBe = ([path, what]) => {
					expect(getProperty(path)).toBe(what);
				};

				expect(result[constant.__URL__]).toBe('http://ceoimon.com');
				expect(blog[constant.__URL__]).toBe('http://ceoimon.com/blog');
				expect(about[constant.__URL__]).toBe('http://ceoimon.com/about');
				expect(another[constant.__URL__]).toBe('http://anothersite.com');

				expect(blog.pages[0][constant.__URL__]).toBe('http://ceoimon.com/blog/page1');
				expect(blog.pages[1][constant.__URL__]).toBe('http://ceoimon.com/blog/page2');
				expect(blog.pages[2][constant.__URL__]).toBe('http://ceoimon.com/blog/page3');

				[
					['title', 'Homepage'],
					['h1', 'Less is more'],
					[['content', 'desc'], 'ROBERT BROWNING'],
					[['content', 'truth'], ' less is more '],
					[['content', 'pic-name'], 'my-favor-color'],
					[['content', 'pic', 'SAVED_PATH'], myFavorColorJPEGPath],
					[['background-pic', 'SAVED_PATH'], homepageBackgroundPNGPath],
					[['invalid download url', 'ERROR', 'message'], 'download url("") failed: is not a valid URL'],
					[['invalid download url 1', 'ERROR', 'message'], 'download url("1") failed: is not a valid URL'],
					[['invalid page url', 'ERROR', 'message'], 'request url("") failed: is not a valid URL'],
					[['invalid page url 1', 'ERROR', 'message'], 'request url("1") failed: is not a valid URL'],
					[['invalid download url for list', '0', 'ERROR', 'message'], 'download url("") failed: is not a valid URL'],
					[['invalid download url for list 1', '0', 'ERROR', 'message'], 'download url("1") failed: is not a valid URL'],
					[['invalid page url for list', '0', 'ERROR', 'message'], 'request url("") failed: is not a valid URL'],
					[['invalid page url for list 1', '0', 'ERROR', 'message'], 'request url("1") failed: is not a valid URL'],
					[['cat-photo', 'SAVED_PATH'], catJPGPath],
					[['cat-photo-2', 'ERROR', 'message'], 'download url(http://ceoimon.com/cat.jpg) failed: EACCES: permission denied'],
					[['invalid resource for download', 'ERROR', 'message'], 'download url(http://ceoimon.com/invalid.min.js) failed: Not Found'],
					[['invalid resource for page', 'ERROR', 'message'], 'request url(http://ceoimon.com/invalid.min.js) failed: Not Found'],
					[['non html resource for page', 'ERROR', 'message'], `request url(http://ceoimon.com/script.min.js) failed: expect content type for url(http://ceoimon.com/script.min.js) to be html-type, but got 'content-type': application/javascript`],
					[['normal pic', 'SAVED_PATH'], pic1024JPEGPath],
					[['blog', 'title'], 'Blog Page 0'],
					[['blog', 'posts', '0', 'summary'], 'foobar'],
					[['blog', 'posts', '0', 'time'], '2017-03-09'],
					[['blog', 'posts', '1', 'summary'], 'barfoo'],
					[['blog', 'posts', '1', 'time'], '2017-03-08'],
					[['blog', 'posts', '2', 'summary'], 'heyhoo'],
					[['blog', 'posts', '2', 'time'], '2017-03-04'],
					[['blog', 'invalid pages urls', '0', 'ERROR', 'message'], 'request url(http://ceoimon.com/blog/1) failed: Not Found'],
					[['blog', 'invalid pages urls', '1', 'ERROR', 'message'], 'request url(http://ceoimon.com/blog/2) failed: Not Found'],
					[['blog', 'invalid pages urls', '2', 'ERROR', 'message'], 'request url(http://ceoimon.com/blog/3) failed: Not Found'],
					[['blog', 'invalid download urls', '0', 'ERROR', 'message'], 'download url(http://ceoimon.com/blog/1) failed: Not Found'],
					[['blog', 'invalid download urls', '1', 'ERROR', 'message'], 'download url(http://ceoimon.com/blog/2) failed: Not Found'],
					[['blog', 'invalid download urls', '2', 'ERROR', 'message'], 'download url(http://ceoimon.com/blog/3) failed: Not Found'],
					[['blog', 'blog-link'], 'https://blog.ceoimon.com'],
					[['blog', 'pages', '0', 'title'], 'Blog Page 1'],
					[['blog', 'pages', '0', 'posts', '0', 'summary'], 'Birthday'],
					[['blog', 'pages', '0', 'posts', '0', 'time'], '2017-02-19'],
					[['blog', 'pages', '0', 'posts', '1', 'summary'], 'Chinese New Year'],
					[['blog', 'pages', '0', 'posts', '1', 'time'], '2017-01-28'],
					[['blog', 'pages', '0', 'posts', '2', 'summary'], 'New Year'],
					[['blog', 'pages', '0', 'posts', '2', 'time'], '2017-01-01'],
					[['blog', 'pages', '0', 'blog-link'], 'https://webblog.ceoimon.com'],
					[['blog', 'pages', '1', 'title'], 'Blog Page 2'],
					[['blog', 'pages', '1', 'posts', '0', 'summary'], 'abc'],
					[['blog', 'pages', '1', 'posts', '0', 'time'], '2016-12-09'],
					[['blog', 'pages', '1', 'posts', '1', 'summary'], 'def'],
					[['blog', 'pages', '1', 'posts', '1', 'time'], '2016-10-18'],
					[['blog', 'pages', '1', 'posts', '2', 'summary'], '****'],
					[['blog', 'pages', '1', 'posts', '2', 'time'], '2016-08-06'],
					[['blog', 'pages', '1', 'blog-link'], 'https://notes.ceoimon.com'],
					[['blog', 'pages', '2', 'title'], 'Blog Page 3'],
					[['blog', 'pages', '2', 'posts', '0', 'summary'], 'nonsense'],
					[['blog', 'pages', '2', 'posts', '0', 'time'], '2016-07-14'],
					[['blog', 'pages', '2', 'posts', '1', 'summary'], 'vsdsdfa'],
					[['blog', 'pages', '2', 'posts', '1', 'time'], '2016-03-08'],
					[['blog', 'pages', '2', 'posts', '2', 'summary'], 'Lovely'],
					[['blog', 'pages', '2', 'posts', '2', 'time'], '2016-02-19'],
					[['blog', 'pages', '2', 'blog-link'], 'https://wat.ceoimon.com'],
					[['about', 'title'], 'About'],
					[['about', 'name'], 'ceoimon'],
					[['about', 'hobbies', '0'], '0. Watching Movies'],
					[['about', 'hobbies', '1'], '1. Explore the World'],
					[['about', 'hobbies', '2'], '2. Programming'],
					[['about', 'favor-colors', '0'], 'pink'],
					[['about', 'favor-colors', '1'], 'purple'],
					[['about', 'favor-colors', '2'], 'yellow'],
					[['about', 'favorite-color', 'SAVED_PATH'], pinkCeoimonFavoriteColorPNGPath],
					[['another', 'title'], 'Another Site'],
					[['another', 'socials', '0'], 'Google'],
					[['another', 'socials', '1'], 'Facebook'],
					[['another', 'socials', '2'], 'Twitter'],
					[['another', 'name'], 'ceoimon'],
					[['another', 'pictures', '0', 'SAVED_PATH'], color0JPEGPath],
					[['another', 'pictures', '1', 'SAVED_PATH'], color1JPEGPath],
					[['another', 'pictures', '2', 'SAVED_PATH'], color2JPEGPath],
					[['another', 'colors', '0', 'SAVED_PATH'], color00JPGPath],
					[['another', 'colors', '1', 'SAVED_PATH'], color11JPGPath],
					[['another', 'colors', '2', 'SAVED_PATH'], color22JPGPath],
					[['another', 'colors2', '0', 'SAVED_PATH'], colorUS0JPEGPath],
					[['another', 'colors2', '1', 'SAVED_PATH'], colorUS1JPEGPath],
					[['another', 'colors2', '2', 'SAVED_PATH'], colorUS2JPEGPath],
					[['another', 'colors3', '0', 'SAVED_PATH'], colors0PNGPath],
					[['another', 'colors3', '1', 'SAVED_PATH'], colors1PNGPath],
					[['another', 'colors3', '2', 'SAVED_PATH'], colors2PNGPath],
					[['another', 'profile', 'SAVED_PATH'], ceoimonJPEGPath],
					[['links', '0'], '/blog'],
					[['links', '1'], '/about']
				].forEach(propertyToMatch);

				[
					[['about', 'favor colors truly order', '0'], 1],
					[['about', 'favor colors truly order', '1'], 0],
					[['about', 'favor colors truly order', '2'], 2],
				].forEach(propertyToBe);

				const [
					isTmpDirExist,
					isMyFavorColorJPEGExist,
					isHomepageBackgroundPNGExist,
					isCatJPGxist,
					is1024JPEGExist,
					isPinkCeoimonFavoriteColorPNGExist,
					isColor0JPEGExist,
					isColor1JPEGExist,
					isColor2JPEGExist,
					isColor00JPGExist,
					isColor11JPGExist,
					isColor22JPGExist,
					isColorUS0JPEGPathExist,
					isColorUS1JPEGPathExist,
					isColorUS2JPEGPathExist,
					isColors0PNGPathExist,
					isColors1PNGPathExist,
					isColors2PNGPathExist,
					isCeoimonJPEGExist,
				] = await Promise.all([
					existAsync(tmpDir),
					existAsync(myFavorColorJPEGPath),
					existAsync(homepageBackgroundPNGPath),
					existAsync(catJPGPath),
					existAsync(pic1024JPEGPath),
					existAsync(pinkCeoimonFavoriteColorPNGPath),
					existAsync(color0JPEGPath),
					existAsync(color1JPEGPath),
					existAsync(color2JPEGPath),
					existAsync(color00JPGPath),
					existAsync(color11JPGPath),
					existAsync(color22JPGPath),
					existAsync(colorUS0JPEGPath),
					existAsync(colorUS1JPEGPath),
					existAsync(colorUS2JPEGPath),
					existAsync(colors0PNGPath),
					existAsync(colors1PNGPath),
					existAsync(colors2PNGPath),
					existAsync(ceoimonJPEGPath)
				]);

				expect(isTmpDirExist).toBe(true);
				expect(isMyFavorColorJPEGExist).toBe(true);
				expect(isHomepageBackgroundPNGExist).toBe(true);
				expect(isCatJPGxist).toBe(true);
				expect(is1024JPEGExist).toBe(true);
				expect(isPinkCeoimonFavoriteColorPNGExist).toBe(true);
				expect(isColor0JPEGExist).toBe(true);
				expect(isColor1JPEGExist).toBe(true);
				expect(isColor2JPEGExist).toBe(true);
				expect(isColor00JPGExist).toBe(true);
				expect(isColor11JPGExist).toBe(true);
				expect(isColor22JPGExist).toBe(true);
				expect(isColorUS0JPEGPathExist).toBe(true);
				expect(isColorUS1JPEGPathExist).toBe(true);
				expect(isColorUS2JPEGPathExist).toBe(true);
				expect(isColors0PNGPathExist).toBe(true);
				expect(isColors1PNGPathExist).toBe(true);
				expect(isColors2PNGPathExist).toBe(true);
				expect(isCeoimonJPEGExist).toBe(true);
			}));
		});

		it('throw error properly', async () => {
			nock('http://ceoimon.com').get('/').times(3).replyWithFile(200, pathJoin(mockDir, 'index.html'), {'Content-Type': 'text/html'});
			nock('http://ceoimon.com').get('/about').replyWithFile(200, pathJoin(mockDir, 'about.html'), {'Content-Type': 'text/html'});

			const rootPageRule1 = {
				title: 'title',
				h1: {
					selector: '#content h1',
					how: 'wat',
					trim: true
				}
			};

			const rootPageRule2 = {
				title: 'title',
				h1: {
					selector: '#content h1',
					trim: true,
					download: 'wat',
				}
			};

			const rootPageRule3 = {
				title: 'title',
				h1: {
					selector: '#content h1',
					trim: true,
				},
				about: {
					selector: 'li:nth-child(2) a',
					attr: 'href',
					rules: {
						title: 'title',
						name: {
							selector: 'h1',
							download: true,
							group: {
								retry: 1
							}
						},
					}
				},
			};

			await Promise.all([
				[downode('ceoimon.com', rootPageRule1), `expect \`h1.how\` to be a string in ['text', 'html'] or a function`],
				[downode('ceoimon.com', rootPageRule2), `expect \`h1.download\` to be a object or boolean`],
				[downode('ceoimon.com', rootPageRule3), `expect \`name.group\` includes 'rate' or 'concurrent' at least`]
			].map(asyncShouldThrowErrorMatch));
		});
	});
});
