import {
	cloneDeep,
	isPlainObject,
	isString
} from 'lodash';

import {
	ensureValueIsCallable,
	ensureValueIsString,
	ensureValueIsStringArray,
	ensureValueIsNonEmptyObject,
	ensureValueIsNonEmptyString,
	replaceAsync
} from './utils';

const UNDEFINED = Symbol('undefined');

/**
 * Use to identify Reference Variables waiter.
 */
export class ReferenceVariableWaiter {
	/**
	 *
	 * @param {Function} callback
	 * @param {string[]|string|Object|undefined} refPaths
	 */
	constructor(callback, refPaths) {
		this.refPaths = refPaths;
		this.callback = callback;
	}
}

export function initRefVar() {
	const keys = new Map();

	return {
		clearReferVar,
		makeRefVarRelatedFns,
		setRefVar
	};
	/**
	 * Clear all unset reference variables with a error.
	 */
	function clearReferVar() {
		for (const [key, {value, listeners}] of keys.entries()) {
			if (value === UNDEFINED) {
				listeners.forEach(l => l(new Error(`reference variable for path \`${key}\` never get`)));
			}
			keys.delete(key);
		}
	}

	/**
	 * Make `getRefVar`, `processRefVarString` and `processRefVarWaiter` for given
	 * entered Page Paths and root Page Rule.
	 *
	 * @param {*} enteredPagePaths
	 * @param {*} rootPageRule
	 */
	function makeRefVarRelatedFns(enteredPagePaths, rootPageRule) {
		if (Array.isArray(enteredPagePaths)) {
			if (enteredPagePaths.length !== 0) {
				ensureValueIsStringArray(['first argument (for entered Page Path)', enteredPagePaths]);
			}
		} else {
			throw new TypeError(`expect first argument (for entered Page Path) to be a array`);
		}
		ensureValueIsNonEmptyObject(['second argument (for root Page Rule)', rootPageRule]);

		return {
			getRefVar,
			processRefVarString,
			processRefVarWaiter,
		};

		/**
		 * Process a string, fill it with Reference Variables (if it specified some).
		 *
		 * @param {string} str
		 * @return {Promise<string>}
		 */
		async function processRefVarString(str) {
			ensureValueIsString(['first argument (for string to process)', str]);

			return replaceAsync(str, /{{([\S\s]+?)}}/g, async (_, variableRefPath) => await getRefVar(variableRefPath));
		}

		/**
		 * Get specify Reference Path's variable.
		 *
		 * @param {string} refPath
		 * @return {Promise<any>}
		 */
		async function getRefVar(refPath) {
			ensureValueIsString(['first argument (for Reference Path)', refPath]);
			if (!refPath.startsWith('.')) {
				throw new Error('expect first argument (for Reference Path) start with `.`');
			}

			return waitForReferVar(parseRefPathToPagePath(refPath));
		}

		/**
		 * Process a ReferenceVariableWaiter, invoke the callback when all Reference
		 * Variables it needs are available.
		 *
		 * @param {ReferenceVariableWaiter} waiter
		 * @return {Promise<any>}
		 */
		async function processRefVarWaiter(waiter) {
			if (!(waiter instanceof ReferenceVariableWaiter)) {
				throw new TypeError(`expect first argument (for Reference Variable Waiter) to be a ReferenceVariableWaiter instance`);
			}

			const {refPaths, callback} = waiter;

			let result;
			if (refPaths === undefined) {
				return callback(undefined, getRefVar);
			}

			if (isString(refPaths)) {
				result = await getRefVar(refPaths);
			} else if (Array.isArray(refPaths)) {
				result = await Promise.all(refPaths.map(refPath => getRefVar(refPath)));
			} else {
				const keys = Object.keys(refPaths);
				result = (await Promise.all(keys.map(key => getRefVar(refPaths[key])))).reduce((r, v, i) => {
					r[keys[i]] = v;
					return r;
				}, {});
			}

			return callback(result, getRefVar);
		}

		/**
		 * Parse given Reference Path to Page Path.
		 *
		 * For example, ` foo/ba\\/r[23]/\\\\/bar\\\\/foo/\\/bar ` will be parse to
		 * `["foo", "ba/r[23]", "\/bar\/foo", "/bar"]`
		 *
		 * @param {string} refPath
		 * @return {string}
		 */
		function parseRefPathToPagePath(refPath) {
			let rule = rootPageRule;
			let enteredPagePathsCopy = enteredPagePaths.slice();

			// ' foo/ba\\/r[23]/\\\\/bar\\\\/foo/\\/bar '
			// => ["foo/ba", "r[23]/\", "bar\", "foo/", "bar"]
			// => [["foo", "ba"], ["r[23]", "\"], ["bar\"], ["foo", ""], ["bar"]]
			// => ["foo", "ba/r[23]", "\/bar\/foo", "/bar"]
			const paths = refPath
				.trim()
				.split('\\/')
				.map(s => s.split('/'))
				.reduce((r, s, i) => i === 0 ? [...r, ...s] : r[r.length - 1] === '' ? [...r, `/${s[0]}`, ...s.slice(1)] : [...r.slice(0, -1), r.slice(-1)[0] + `/${s[0]}`, ...s.slice(1)], [])
				.filter(p => p !== '')
				.map(p => {
					if (p.startsWith('.')) {
						if (p !== '.'.repeat(p.length)) {
							throw new Error(`invalid reference path found: expect \`${p}\` not to starts with '.' (you can use '\\\\.' to escape '.')`);
						}
						return p.slice((p.length & 1) === 0 ? 0 : 1);
					}
					return p;
				})
				.filter(p => p !== '');

			for (const originalP of paths) {
				let p = originalP;

				if (p.startsWith('.')) {
					const backSteps = Math.floor(p.length / 2);
					enteredPagePathsCopy = enteredPagePathsCopy.slice(0, -backSteps);
					continue;
				}

				enteredPagePathsCopy.push(p);
			}

			let enteredSuccessfulPagePath = [];

			for (const originalP of enteredPagePathsCopy) {
				let p = originalP;

				const arrayMatch = p.match(/\[([0-9]+)\]$/);
				if (arrayMatch) {
					p = p.slice(0, -arrayMatch[0].length);
				}

				// only escape user defined Paths
				if (paths.includes(originalP)) {
					if (p.startsWith('\\.')) {
						p = p.slice(1);
					}

					if (arrayMatch) {
						const ruleOrPageRule = rule[p];
						if (!isPlainObject(ruleOrPageRule) || ruleOrPageRule.selector !== undefined || ruleOrPageRule.list === undefined) {
							throw new Error(`invalid reference path found: ${getFullPath(p)} is not a list`);
						}

						enteredSuccessfulPagePath.push(`${p}${arrayMatch[0]}`);
					} else {
						if (originalP.endsWith('\\]')) {
							p = p.slice(0, -2) + ']';
						}

						const ruleOrPageRule = rule[p];
						if (ruleOrPageRule === undefined) {
							throw new Error(`invalid reference path found: can not find ${getFullPath(p)}`);
						}

						if (isPlainObject(ruleOrPageRule) && ruleOrPageRule.list !== undefined && (ruleOrPageRule.rules !== undefined || ruleOrPageRule.data !== undefined)) {
							throw new Error(`invalid reference path found: ${getFullPath(p)} is a Page Rule list, but likely you forgot to specify index`);
						}
						enteredSuccessfulPagePath.push(p);
					}
				} else {
					enteredSuccessfulPagePath.push(originalP);
				}

				const ruleOrPageRule = rule[p];
				if (ruleOrPageRule.data !== undefined) {
					rule = ruleOrPageRule.data;
				} else if (ruleOrPageRule.rules !== undefined) {
					rule = ruleOrPageRule.rules;
				} else if (isString(ruleOrPageRule)) {
					rule = ruleOrPageRule;
				} else {
					rule = 'can not go deeper';
				}
			}

			// check last path is not refer to a page rule
			if (isPlainObject(rule)) {
				throw new Error(`invalid reference path found: can refer a whole page data (\`rootPageRule${enteredSuccessfulPagePath.length > 0 ? `${enteredSuccessfulPagePath.reduce((r, c) => `${r}["${c}"]`, '')}` : ''}\`)`);
			}

			return enteredSuccessfulPagePath.toString();

			function getFullPath(k) {
				return `\`rootPageRule${enteredSuccessfulPagePath.length > 0 ? `${enteredSuccessfulPagePath.reduce((r, c) => `${r}["${c}"]`, '')}` : ''}["${k}"]\``;
			}
		}
	}

	/**
	 * Wait for a Reference Variable.
	 *
	 * @param {string} pagePath
	 * @return {Promise<any>}
	 */
	function waitForReferVar(pagePath) {
		ensureValueIsString(['first argument (for Reference Variable key)', pagePath]);

		return new Promise((resolve, reject) => {
			subscribe(pagePath, (err, value) => err ? reject(err) : resolve(value));
		});
	}

	/**
	 * Set a Reference Variable for given Page Path, call all listeners
	 * attached to it.
	 *
	 * @param {string[]} pagePath
	 * @param {any} val
	 */
	function setRefVar(pagePath, val) {
		ensureValueIsStringArray(['first argument (for Reference Variable Page Path)', pagePath]);
		pagePath = pagePath.toString();

		if (keys.has(pagePath)) {
			// make a clone so listener can't change the value.
			const cloneVal = cloneDeep(val);
			const {listeners, value} = keys.get(pagePath);

			if (value !== UNDEFINED) {
				throw new Error(`duplicate reference Page Path is not allow: \`${pagePath}\``);
			}

			listeners.forEach(l => l(null, cloneVal));
		}
		keys.set(pagePath, {value: val});
	}

	/**
	 * Subscribe a listener function for a Page Path of a Reference Variable, when
	 * the variable is available, call the function with the variable.
	 *
	 * <del> It will return a unsubscribe function for unsubscribe listener. </del>
	 *
	 * @param {string} pagePath
	 * @param {Function} listener
	 *
	 */
	function subscribe(pagePath, listener) {
		ensureValueIsString(['first argument (for Reference Variable key)', pagePath]);
		ensureValueIsCallable(['second argument (for Reference Variable listener)', listener]);

		let listeners = [listener];

		if (keys.has(pagePath)) {
			const {listeners: currentListeners, value} = keys.get(pagePath);

			if (value !== UNDEFINED) {
				// make a clone so listener can't change the value.
				listener(null, cloneDeep(value));
				return;
				// return () => {};
			}

			listeners = currentListeners.slice();
			listeners.push(listener);
		}
		keys.set(pagePath, {listeners, value: UNDEFINED});

		// we dont need unsubscribe function.
		// let isSubscribed = true;
		// return function unsubscribe() {
		// 	if (!isSubscribed) {
		// 		return;
		// 	}

		// 	isSubscribed = false;

		// 	const {listeners: currentListeners} = keys.get(pagePath);
		// 	listeners = currentListeners.slice();

		// 	const index = currentListeners.indexOf(listener);
		// 	listeners.splice(index, 1);
		// 	keys.set(pagePath, {listeners});
		// };
	}
}

