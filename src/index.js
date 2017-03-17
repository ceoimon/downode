import {extname as pathExtname} from 'path';
import {resolve as urlResolve} from 'url';

import {
	bgGreen,
	bgRed,
	bgYellow,
	white,
} from 'chalk';
import $ from 'cheerio';
import debug from 'debug';
import dnscache from 'dnscache';
import {decodeHTML} from 'entities';
import isCallable from 'is-callable';
import {
	isPlainObject,
	isString,
	property,
} from 'lodash';
import fetch from 'node-fetch';

import makePriorityQueue from './priority-queue';
import {
	initRefVar,
	ReferenceVariableWaiter,
	waitFor as waitForFunction,
} from './reference-variables';
import {
	countPageRuleRulesDepth,
	countSameGroups,
	countTotalPageRules,
	ensureCantCoExist,
	ensureIsHTMLResponse,
	ensureMustHasOne,
	ensureValueIsBoolean,
	ensureValueIsCallableIfExist,
	ensureValueIsNonEmptyObject,
	ensureValueIsNonEmptyObjectIfExist,
	ensureValueIsNonEmptyString,
	ensureValueIsNonEmptyStringIfExist,
	ensureValueIsNonEmptyStringOrNonEmptyObject,
	ensureValueIsNotNegativeNumber,
	ensureValueIsNotNegativeNumberIfExist,
	ensureValueIsNumber,
	ensureValueIsOneOf,
	ensureValueIsPostiveNumber,
	ensureValueIsStringArrayIfExist,
	getDefaultExtByContentType,
	isValidUrl,
	loadTextToCheerio,
	normalizeUrl,
	saveResource,
	setUserAgentAndCookie,
	sleep,
} from './utils';

const __URL__ = Symbol('request url');

export const constant = {
	__URL__
};

dnscache({
	enable: true,
	ttl: 300,
	cachesize: 1000
});

const infoLog = debug('downode:info');
const warnLog = debug('downode:warn');
const errorLog = debug('downode:error');

/**
 * Scrape given Page Rule.
 *
 * @param {string} url - Entry URL.
 * @param {PageRule} rootPageRule - root Page Rule.
 * @param {GlobalOption} [options] - global options.
 * @return {Promise<object>}
 */
