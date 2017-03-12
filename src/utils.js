import {
	join as pathJoin,
	resolve as pathResolve
} from 'path';
import {resolve as urlResolve} from 'url';

import cheerio from 'cheerio';
import {decodeHTML} from 'entities';
import {
	createWriteStream,
	ensureFile,
	remove
} from 'fs-extra';
import isCallable from 'is-callable';
import {
	isBoolean,
	isEmpty,
	isNumber,
	isPlainObject,
	isString,
	isUndefined,
	isRegExp
} from 'lodash';
import mime from 'mime-types';
import normalizeUrlLib from 'normalize-url';

const ifEntryNotSatisfyThen = func => predicate => ([key, value]) => {
	if (predicate(value, key) === false) {
		func([key, value]);
	}
};

const throwErrorForEntry = ErrorConstructor => messageProcessor => (...args) => ([key, value]) => {
	throw new ErrorConstructor(messageProcessor(key, value, ...args));
};

const throwTypeErrorForEntry = expectType => throwErrorForEntry(TypeError)((key, value, type) => `expect \`${key}\` to be a ${type}, but got value: ${value === undefined ? 'undefined' : value === null ? 'null' : value.toString()}(type: ${Object.prototype.toString.call(value).slice(8, -1).toLowerCase()})`)(expectType);

const not = predicate => (...args) => !predicate(...args);

const or = (...predicates) => (...args) => {
	let result = false;
	for (const predicate of predicates) {
		result = result || predicate(...args);
		if (result) {
			return true;
		}
	}
	return false;
};

const isNonEmptyString = str => isString(str) && str !== '';

const isPostiveNumber = value => isNumber(value) && value > 0;

const isNonNegativeNumber = value => isNumber(value) && value >= 0;

const isNonEmptyObject = value => isPlainObject(value) && !isEmpty(value);

const isStringArray = value => Array.isArray(value) && value.length > 0 && value.every(isString);

const isOneOf = values => value => values.includes(value);

const throwIsOneOfError = array => throwErrorForEntry(Error)((key, value, array) => `expect \`${key}\` is one of: ${JSON.stringify(array)}`)(array);

const ensureValueIsRegExp = ifEntryNotSatisfyThen(throwTypeErrorForEntry('regular expression'))(isRegExp);

const hasOne = values => {
	let once = false;
	for (const value of values) {
		if (value !== undefined) {
			if (once) {
				return false;
			}
			once = true;
		}
	}
	return once;
};

const throwHasOnlyOneError = throwErrorForEntry(Error)(keys => `expect has and only has one of these field: ${keys.join(', ')}`)();

const havaCoExist = values => {
	let once = false;
	for (const value of values) {
		if (value !== undefined) {
			if (once) {
				return true;
			}
			once = true;
		}
	}
	return false;
};

const throwCoExistError = throwErrorForEntry(Error)(keys => `${keys.join(', ')} can not co-exist, use one of them`)();

class PageRuleError extends Error {
	constructor(message) {
		super(message);
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.message = message;
	}
}

function makeRulesCounter(initialCounter, rules, predicate) {
	if (!isNonEmptyObject(rules)) {
		throw new TypeError('expect page rule to be a non-empty-object');
	}
	const countedRules = new WeakSet();

	let counter = initialCounter;
	countPageRule(rules);
	return counter;

	function countPageRule(pageRule) {
		if (!isNonEmptyObject(pageRule)) {
			return;
		}

		checkSelfContained(pageRule);

		Object.values(pageRule).forEach(countRule);

		countedRules.delete(pageRule);
	}

	function countRule(rule) {
		if (!isNonEmptyObject(rule) || havaCoExist([rule.rules, rule.download, rule.data]) || !hasOne([rule.selector, rule.list])) {
			return;
		}

		checkSelfContained(rule);

		if (predicate(rule)) {
			++counter;
		}

		let subPages = [];
		for (const [key, value] of Object.entries(rule)) {
			if (key === 'rules' || key === 'data') {
				subPages.push(value);
			}
		}

		subPages.forEach(countPageRule);

		countedRules.delete(rule);
	}

	function checkSelfContained(rule) {
		if (countedRules.has(rule)) {
			throw new PageRuleError(`self-contained page rule is not allow`);
		}
		countedRules.add(rule);
	}
}