/**
 * Wait for some Reference Variables.
 *
 * Last argument is a callback function invoke when all Reference Variables are
 * available.
 *
 * If argument (except callback) is a single string, invoke callback with the
 * target RefVar. If it's a string object, invoke callback with the object with
 * same keys filled with RefVars. If argument is a string array or more than one
 * arguments are passed, invoke callback with the array filled with RefVars in
 * corresponding order.
 *
 * downode use Reference Path to reference other rules result. You can refer a
 * specified Rule result using Reference Path, but you can't refer a whole Page
 * Rule data, and refer a whole list data (use [index] to get the corresponding
 * item)
 *
 * NOTE:
 * - If the Rule Path name you refer to starts with `.`, use `\.` to escape.
 * (you probably need string `\\.` to get `\.`)
 * - If the Rule Path name you refer to ends with `[number]`, use `[number\]` to
 * escap. (you probably need string `[number\\]` to get `[number\]`)
 * - If the Rule Path name you refer to contains `/`, use `\/` to escape. (you
 * probably need string `\\/` to get `\/`)
 *
 * @param {any[]} args
 * @return {ReferenceVariableWaiter}
 */
export function waitFor(...args) {
	const callback = args.pop();
	ensureValueIsCallable(['last argument', callback]);

	if (args.length === 0) {
		return new ReferenceVariableWaiter(callback);
	}

	if (args.length === 1) {
		const firstArg = args[0];
		if (Array.isArray(firstArg)) {
			firstArg.map((arg, i) => [`firstArgument[${i}]`, arg]).forEach(ensureValueIsNonEmptyString);
		} else if (isPlainObject(firstArg)) {
			ensureValueIsNonEmptyObject([`first argument (for Reference Paths)`, firstArg]);

			for (const [key, value] of Object.entries(firstArg)) {
				ensureValueIsNonEmptyString([`firstArgument["${key}"]`, value]);
			}
		} else if (isString(firstArg)) {
			ensureValueIsNonEmptyString([`first argument (for Reference Paths)`, firstArg]);
		} else {
			throw new TypeError(`expect first argument (for Reference Path) to be a string array or string object`);
		}
		return new ReferenceVariableWaiter(callback, firstArg);
	}

	args.map((arg, i) => [`No.${i + 1} argument (for Reference Path)`, arg]).forEach(ensureValueIsNonEmptyString);

	return new ReferenceVariableWaiter(callback, args);
}