export default async function downode(url, rootPageRule, options) {
	if (!isValidUrl(url)) {
		throw new Error(`expect url("${url}") to be a valid URL`);
	}

	ensureValueIsNonEmptyObject(['root Page Rule', rootPageRule]);
	ensureValueIsNonEmptyObjectIfExist(['global options', options]);

	const globalOptions = processGlobalOptions(rootPageRule, options);

	const {
		clearReferVar,
		setRefVar,
		makeRefVarRelatedFns
	} = initRefVar();

	const {$: $root, baseUrl} = await entryFetch(url, globalOptions.fetchOptions);

	let retryCount = 0;

	// closure a Promise for handy reject.
	return new Promise((resolve, reject) => {
		const handlePageRule = makeHandlePageRule(baseUrl, globalOptions.defaultGlobalPriority);

		const result = handlePageRule($root, rootPageRule);

		return waitForDone(globalOptions.isRunning)
			.then(() => {
				clearReferVar();

				resolve(result);
			})
			.catch(reject);

		function makeHandlePageRule(baseUrl, currentGlobalPriority, defaultPagePath = []) {
			return handlePageRule;

			function handlePageRule($doc, pageRule, $context = undefined, pagePath = defaultPagePath) {
				const {
					getRefVar,
					processRefVarString,
					processRefVarWaiter
				} = makeRefVarRelatedFns(pagePath, rootPageRule);

				const pageData = {};
				pageData[__URL__] = baseUrl;

				for (const [ruleName, rule] of Object.entries(pageRule)) {
					handleRule(ruleName, rule).catch(reject);
				}

				return pageData;

				async function handleRule(ruleName, rule) {
					if (rule instanceof ReferenceVariableWaiter) {
						rule = await processRefVarWaiter(rule);
					}

					ensureValueIsNonEmptyStringOrNonEmptyObject([`Rule: \`${ruleName}\``, rule]);

					await Promise.all(Object.keys(rule).map(key => [key, rule[key]]).filter(([, value]) => value instanceof ReferenceVariableWaiter).map(([key, value]) => processRefVarWaiter(value).then(result => {
						rule = Object.assign({}, rule, {
							[key]: result
						});
					})));

					if (rule.attr && isString(rule.attr)) {
						rule = Object.assign({}, rule, {
							attr: await processRefVarString(rule.attr)
						});
					}

					let {
						hide,
						isList,
						selector,
						list,
						eq,
						max,
						data,
						elementProcessOptions,
						rules: newPageRule,
						download,
						addTask,
						priority,
						globalPriority = currentGlobalPriority,
						fetchOptions,
						retryOptions: {
							retry,
							retryTimeout
						} = {},
					} = processRuleOptions(globalOptions, ruleName, rule);
					let ruleData;

					if (isList) {
						list = await processRefVarString(list);
						const $elms = $doc(list, $context).filter(i => i >= eq && i < max);

						pageData[ruleName] = ruleData = [];

						if (data) {
							pageData[ruleName] = $elms.map((i, elm) => handlePageRule($doc, data, $(elm), [...pagePath, `${ruleName}[${i}]`])).get();
							return end();
						}

						const values = await Promise.all($elms.map((i, elm) => processElementValue($(elm), elementProcessOptions, i, getRefVar)).get());

						if (newPageRule) {
							$elms.each(i => {
								ruleData[i] = {};

								if (!isString(values[i]) || values[i].trim() === '') {
									ruleData[i].ERROR = new Error(`request url("${values[i]}") failed: is not a valid URL`);
									errorLog(`${bgRed.black(' FAILED ')}${white(` URL: "${values[i]}"\n	request failed, is not a valid URL`)}`);
									return;
								}

								const pushProcessNewPageTask = makePushTask(makeNewPageProcessTask(i));
								pushProcessNewPageTask(values[i], newPageRule);
							});
						} else if (download) {
							const makeDownloadResourceTask = makeDownloadResourceTaskMaker($elms.length);

							$elms.each(i => {
								ruleData[i] = {};

								if (!isString(values[i]) || values[i].trim() === '') {
									ruleData[i].ERROR = new Error(`download url("${values[i]}") failed: is not a valid URL`);
									errorLog(`${bgRed.black(' FAILED ')}${white(` URL: "${values[i]}"\n	request failed, is not a valid URL`)}`);
									return;
								}

								const pushDownloadResourceTask = makePushTask(makeDownloadResourceTask(i));
								pushDownloadResourceTask(values[i], download);
							});
						} else {
							pageData[ruleName] = values;

							setRefVar([...pagePath, `${ruleName}`], values);
							values.forEach((value, i) => {
								setRefVar([...pagePath, `${ruleName}[${i}]`], value);
							});
						}
						return end();
					}

					selector = await processRefVarString(selector);
					const $elm = $doc(selector, $context).eq(eq);

					pageData[ruleName] = ruleData = {};

					if (data) {
						pageData[ruleName] = handlePageRule($doc, data, $elm, [...pagePath, ruleName]);
						return end();
					}

					const value = await processElementValue($elm, elementProcessOptions, 0, getRefVar);

					if (newPageRule) {
						if (!isString(value) || value.trim() === '') {
							ruleData.ERROR = new Error(`request url("${value}") failed: is not a valid URL`);
							errorLog(`${bgRed.black(' FAILED ')}${white(` URL: "${value}"\n	request failed, is not a valid URL`)}`);
							return end();
						}

						const pushProcessNewPageTask = makePushTask(makeNewPageProcessTask());
						pushProcessNewPageTask(value, newPageRule);
					} else if (download) {
						if (!isString(value) || value.trim() === '') {
							ruleData.ERROR = new Error(`download url("${value}") failed: is not a valid URL`);
							errorLog(`${bgRed.black(' FAILED ')}${white(` URL: "${value}"\n	request failed, is not a valid URL`)}`);
							return end();
						}

						const pushDownloadResourceTask = makePushTask(makeDownloadResourceTaskMaker()());
						pushDownloadResourceTask(value, download);
					} else {
						pageData[ruleName] = value;
						setRefVar([...pagePath, ruleName], value);
					}
					end();

					function end() {
						if (hide) {
							Object.defineProperty(pageData, ruleName, {
								value: pageData[ruleName],
								writable: true,
								configurable: true,
								enumerable: false
							});
						}
					}

					function makePushTask(baseTaskMaker) {
						return (requestUrl, newPageRuleOrDownloadOptions) => {
							requestUrl = urlResolve(baseUrl + '/', requestUrl);

							const task = baseTaskMaker({
								tryRetry,
								newPageRuleOrDownloadOptions,
								requestUrl,
							});

							globalOptions.addTask(globalDone => {
								addTask(task(globalDone), priority);
							}, globalPriority);

							let retryTime = retry;
							function tryRetry() {
								if (retryTime-- > 0) {
									retryCount++;

									setTimeout(() => {
										globalOptions.addTask(globalDone => {
											retryCount--;
											addTask(task(globalDone, true), priority);
										}, globalPriority);
									}, retryTimeout);
									return true;
								}
								return false;
							}
						};
					}

					function makeNewPageProcessTask(index) {
						return ({
							tryRetry,
							newPageRuleOrDownloadOptions: newPageRule,
							requestUrl,
						}) => {
							const newPagePath = index === undefined ? [...pagePath, ruleName] : [...pagePath, `${ruleName}[${index}]`];

							return (globalDone, isRetry) => done => {
								if (index === undefined) {
									pageData[ruleName][__URL__] = requestUrl;
								} else {
									pageData[ruleName][index][__URL__] = requestUrl;
								}

								const request = Object.assign({}, setUserAgentAndCookie(fetchOptions), {method: 'GET'});

								if (isRetry) {
									warnLog(`${bgYellow.black(' RETRY ')}${white(` URL: "${requestUrl}"`)}`);
								} else {
									infoLog(`${bgGreen.black(' FETCH ')}${white(` URL: "${requestUrl}"`)}`);
								}

								fetch(requestUrl, request)
									.then(res => {
										if (res.ok) {
											infoLog(`${bgGreen.black(' OK ')}${white(` URL: "${requestUrl}"`)}`);
											return res;
										}

										if (!tryRetry()) {
											throw new Error(res.statusText);
										}

										return null;
									})
									.then(res => {
										if (res) {
											ensureIsHTMLResponse(requestUrl, res);
											return res.text();
										}

										return null;
									})
									.then(resText => {
										if (resText) {
											const {$: $newDoc, baseUrl: newBaseUrl} = loadTextToCheerio(requestUrl, resText);

											const nextGlobalPriority = globalOptions.mode === 'default' ? currentGlobalPriority : globalOptions.mode === 'bf' ? currentGlobalPriority + 1 : currentGlobalPriority - 1;
											const handleNewPageRule = makeHandlePageRule(newBaseUrl, nextGlobalPriority, newPagePath);

											if (index === undefined) {
												pageData[ruleName] = handleNewPageRule($newDoc, newPageRule);
											} else {
												pageData[ruleName][index] = handleNewPageRule($newDoc, newPageRule);
											}
										}
									})
									.then(allDone)
									.catch(err => {
										if (err.message.includes('connect EAGAIN') && tryRetry()) {
											allDone();
											warnLog(`${bgYellow.black(' RETRY ')}${white(` URL: "${requestUrl}"`)}`);
											return;
										}

										if (index === undefined) {
											ruleData.ERROR = new Error(`request url(${requestUrl}) failed: ${err.message}`);
										} else {
											ruleData[index].ERROR = new Error(`request url(${requestUrl}) failed: ${err.message}`);
										}
										allDone();

										errorLog(`${bgRed.black(' FAILED ')}${white(` URL: "${requestUrl}"\n	${err.message}`)}`);
									});

								function allDone() {
									globalDone();
									done();
								}
							};
						};
					}

					function makeDownloadResourceTaskMaker(total) {
						let count = 0;

						return index => ({
							tryRetry,
							newPageRuleOrDownloadOptions: {
								filename,
								path,
								extension,
								completePath,
							},
							requestUrl,
						}) => {
							const newPagePath = index === undefined ? [...pagePath, ruleName] : [...pagePath, `${ruleName}[${index}]`];
							return (globalDone, isRetry) => done => {
								if (index === undefined) {
									ruleData[__URL__] = requestUrl;
								} else {
									ruleData[index][__URL__] = requestUrl;
								}

								const request = Object.assign({}, setUserAgentAndCookie(fetchOptions), {method: 'GET'});

								if (isRetry) {
									warnLog(`${bgYellow.black(' RETRY ')}${white(` URL: "${requestUrl}"`)}`);
								} else {
									infoLog(`${bgGreen.black(' FETCH ')}${white(` URL: "${requestUrl}"`)}`);
								}

								fetch(requestUrl, request)
									.then(res => {
										if (res.ok) {
											infoLog(`${bgGreen.black(' OK ')}${white(` URL: "${requestUrl}"`)}`);
											return res;
										}

										if (!tryRetry()) {
											throw new Error(res.statusText);
										}

										return null;
									})
									.then(async res => {
										if (res) {
											const indexForReplace = index === undefined ? '' : index;

											if (path) {
												if (/{{index}}/ig.test(path)) {
													path = path.replace(/{{index}}/g, indexForReplace);
												}

												path = await processRefVarString(path);
											}

											if (extension === undefined) {
												extension = getDefaultExtByContentType(res.headers.get('content-type'));
											} else {
												if (/{{index}}/ig.test(extension)) {
													extension = extension.replace(/{{index}}/g, indexForReplace);
												}

												extension = await processRefVarString(extension);
												if (!extension.startsWith('.')) {
													extension = '.' + extension;
												}
											}

											if (filename) {
												let usedIndex = false;
												if (/{{index}}/ig.test(filename)) {
													usedIndex = true;
													filename = filename.replace(/{{index}}/g, indexForReplace);
												}

												filename = await processRefVarString(filename);

												if (!usedIndex && index !== undefined) {
													filename += `_${index}`;
												}
											}

											if (completePath) {
												let usedIndex = false;
												if (/{{index}}/ig.test(completePath)) {
													usedIndex = true;
													completePath = completePath.replace(/{{index}}/g, indexForReplace);
												}

												completePath = await processRefVarString(completePath);

												if (!usedIndex && index !== undefined) {
													const ext = pathExtname(completePath);
													completePath = `${completePath.slice(0, -ext.length)}_${index}${ext}`;
												}
											}

											return saveResource(res.body, {path, extension, filename, completePath});
										}

										return null;
									})
									.then(savedPath => {
										if (savedPath) {
											if (index === undefined) {
												ruleData.SAVED_PATH = savedPath;

												setRefVar(newPagePath, savedPath);
											} else {
												ruleData[index].SAVED_PATH = savedPath;

												++count;
												setRefVar(newPagePath, savedPath);
												if (count === total) {
													setRefVar([...pagePath, ruleName], ruleData);
												}
											}
											infoLog(`${bgGreen.black(' SAVED ')}${white(` URL: "${savedPath}"`)}`);
										}
									})
									.then(allDone)
									.catch(err => {
										if (err.message.includes('connect EAGAIN') && tryRetry()) {
											allDone();
											warnLog(`${bgYellow.black(' RETRY ')}${white(` URL: "${requestUrl}"`)}`);
											return;
										}

										const error = new Error(`download url(${requestUrl}) failed: ${err.message}`);
										if (index === undefined) {
											ruleData.ERROR = error;

											setRefVar(newPagePath, error);
										} else {
											ruleData[index].ERROR = error;

											++count;
											setRefVar(newPagePath, error);
											if (count === total) {
												setRefVar([...pagePath, ruleName], ruleData);
											}
										}
										allDone();

										errorLog(`${bgRed.black(' FAILED ')}${white(` ${requestUrl}\n	${err.message}`)}`);
									});

								function allDone() {
									globalDone();
									done();
								}
							};
						};
					}
				}
			}
		}
	});

	async function waitForDone(isRunning) {
		await sleep(1000);
		if (retryCount > 0 || isRunning()) {
			return waitForDone(isRunning);
		}
	}
}