const arrayEntryChecker = (keys, values) => {
	if (!isStringArray(keys)) {
		throw new Error('expect keys to be a string array');
	}

	if (!Array.isArray(values)) {
		throw new Error('expect values to be a array');
	}

	if (keys.length !== values.length) {
		throw new Error('expect keys and values have same length');
	}
};

const entryChecker = key => {
	if (!isString(key)) {
		throw new Error('expect key to be a string');
	}
};

const VALID_URL_PATTERN = /^(?:(?:https?|ftp):\/\/)?(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/i;

const createFileIfNotExist = path => new Promise((resolve, reject) => ensureFile(path, err => err ? reject(err) : resolve()));

const removeAsync = path => new Promise(resolve => remove(path, resolve));

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

const getRandomUA = (userAgents = MOST_COMMON_USER_AGENTS) => userAgents[Math.floor(Math.random() * userAgents.length)];

function setUserAgent(request, userAgents) {
	if ((request.headers || {})['User-Agent'] === undefined && (request.headers || {})['user-agent'] === undefined) {
		request = Object.assign({}, request, {
			headers: Object.assign({}, request.headers, {
				'User-Agent': getRandomUA(userAgents)
			})
		});
	}
	return request;
}

function setCookie(request, cookie) {
	if (!cookie) {
		return request;
	}

	if (request.headers.Cookie === undefined && request.headers.cookie === undefined) {
		request = Object.assign({}, request, {
			headers: Object.assign({}, request.headers, {
				Cookie: cookie
			})
		});
	}
	return request;
}

/**
 * Count given page rule's Rules-Depth. (Rules-Depth: one nested page rule
 * represent one depth, the deepest page rule's depth is called Rules-Depth.)
 *
 * @param {PageRule} rootPageRule
 * @return {nubmer} - page rule's Rules-Depth
 */
export function countPageRuleRulesDepth(rootPageRule) {
	if (!isNonEmptyObject(rootPageRule)) {
		throw new TypeError('expect page rule to be a non-empty-object');
	}
	const countedRules = new WeakSet();

	const countNewPageRule = makeCountPageRule(true);
	const countSubPageRule = makeCountPageRule(false);

	return countNewPageRule(rootPageRule);

	function makeCountPageRule(isNewPage) {
		return pageRule => {
			if (!isNonEmptyObject(pageRule)) {
				return 0;
			}

			checkSelfContained(pageRule);

			const childsDepth = Math.max(0, ...Object.values(pageRule).map(countRule));

			countedRules.delete(pageRule);

			return isNewPage ? childsDepth + 1 : childsDepth;
		};
	}

	function countRule(rule) {
		if (!isNonEmptyObject(rule) || havaCoExist([rule.rules, rule.download, rule.data]) || !hasOne([rule.selector, rule.list])) {
			return 0;
		}

		checkSelfContained(rule);

		let newPageRules = [];
		let subPageRules = [];
		for (const [key, value] of Object.entries(rule)) {
			if (key === 'rules') {
				newPageRules.push(value);
			} else if (key === 'data') {
				subPageRules.push(value);
			}
		}

		const childsDepth = Math.max(0, ...newPageRules.map(countNewPageRule), ...subPageRules.map(countSubPageRule));

		countedRules.delete(rule);

		return childsDepth;
	}

	function checkSelfContained(rule) {
		if (countedRules.has(rule)) {
			throw new PageRuleError(`self-contained page rule is not allow`);
		}
		countedRules.add(rule);
	}
}

/**
 * Count the number of given group. Invalid groups are ignored.
 *
 * @param {PageRule} rules
 * @param {RequestGroup} group
 * @return {number}
 */
export function countSameGroups(rules, group) {
	if (!isNonEmptyObject(group)) {
		throw new TypeError('expect group to be an non-empty object');
	}

	return makeRulesCounter(0, rules, rule => !havaCoExist([rule.data, rule.group]) && hasOne([rule.download, rule.rules]) && rule.group === group);
}

/**
 * Count the number of all Page Rules. Invalid Page Rules are ignored.
 *
 * @param {PageRule} rules
 * @return {number}
 */
export function countTotalPageRules(rules) {
	return makeRulesCounter(1, rules, rule => isNonEmptyObject(rule.rules));
}

/**
 * An Entry includes multiple values and descriptions.
 *
 * Keys and values MUST have same length.
 *
 * @typedef ArrayEntry
 * @type {Array}
 * @prop {string[]} 0 - keys, values' descriptions
 * @prop {any[]} 1 - values
 */

/**
 * Ensure values can't Co-exist(non-undefined), throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureCantCoExist([keys, values] = []) {
	arrayEntryChecker(keys, values);
	ifEntryNotSatisfyThen(throwCoExistError)(not(havaCoExist))([keys, values]);
}

/**
 * Ensure a response's content-type is html-like, throw error if it isn't.
 *
 * @param {string} url
 * @param {Response} res
 */
export function ensureIsHTMLResponse(url, res) {
	const contentType = res.headers.get('content-type');
	if (getDefaultExtByContentType(contentType) !== '.html') {
		throw new Error(`expect content type for url(${url}) to be html-type, but got 'content-type': ${contentType}`);
	}
}

/**
 * Ensure has and only has one of these values, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureMustHasOne([keys, values] = []) {
	arrayEntryChecker(keys, values);
	ifEntryNotSatisfyThen(throwHasOnlyOneError)(hasOne)([keys, values]);
}

/**
 * An Entry includes value and its description.
 *
 * @typedef Entry
 * @type {Array}
 * @prop {string} 0 - key, value's description
 * @prop {any} 1 - value
 */

/**
 * Ensure value is a boolean, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsBoolean([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('boolean'))(isBoolean)([key, value]);
}

/**
 * Ensure value is a callable function, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsCallable([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('function'))(isCallable)([key, value]);
}

/**
 * Ensure value is a callable function or undefined, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsCallableIfExist([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('function'))(or(isUndefined, isCallable))([key, value]);
}

/**
 * Ensure value is a non-empty object, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNonEmptyObject([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('non-empty object'))(isNonEmptyObject)([key, value]);
}

/**
 * Ensure value is a non-empty object or undefined, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNonEmptyObjectIfExist([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('non-empty object'))(or(isUndefined, isNonEmptyObject))([key, value]);
}

/**
 * Ensure value is a non-empty string, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNonEmptyString([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('non-empty string'))(isNonEmptyString)([key, value]);
}

export function ensureValueIsObjectIfExist([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('object'))(or(isUndefined, isPlainObject))([key, value]);
}

/**
 * Ensure value is a non-empty string or undefined, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNonEmptyStringIfExist([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('non-empty string'))(or(isUndefined, isNonEmptyString))([key, value]);
}

/**
 * Ensure value is a non-empty string or a non-empty object, throw error if it
 * isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNonEmptyStringOrNonEmptyObject([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('non-empty string or non-empty object'))(or(isNonEmptyString, isNonEmptyObject))([key, value]);
}

/**
 * Ensure value is a number and not negative, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNotNegativeNumber([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('postive number or 0'))(isNonNegativeNumber)([key, value]);
}

/**
 * Ensure value is undefined or a non-negative number, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNotNegativeNumberIfExist([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('postive number or 0'))(or(isUndefined, isNonNegativeNumber))([key, value]);
}

/**
 * Ensure value is a number, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsNumber([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('number'))(isNumber)([key, value]);
}

/**
 * Ensure value is one of these values, throw error if it isn't.
 *
 * @param {any[]} array
 * @return {Function}
 */
export function ensureValueIsOneOf(array) {
	if (!Array.isArray(array) || array.length === 0) {
		throw new TypeError(`expect first parameter to be a non-empty array`);
	}
	return ([key, value] = []) => {
		entryChecker(key);
		ifEntryNotSatisfyThen(throwIsOneOfError(array))(isOneOf(array))([key, value]);
	};
}

/**
 * Ensure value is a postive number, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsPostiveNumber([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('postive number'))(isPostiveNumber)([key, value]);
}

/**
 * Ensure value is string array or undefined, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsString([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('string'))(isString)([key, value]);
}

/**
 * Ensure value is string array or undefined, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsStringArray([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('string array'))(isStringArray)([key, value]);
}

/**
 * Ensure value is string array or undefined, throw error if it isn't.
 *
 * @param {ArrayEntry} anonymous
 */
export function ensureValueIsStringArrayIfExist([key, value] = []) {
	entryChecker(key);
	ifEntryNotSatisfyThen(throwTypeErrorForEntry('string array'))(or(isUndefined, isStringArray))([key, value]);
}

/**
 * Get the default extension for mime-type. Empty string is return if type
 * invalid.
 *
 * @param {string} [contentType='']
 * @return {string} - extension
 */
export function getDefaultExtByContentType(contentType = '') {
	ensureValueIsString(['first argument (for content-type)', contentType]);

	const ext = mime.extension(contentType);
	return ext ? `.${ext}` : '';
}

/**
 * Judge wether a URL is valid.
 *
 * @param {string} [url='']
 * @return {boolean}
 */
export function isValidUrl(url = '') {
	ensureValueIsString(['first argument (for URL)', url]);

	return VALID_URL_PATTERN.test(url);
}

/**
 * Load HTML content to Cheerio and process base tag,
 * return a object contain Cheerio object and new base url.
 *
 * @param {string} baseUrl
 * @param {string} text
 * @return {{CheerioStatic|string}}
 */
export function loadTextToCheerio(baseUrl, text) {
	[['first argument (for base URL)', baseUrl], ['second argument (for HTML text)', text]].forEach(ensureValueIsNonEmptyStringIfExist);

	baseUrl = normalizeUrl(baseUrl);
	const $ = cheerio.load(text, {
		decodeEntities: false
	});

	let baseUsed = false;
	$('base').each((_, elm) => {
		const el = $(elm);
		const href = decodeHTML(el.attr('href'));

		// only the first href value are used
		// see: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/base#Usage_notes
		if (!baseUsed && href) {
			baseUrl = urlResolve(baseUrl + '/', href);
			baseUsed = true;
		}
	});

	return {
		baseUrl,
		$
	};
}

/**
 * Normalize a given URL.
 *
 * @param {string} url
 * @return {string}
 */
export function normalizeUrl(url) {
	ensureValueIsString(['first argument (for URL)', url]);

	return normalizeUrlLib(url, {
		stripFragment: false,
		stripWWW: false
	});
}

/**
 * String.prototype.replace for async function.
 *
 * @param {string} str
 * @param {RegExp|string} regex
 * @param {Function|string} fn
 * @return {Promise<string>}
 */
export async function replaceAsync(str, searcher, replacer) {
	if (typeof searcher === 'string') {
		searcher = new RegExp(searcher);
	}
	if (typeof replacer === 'string') {
		return str.replace(searcher, replacer);
	}

	ensureValueIsString(['first argument (for string)', str]);
	ensureValueIsRegExp(['second argument (for search)', searcher]);
	ensureValueIsCallable(['third argument (for replace)', replacer]);

	return await replaceIter(str);

	async function replaceIter(subStr) {
		const match = searcher.exec(subStr);
		if (match === null) {
			return subStr;
		}

		searcher.lastIndex = 0;
		const fullMatch = match[0];
		const startIndex = subStr.search(searcher);
		const restStr = subStr.slice(startIndex + fullMatch.length);
		const replaceWith = await replacer(fullMatch, ...match.slice(1), startIndex, str);

		return `${subStr.slice(0, startIndex)}${replaceWith}${searcher.global ? await replaceIter(restStr) : restStr}`;
	}
}

/**
 * Save resource to filesystem.
 *
 * @param {ReadableStream} body
 * @param {Object} [options]
 * @return {Promise<string>}
 */
export async function saveResource(
	body,
	{
		path = './',
		extension = '',
		filename = Date.now(),
		completePath = pathJoin(pathResolve(process.cwd(), path), filename + extension),
	} = {},
) {
	await createFileIfNotExist(completePath);

	let error = false;

	return new Promise((resolve, reject) => {
		const dest = createWriteStream(completePath);
		body.pipe(dest, {end: false});
		body.once('end', () => {
			dest.end();
			if (!error) {
				resolve(completePath);
			}
		});
		body.once('error', async err => {
			error = true;
			dest.end();
			await removeAsync(completePath);
			reject(err);
		});
	});
}

/**
 * Shorthand for setting fetch options.
 *
 * @param {Object} Options
 * @return {RequestInit}
 */
export function setUserAgentAndCookie({request, userAgents, cookie}) {
	[['request', request], ['request.headers', request.headers]].forEach(ensureValueIsObjectIfExist);
	ensureValueIsStringArrayIfExist(['userAgents', userAgents]);

	return setCookie(setUserAgent(request, userAgents), cookie);
}

/**
 * Time for sleep. zzZ..
 *
 * @param {number} time
 * @return {Promise<void>}
 */
export function sleep(time) {
	ensureValueIsNotNegativeNumber(['first argument (for sleep time)', time]);

	return new Promise(resolve => setTimeout(resolve, time));
}
