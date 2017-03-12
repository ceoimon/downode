import {
	join as pathJoin,
	resolve as pathResolve
} from 'path';

import cheerio from 'cheerio';
import nock from 'nock';
import fetch from 'node-fetch';

import {
	getDefaultExtByContentType,
	isValidUrl,
	loadTextToCheerio,
	normalizeUrl,
	replaceAsync,
	saveResource,
	setUserAgentAndCookie,
	sleep
} from '../../src/utils';

import {
	asyncShouldThrowErrorMatch,
	chmodToReadOnlyAsync,
	ensureDirAsync,
	existAsync,
	removeAsync,
	setWindowsReadOnlyAsync,
} from '../helper';

export default () => {
	describe(`#${getDefaultExtByContentType.name}`, () => {
		it('should return default extension for mime types', () => {
			expect(getDefaultExtByContentType('text/html')).toBe('.html');
			expect(getDefaultExtByContentType('application/javascript')).toBe('.js');
			expect(getDefaultExtByContentType('image/png')).toBe('.png');
		});

		it('should return empty string for invalid types', () => {
			expect(getDefaultExtByContentType('what/ever')).toBe('');
			expect(getDefaultExtByContentType('')).toBe('');
			expect(getDefaultExtByContentType()).toBe('');
		});
	});

	describe(`#${isValidUrl.name}`, () => {
		it('should return true for valid url', () => {
			expect(isValidUrl('http://www.ceoimon.com')).toBe(true);
			expect(isValidUrl('https://www.ceoimon.com/path/?query=query#hash')).toBe(true);
		});

		it('should return false for invalid url', () => {
			expect(isValidUrl('/?query=query#hash')).toBe(false);
			expect(isValidUrl('query=query#hash')).toBe(false);
			expect(isValidUrl('')).toBe(false);
			expect(isValidUrl()).toBe(false);
		});
	});

	describe(`#${loadTextToCheerio.name}`, () => {
		const url = 'http://ceoimon.com';
		const baseTagUrl = 'https://www.ceoimon.com/awesome';
		const normalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="ie=edge">
	<title>Document</title>
</head>
<body>
	downode is awesome!
</body>
</html>`;
		const htmlWithBaseTag = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="ie=edge">
	<base href="${baseTagUrl}">
	<base target="_blank" href="https://www.nope.com/">
	<title>Document</title>
</head>
<body>
	downode is awesome!
</body>
</html>`;
		const cheerioProcessedResult = cheerio.load(normalHtml, {
			decodeEntities: false
		});

		it('load text to Cheerio wihout decode entities', () => {
			const {$} = loadTextToCheerio(url, normalHtml);
			expect($.html()).toBe(cheerioProcessedResult.html());
			expect($.text()).toBe(cheerioProcessedResult.text());
		});

		it('should properly handle base tag', () => {
			const {baseUrl: sameUrl} = loadTextToCheerio(url, normalHtml);
			const {baseUrl: changedUrl} = loadTextToCheerio(url, htmlWithBaseTag);
			expect(sameUrl).toBe(sameUrl);
			expect(changedUrl).toBe(baseTagUrl);
		});
	});

	describe(`#${normalizeUrl.name}'`, () => {
		it('should not strip `www`', () => {
			expect(normalizeUrl('http://www.ceoimon.com')).toBe('http://www.ceoimon.com');
			expect(normalizeUrl('www.ceoimon.com')).toBe('http://www.ceoimon.com');
		});

		it('should not strip `fragment` part', () => {
			expect(normalizeUrl('http://www.ceoimon.com#hash')).toBe('http://www.ceoimon.com/#hash');
			expect(normalizeUrl('http://www.ceoimon.com/?query#hash')).toBe('http://www.ceoimon.com/?query#hash');
		});
	});

	describe(`#${replaceAsync.name}`, () => {
		it('replace string with async function properly', async () => {
			const str = 'foo{{../foo/bar}}bar{{../bar/foo}}';
			const re = /{{([\S\s]+?)}}/g;

			const [
				replacedStr,
				replacedStr2,
				replacedStr3,
				replacedStr4
			] = await Promise.all([
				replaceAsync(str, re, async (_, ref) => {
					return new Promise(resolve => setTimeout(resolve, 0, ref.split('/').pop()));
				}),

				replaceAsync(str, 'foo', async foo => {
					return `bar${foo}bar`;
				}),

				replaceAsync(str, /bar/g, 'foobarfoo'),

				replaceAsync('ceoimon', re, 'lskdf')
			]);

			expect(replacedStr).toBe('foobarbarfoo');
			expect(replacedStr2).toBe('barfoobar{{../foo/bar}}bar{{../bar/foo}}');
			expect(replacedStr3).toBe('foo{{../foo/foobarfoo}}foobarfoo{{../foobarfoo/foo}}');
			expect(replacedStr4).toBe('ceoimon');
		});
	});

	describe(`#${saveResource.name}`, () => {
		const tmpDir = pathJoin(__dirname, '/.tmp');
		const readOnlyTmpDir = pathJoin(__dirname, '/.read-only-tmp');
		const mockDir = pathResolve(__dirname, '../mock');

		beforeEach(async () => {
			nock.cleanAll();
			nock.disableNetConnect();
			await Promise.all([
				removeAsync(tmpDir),
				removeAsync(readOnlyTmpDir),
				ensureDirAsync(readOnlyTmpDir)
					.then(() => chmodToReadOnlyAsync(readOnlyTmpDir))
					.then(() => setWindowsReadOnlyAsync(readOnlyTmpDir))
			]);
		});

		afterEach(async () => {
			nock.cleanAll();
			nock.enableNetConnect();
			await Promise.all([
				removeAsync(tmpDir),
				removeAsync(readOnlyTmpDir)
			]);
		});

		it('saves resource to filesystem', async () => {
			const reqUrl = 'http://ceoimon.com';
			const filename = 'index';
			const extension = '.html';

			nock(reqUrl).get('/').times(2).replyWithFile(200, pathJoin(mockDir, 'normal-html.html'));

			expect(await existAsync(tmpDir)).toBe(false);

			const [
				res,
				res2
			] = await Promise.all([
				fetch(reqUrl),
				fetch(reqUrl)
			]);
			const [
				completePath,
				automaticPath
			] = await Promise.all([
				saveResource(res.body, {
					filename,
					extension,
					path: tmpDir
				}),

				saveResource(res2.body)
			]);

			expect(completePath).toBe(pathJoin(tmpDir, filename + extension));

			const [isTmpDirExist, isAutomaticPathExist, isCompletePathExist] = await Promise.all([
				existAsync(tmpDir),
				existAsync(automaticPath),
				existAsync(completePath)
			]);

			expect(isTmpDirExist).toBe(true);
			expect(isAutomaticPathExist).toBe(true);
			expect(isCompletePathExist).toBe(true);

			await removeAsync(automaticPath);
		});

		it('should reject with error and remove file if error occur', async () => {
			const reqUrl = 'http://ceoimon.com';
			const filename = 'index';
			const extension = '.html';
			const errorMessage = 'Network Error or something';

			nock(reqUrl).get('/').times(2).replyWithFile(200, pathJoin(mockDir, 'normal-html.html'));

			expect(await existAsync(tmpDir)).toBe(false);

			const [
				res,
				res2
			] = await Promise.all([
				fetch(reqUrl),
				fetch(reqUrl)
			]);

			res.body.once('end', () => { // block this event and raise a error.
				res.body.emit('error', new Error(errorMessage));
			});

			await Promise.all([
				[saveResource(res.body, {
					filename,
					extension,
					path: tmpDir
				}), errorMessage],

				[saveResource(res2.body, {
					filename,
					extension,
					path: readOnlyTmpDir
				}), 'EACCES: permission denied']
			].map(asyncShouldThrowErrorMatch));

			const [
				isTmpDirExist,
				isFileExist
			] = await Promise.all([
				existAsync(tmpDir),
				existAsync(pathJoin(tmpDir, filename + extension))
			]);

			expect(isTmpDirExist).toBe(true);
			expect(isFileExist).toBe(false);
		});
	});

	describe(`#${setUserAgentAndCookie.name}`, () => {
		it(`sets User-Agent headers field properly`, () => {
			const MOST_COMMON_USER_AGENTS = [
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36',
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36',
				'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36',
				'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36',
				'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36',
				'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36',
				'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:51.0) Gecko/20100101 Firefox/51.0',
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36',
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/602.4.8 (KHTML, like Gecko) Version/10.0.3 Safari/602.4.8',
				'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:51.0) Gecko/20100101 Firefox/51.0'
			];
			const UAs = [
				'downode/1.0.0 (+https://github.com/ceoimon/downode)',
				'downode/1.0.1 (+https://github.com/ceoimon/downode)',
				'downode/1.1.0 (+https://github.com/ceoimon/downode)',
				'downode/1.2.2 (+https://github.com/ceoimon/downode)',
			];
			const emptyRequestOptions = {};
			const haveUAOptions = {
				headers: {
					'Accept-Charset': 'utf-8',
					'User-Agent': 'downode/1.0.0 (+https://github.com/ceoimon/downode)'
				}
			};
			const haveUaOptions = {
				headers: {
					'Accept-Charset': 'utf-8',
					'user-agent': 'downode/2.0.0 (+https://github.com/ceoimon/downode)'
				}
			};

			const randomUA = setUserAgentAndCookie({request: emptyRequestOptions});
			const specifiedUA = setUserAgentAndCookie({request: emptyRequestOptions, userAgents: UAs});
			const sameUA = setUserAgentAndCookie({request: haveUAOptions, userAgents: UAs});
			const sameUa = setUserAgentAndCookie({request: haveUaOptions, userAgents: UAs});

			[sameUA, sameUa].forEach(requestOptions => {
				expect(requestOptions).toMatchObject({
					headers: {
						'Accept-Charset': 'utf-8',
					}
				});
			});

			expect(MOST_COMMON_USER_AGENTS).toContain(randomUA.headers['User-Agent']);
			expect(UAs).toContain(specifiedUA.headers['User-Agent']);
			expect(sameUA.headers['User-Agent']).toBe('downode/1.0.0 (+https://github.com/ceoimon/downode)');
			expect(sameUa.headers['user-agent']).toBe('downode/2.0.0 (+https://github.com/ceoimon/downode)');
		});

		it(`sets Cookie headers field properly`, () => {
			const cookie = 'user_name=ceoimon; Domain=.ceoimon.com;';

			const emptyRequestOptions = {};
			const haveCookieOptions = {
				headers: {
					'Accept-Charset': 'utf-8',
					Cookie: 'app=downode(1.0.0);',
					'User-Agent': 'downode/1.0.0 (+https://github.com/ceoimon/downode)'
				}
			};
			const havecookieOptions = {
				headers: {
					'Accept-Charset': 'utf-8',
					cookie: 'app=downode(2.0.0);',
					'User-Agent': 'downode/1.0.0 (+https://github.com/ceoimon/downode)'
				}
			};

			const noCookie = setUserAgentAndCookie({request: emptyRequestOptions});
			const specifiedCookie = setUserAgentAndCookie({request: emptyRequestOptions, cookie});
			const sameCookie = setUserAgentAndCookie({request: haveCookieOptions, cookie});
			const samecookie = setUserAgentAndCookie({request: havecookieOptions, cookie});

			[sameCookie, samecookie].forEach(requestOptions => {
				expect(requestOptions).toMatchObject({
					headers: {
						'Accept-Charset': 'utf-8',
						'User-Agent': 'downode/1.0.0 (+https://github.com/ceoimon/downode)'
					}
				});
			});

			expect(noCookie.headers.Cookie).toBe(undefined);
			expect(specifiedCookie.headers.Cookie).toBe(cookie);
			expect(sameCookie.headers.Cookie).toBe('app=downode(1.0.0);');
			expect(samecookie.headers.cookie).toBe('app=downode(2.0.0);');
		});
	});

	describe(`#${sleep.name}`, () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it('should sleep zzZ...', () => {
			const sleepTime = 1000;
			const sleepTime2 = 2000;
			sleep(sleepTime);
			sleep(sleepTime2);

			expect(setTimeout.mock.calls.length).toBe(2);
			expect(setTimeout.mock.calls[0][1]).toBe(1000);
			expect(setTimeout.mock.calls[1][1]).toBe(2000);
		});
	});
};