export const waitFor = waitForFunction;

const globalOptionString = key => `global option \`${key}\``;
function processGlobalOptions(
	rootPageRule,
	{
		totalConcurrent = 50,
		mode = 'default',
		rate = 0,
		concurrent = 5,
		request = {},
		userAgents,
		entryCookie,
		retry = 3,
		retryTimeout = 2000,
	} = {}
) {
	[['retry', retry], ['retryTimeout', retryTimeout], ['rate', rate], ['concurrent', concurrent], ['totalConcurrent', totalConcurrent]].map(([k, v]) => [globalOptionString(k), v]).forEach(ensureValueIsNotNegativeNumber);

	if (typeof userAgents === 'string') {
		userAgents = [userAgents];
	}

	ensureValueIsStringArrayIfExist(['global option userAgents', userAgents]);
	[['cookie', entryCookie], ['mode', mode]].map(([k, v]) => [globalOptionString(k), v]).forEach(ensureValueIsNonEmptyStringIfExist);
	ensureValueIsOneOf(['default', 'bf', 'df'])([globalOptionString(mode), mode.trim().toLowerCase()]);

	[retry, retryTimeout, rate, concurrent, totalConcurrent] = [retry, retryTimeout, rate, concurrent, totalConcurrent].map(Math.round);

	const rulesDepth = countPageRuleRulesDepth(rootPageRule);
	const pageRulesLength = countTotalPageRules(rootPageRule);

	let priorityRange = rulesDepth;
	let defaultGlobalPriority = pageRulesLength - 1;

	switch (mode) {
		case 'bf':
			defaultGlobalPriority = 0;
			break;
		case 'df':
			defaultGlobalPriority = rulesDepth - 1;
			break;
		default:
			priorityRange = pageRulesLength;
	}

	const {addTask, isRunning} = makePriorityQueue({concurrent: totalConcurrent, priorityRange});
	const getAddTaskAndDefaultPriority = initialGroups(rootPageRule);

	return {
		mode,
		totalConcurrent,
		addTask,
		isRunning,
		defaultGlobalPriority,
		getAddTaskAndDefaultPriority,
		taskOptions: {
			rate,
			concurrent,
		},
		fetchOptions: {
			request,
			userAgents,
			cookie: entryCookie,
		},
		retryOptions: {
			retry,
			retryTimeout,
		}
	};
}

function initialGroups(rootPageRule) {
	const groups = new WeakMap();
	return getAddTaskAndDefaultPriority;

	function getAddTaskAndDefaultPriority({
		group,
		rate,
		concurrent
	}) {
		let priorityRange = 1;
		let defaultPriority = priorityRange - 1;

		const newGroup = {
			rate,
			concurrent
		};
		if (group === undefined) {
			group = newGroup;
		}

		if (group !== newGroup) {
			if (groups.has(group)) {
				return groups.get(group);
			}

			(
				{rate, concurrent} = group
			);

			priorityRange = countSameGroups(rootPageRule, group);

			const {addTask} = makePriorityQueue({rate, concurrent, priorityRange});
			defaultPriority = priorityRange - 1;

			groups.set(group, {addTask, defaultPriority});

			return {addTask, defaultPriority};
		}

		const {addTask} = makePriorityQueue({rate, concurrent, priorityRange});
		return {addTask, defaultPriority};
	}
}

async function entryFetch(url, fetchOptions) {
	const requestUrl = normalizeUrl(url);

	infoLog(`${bgGreen.black(' FETCH ')}${white(` ${requestUrl}`)}`);

	const res = await fetch(requestUrl, Object.assign({}, setUserAgentAndCookie(fetchOptions), {
		method: 'GET'
	}));

	infoLog(`${bgGreen.black(' OK ')}${white(` ${requestUrl}`)}`);

	ensureIsHTMLResponse(url, res);

	const text = await res.text();
	return loadTextToCheerio(url, text);
}

function processRuleOptions(globalOptions, ruleName, rule) {
	if (isString(rule)) {
		rule = {
			selector: rule
		};
	}

	let {
		hide = false,
		selector,
		list,
		eq = 0,
		max = Infinity,
		how = 'text',
		attr,
		trim = true,
		convert,
		data,
		download,
		rules,
		group,
		priority,
		globalPriority,
		rate = globalOptions.taskOptions.rate,
		concurrent = globalOptions.taskOptions.concurrent,
		request = property('request')(group) || globalOptions.fetchOptions.request,
		userAgents = property('userAgents')(group) || globalOptions.fetchOptions.userAgents,
		cookie = property('cookie')(group),
		retry = property('retry')(group) || globalOptions.retryOptions.retry,
		retryTimeout = property('retryTimeout')(group) || globalOptions.retryOptions.retryTimeout,
	} = rule;
	ensureMustHasOne([[`${ruleName}.selector`, `${ruleName}.list`], [selector, list]]);
	ensureCantCoExist([[`${ruleName}.data`, `${ruleName}.rules`, `${ruleName}.download`], [data, rules, download]]);
	ensureCantCoExist([[`${ruleName}.data`, `${ruleName}.group`], [data, group]]);

	ensureValueIsBoolean([`${ruleName}.hide`, hide]);

	ensureValueIsNonEmptyStringIfExist([`${ruleName}.selector`, selector]);
	ensureValueIsNonEmptyStringIfExist([`${ruleName}.list`, list]);
	const isList = selector === undefined;

	ensureValueIsNumber([`${ruleName}.eq`, eq]);
	ensureValueIsPostiveNumber([`${ruleName}.max`, max]);
	eq = Math.round(eq);
	max = Math.round(max);

	if (data !== undefined) {
		ensureValueIsNonEmptyObject([`${ruleName}.data`, data]);
		return {
			isList,
			selector,
			list,
			eq,
			max,
			data,
		};
	}

	if (!['text', 'html'].includes(how) && !isCallable(how)) {
		throw new Error(`expect \`${ruleName}.how\` to be a string in ['text', 'html'] or a function`);
	}

	if (attr !== undefined) {
		ensureValueIsNonEmptyString([`${ruleName}.attr`, attr]);
		how = $elm => $elm.attr(attr);
	}

	ensureValueIsBoolean([`${ruleName}.trim`, trim]);
	ensureValueIsCallableIfExist([`${ruleName}.convert`, convert]);

	if (globalOptions.mode === 'default' && globalPriority !== undefined) {
		ensureValueIsNotNegativeNumber([`${ruleName}.globalPriority`, globalPriority]);
		globalPriority = Math.round(globalPriority);
	}

	if (download !== undefined) {
		const isBoolean = typeof download === 'boolean';

		if (!isPlainObject(download) && !isBoolean) {
			throw new TypeError(`expect \`${ruleName}.download\` to be a object or boolean`);
		}

		if (!isBoolean) {
			[
				[`${ruleName}.download.path`, download.path],
				[`${ruleName}.download.extension`, download.extension],
				[`${ruleName}.download.filename`, download.filename],
				[`${ruleName}.download.completePath`, download.completePath]
			].forEach(ensureValueIsNonEmptyStringIfExist);
		} else if (download) {
			download = {};
		}
	}

	ensureValueIsNonEmptyObjectIfExist([`${ruleName}.rules`, rules]);

	let addTask;
	let defaultPriority;

	if (group === undefined) {
		[[`${ruleName}.rate`, rate], [`${ruleName}.concurrent`, concurrent]].forEach(ensureValueIsNotNegativeNumber);

		rate = Math.round(rate);
		concurrent = Math.round(concurrent);

		(
			{addTask, defaultPriority} = globalOptions.getAddTaskAndDefaultPriority({rate, concurrent})
		);
	} else {
		ensureValueIsNonEmptyObject([`${ruleName}.group`, group]);
		if (download === undefined && rules === undefined) {
			warnLog(`${bgYellow.black(' IGNORE ')}${white(` RULE: ${ruleName}\n	You have specified group field without download or rules field`)}`);
		}

		if (group.rate === undefined && group.concurrent === undefined) {
			throw new Error(`expect \`${ruleName}.group\` includes 'rate' or 'concurrent' at least`);
		}

		(
			{addTask, defaultPriority} = globalOptions.getAddTaskAndDefaultPriority({group})
		);
	}

	ensureValueIsNotNegativeNumberIfExist([`${ruleName}.priority`, priority]);
	priority = priority === undefined ? defaultPriority : priority;

	if (typeof userAgents === 'string') {
		userAgents = [userAgents];
	}

	ensureValueIsStringArrayIfExist([`${ruleName}.userAgents`, userAgents]);
	ensureValueIsNonEmptyStringIfExist([`${ruleName}.cookie`, cookie]);

	[['retry', retry], ['retryTimeout', retryTimeout]].forEach(ensureValueIsNotNegativeNumber);

	priority = Math.round(priority);
	retry = Math.round(retry);
	retryTimeout = Math.round(retryTimeout);

	return {
		hide,
		isList,
		selector,
		eq,
		list,
		max,
		elementProcessOptions: {
			how,
			trim,
			convert,
		},
		globalPriority,
		download,
		rules,
		addTask,
		priority,
		fetchOptions: {
			request,
			userAgents,
			cookie,
		},
		retryOptions: {
			retry,
			retryTimeout,
		}
	};
}

async function processElementValue($elm, {how, trim, convert}, index, getRefVar) {
	let value = isString(how) ? $elm[how]() : await (async () => how($elm, index, getRefVar))();

	if (isString(how)) {
		value = decodeHTML(value);
	}

	if (typeof value === 'string' && trim) {
		value = value.trim();
	}

	if (convert) {
		value = await (async () => convert(value, index, getRefVar))();
	}

	return value;
}

/**
 * Page Rule, contains several Rules.
 *
 * @typedef PageRule
 * @type {{Rule}}
 */

/**
 * Rule, contains one css selector and other optional options. If a Rule is a
 * string, use it as `selector` field. For example, `foo: '.bar'` is equal to
 * `foo: {selector: '.bar'}`
 *
 * NOTE:
 * - Rule must have and only have one `selector` or one `list`.
 * - Options: `data`, `download`, `rules` can't co-exist.
 * - Option `globalPriority` only effective for `default` mode, see
 * GlobalOption.
 * - Options: `rate`, `concurrent` only effective while `group` field is
 * unspecified.
 * - If `rate` specified and better than 0, `concurrent` set to 1.
 *
 * @typedef Rule
 * @type {object|string|ReferenceVariableWaiter}
 * @prop {string|ReferenceVariableWaiter} [selector] - A css selector for select only one element.
 * @prop {string|ReferenceVariableWaiter} [list] - A css selector for select elements.
 * @prop {number|ReferenceVariableWaiter} [eq=0] - Which number of element to be start.
 * @prop {number|ReferenceVariableWaiter} [max=Infinity] - Which number of element to be start.
 * @prop {string|CheerioElementProcessor|ReferenceVariableWaiter} [how='text'] - Specify how to process
 * cheerio element.
 * @prop {string|ReferenceVariableWaiter} [attr] - Shorthand to specify which element's attribute to be
 * extract. This option will overwrite `how` option.
 * @prop {boolean|ReferenceVariableWaiter} [trim=true] - Whether trim the processed value while it is a
 * string.
 * @prop {Function|ReferenceVariableWaiter} [convert] - A function to convert processed value.
 * @prop {PageRule|ReferenceVariableWaiter} [data] - A sub-Page-Rule.
 * @prop {DownloadOptions|ReferenceVariableWaiter} [download] - Download options for the
 * value.
 * @prop {PageRule|ReferenceVariableWaiter} [rules] - New Page Rule.
 * @prop {RequestGroup|ReferenceVariableWaiter} [group] - Request Group it belongs to.
 * @prop {number|ReferenceVariableWaiter} [priority] - Priority for Request Group's request queue.
 * @prop {number|ReferenceVariableWaiter} [globalPriority] - Priority for global request queue.
 * @prop {number|ReferenceVariableWaiter} [rate=globalOptions.rate] - Interval for each request in
 * milisecond.
 * @prop {number|ReferenceVariableWaiter} [concurrent=globalOptions.concurrent] - Max concurrent request
 * number.
 * @prop {RequestInit|ReferenceVariableWaiter} [request=(group.request || globalOptions.request)] -
 * option pass to node-fetch.
 * @prop {string|string[]|ReferenceVariableWaiter} [userAgents=(group.userAgents ||
 * globalOptions.userAgents)] - Shorthand for specify use one of these user
 * agents (randomly) for User-Agent field in request header.
 * @prop {string|ReferenceVariableWaiter} [cookie=group.cookie || undefined] - Shorthand
 * for specify cookie for request header.
 * @prop {number|ReferenceVariableWaiter} [retry=(group.retry || globalOptions.retry)] - Request retry
 * time.
 * @prop {boolean} [hide] - If set True, hide this field from the result.
 * @prop {number|ReferenceVariableWaiter} [retryTimeout=(group.retryTimeout ||
 * globalOptions.retryTimeout)] - Request retry timeout in milisecond.
 */

/**
 * Processor for selected Cheerio element, use to process data or do something
 * upon it.
 *
 * @typedef CheerioElementProcessor
 * @type {Function}
 * @param {CheerioStatic} $elm
 * @return {any}
 */

/**
 * Options for download resource, specify where to save the resource to
 * filesystem. If it is a boolean and is true, use default options.
 *
 * @typedef DownloadOptions
 * @type {{string}|boolean}
 * @prop {string} [extension=''] - Filename extension. If not provided use
 * content-type default extension.
 * @prop {string} [filename=Date.now()] - Filename without
 * extension.
 * @prop {string} [path='./'] - Path(relative/absolute) to save file.
 * @prop {string} [completePath] - Abosulte file path to save file.
 */

/**
 * A Request Group is a group for request Rule (Rule contains `download`/`rules`
 * field). It specify request Rules common option, such as fetch options, retry
 * options. And these options will overwrite global options.
 *
 * A Request Group also have request rate limit and concurrent control
 * configurated by it options, request Rules' requests in the same group will
 * then be stricted by it's group (by putting them to a same request-queue).
 *
 * Request Rule can overwrite most of configurations(except `rate` and
 * `concurrent`) by specify outside the group, and use `prority` field for
 * request Rules' request-queue prority.
 *
 * NOTE:
 * - It SHOULD use with Rule which has `download`/`rules` field, otherwise it will
 * be ignore.
 * - Request Group must have `rate` or `concurrent` field at least.
 * - If `rate` is specified and better than 0, `concurrent` set to 1.
 *
 * @typedef RequestGroup
 * @type {object}
 * @prop {object} [rate] - Interval for each request in milisecond.
 * @prop {object} [concurrent] - Max concurrent request number.
 * @prop {RequestInit} [request] - option pass to node-fetch.
 * @prop {string|string[]} [userAgents] - Shorthand for specify use one of these
 * user agents (randomly) for User-Agent field in request header.
 * @prop {string} [cookie] - Shorthand for specify cookie for request header.
 * @prop {number} [retry] - Request retry time.
 * @prop {number} [retryTimeout] - Request retry timeout in milisecond.
 */

/**
 * Global Options.
 *
 * NOTE:
 * - downode use a priority queue to control all requests.
 * - Type of global request mode:
 * 	- 'default': FIFO, all requests is set to lowest priority, can be overwrite
 * through `Rule.globalPriority`.
 * 	- 'bf': stand for Breadth-First, outer request have higher priority.
 * 	- 'df': stand for Deepth-First, inner request have higher priority.
 * - If you use 'default' mode, you can specify `Rule.globalPriority` field
 * for arrange global request queue. But you can't specify a `globalPriority`
 * value better than the number of all Page Rules, so it's recommended to arrange
 * priority start with 0, which is highest priority.
 *
 * @typedef GlobalOption
 * @type {object}
 * @prop {number} [totalConcurrent=50] - Max concurrent number for global
 * request queue.
 * @prop {'default'|'df'|'bf'} [mode='default'] - global request queue mode.
 * @prop {number} [rate=0] - Interval for each request in milisecond (within same Rule).
 * @prop {number} [concurrent=5] - Max concurrent request number (within same Rule).
 * @prop {RequestInit} [request] - option pass to node-fetch.
 * @prop {string|string[]} [userAgents=MOST_COMMON_USER_AGENTS] - Shorthand for
 * specify use one of these user agents (randomly) for User-Agent field in
 * request header.
 * @prop {string} [entryCookie] - cookie for entry.
 * @prop {number} [retry=3] - Request retry time.
 * @prop {number} [retryTimeout=2000] - Request retry timeout in milisecond.
 */
