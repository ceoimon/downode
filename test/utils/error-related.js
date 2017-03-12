import isCallable from 'is-callable';
import {
	isBoolean,
	isNumber,
	isString,
	isPlainObject,
	isEmpty
} from 'lodash';
import nock from 'nock';
import fetch from 'node-fetch';

import {
	ensureCantCoExist,
	ensureIsHTMLResponse,
	ensureMustHasOne,
	ensureValueIsBoolean,
	ensureValueIsCallable,
	ensureValueIsCallableIfExist,
	ensureValueIsNonEmptyObject,
	ensureValueIsNonEmptyObjectIfExist,
	ensureValueIsNonEmptyString,
	ensureValueIsNonEmptyStringIfExist,
	ensureValueIsNonEmptyStringOrNonEmptyObject,
	ensureValueIsNotNegativeNumber,
	ensureValueIsNotNegativeNumberIfExist,
	ensureValueIsNumber,
	ensureValueIsObjectIfExist,
	ensureValueIsOneOf,
	ensureValueIsPostiveNumber,
	ensureValueIsString,
	ensureValueIsStringArray,
	ensureValueIsStringArrayIfExist,
} from '../../src/utils';

const isNonEmptyString = str => isString(str) && str !== '';
const isPostiveNumber = value => isNumber(value) && value > 0;
const isNonEmptyArray = arr => Array.isArray(arr) && arr.length > 0;
const isNonNegativeNumber = value => isNumber(value) && value >= 0;
const isStringArray = value => isNonEmptyArray(value) && value.every(isString);
const isNonEmptyObject = value => isPlainObject(value) && !isEmpty(value);

export default () => {
	let undefinedVar1;
	let undefinedVar2;
	let undefinedVar3;
	const keys = ['rules', 'data', 'download'];
	const key = 'foo';
	const arrayEntryParameterChecker = fn => () => {
		expect(() => {
			fn(null);
		}).toThrow(`Cannot read property 'Symbol(Symbol.iterator)' of null`);

		const nonIterable = [Boolean(), Number(1), Object(), Symbol(''), RegExp(), class {}, new Date()];

		nonIterable.forEach(nonArray => {
			expect(() => {
				fn(nonArray);
			}).toThrow('undefined is not a function');
		});

		[undefinedVar1, [null], [undefinedVar1], ...nonIterable.map(nonArray => [nonArray]), ...nonIterable.map(nonString => [['str', nonString]])].forEach(keysNotValid => {
			expect(() => {
				fn(keysNotValid);
			}).toThrow('expect keys to be a string array');
		});

		[[['str'], undefinedVar1], [['str'], null], ...nonIterable.map(nonArray => [['str'], nonArray])].forEach(valuesNotValid => {
			expect(() => {
				fn(valuesNotValid);
			}).toThrow('expect values to be a array');
		});

		[[['str', 'str'], [1]], ...nonIterable.map(nonArray => [['str', 'str'], [nonArray]])].forEach(keysAndValuesLengthNotEqual => {
			expect(() => {
				fn(keysAndValuesLengthNotEqual);
			}).toThrow('expect keys and values have same length');
		});
	};

	const entryParameterChecker = fn => () => {
		expect(() => {
			fn(null);
		}).toThrow(`Cannot read property 'Symbol(Symbol.iterator)' of null`);

		const nonIterable = [Boolean(), Number(1), Object(), Symbol(''), RegExp(), class {}, new Date()];

		nonIterable.forEach(nonArray => {
			expect(() => {
				fn(nonArray);
			}).toThrow('undefined is not a function');
		});

		[undefinedVar1, [null], [undefinedVar1], ...nonIterable.map(nonString => [nonString])].forEach(keysNotValid => {
			expect(() => {
				fn(keysNotValid);
			}).toThrow('expect key to be a string');
		});
	};

	const ensureTypeChecker = ([fn, type, predicate, includeUndefined]) => {
		const entryNonThisTypeChecker = () => {
			[String('one'), String(), isCallable, Array(1), Array('str'), Boolean(), Boolean(true), Object(), Object({a: 1}), Number(1), Number(-1), Number(0), Symbol(''), RegExp(), class {}, new Date(), null].filter(v => !predicate(v)).concat(includeUndefined ? [] : undefinedVar1).forEach(value => {
				expect(() => {
					fn([key, value]);
				}).toThrow(`expect \`${key}\` to be a ${type}, but got value: ${value === undefined ? 'undefined' : value === null ? 'null' : value.toString()}(type: ${Object.prototype.toString.call(value).slice(8, -1).toLowerCase()})`);
			});
		};

		const entryThisTypeChecker = () => {
			[String('one'), String(), isCallable, Array(1), Array('str'), Boolean(), Boolean(true), Object(), Object({a: 1}), Number(1), Number(-1), Number(0), Symbol(''), RegExp(), class {}, new Date(), null].filter(predicate).concat(includeUndefined ? undefinedVar1 : []).forEach(value => {
				expect(() => {
					fn([key, value]);
				}).not.toThrow();
			});
		};

		describe(`#${fn.name}`, () => {
			it('throws error for invalid parameter', entryParameterChecker(fn));

			it(`throws error for not a ${type} value`, entryNonThisTypeChecker);

			it(`does not throw error for a ${type} value${includeUndefined ? ` or undefined` : ''}`, entryThisTypeChecker);
		});
	};

	describe(`#${ensureCantCoExist.name}`, () => {
		it('throws error for invalid parameter', arrayEntryParameterChecker(ensureCantCoExist));

		it('throws error if specified values co-exist', () => {
			[[{}, {}, {}], [{}, {}, undefinedVar1], [{}, undefinedVar1, {}], [undefinedVar1, {}, {}]].forEach(values => {
				expect(() => {
					ensureCantCoExist([keys, values]);
				}).toThrow(`${keys.join(', ')} can not co-exist, use one of them`);
			});
		});

		it('does not throw error if specified values not co-exist', () => {
			[[{}, undefinedVar1, undefinedVar2], [undefinedVar1, {}, undefinedVar2], [undefinedVar1, undefinedVar2, {}], [undefinedVar1, undefinedVar2, undefinedVar3]].forEach(values => {
				expect(() => {
					ensureCantCoExist([keys, values]);
				}).not.toThrow();
			});
		});
	});

	describe(`#${ensureIsHTMLResponse.name}`, () => {
		beforeEach(() => {
			nock.cleanAll();
			nock.disableNetConnect();
		});

		afterEach(() => {
			nock.cleanAll();
			nock.enableNetConnect();
		});

		const domain = 'https://ceoimon.com';
		const urlPath = '/';
		const url = domain + urlPath;

		it('throws error for not html type response', async () => {
			const contentType = 'application/javascriptttt';
			nock(domain).get(urlPath).reply(200, '() => {}', {'Content-Type': contentType});

			const res = await fetch(url);

			expect(() => {
				ensureIsHTMLResponse(url, res);
			}).toThrow(`expect content type for url(${url}) to be html-type, but got 'content-type': ${contentType}`);
		});

		it('does not throw error for html type response', async () => {
			const contentType = 'text/html';
			nock(domain).get(urlPath).reply(200, '() => {}', {'Content-Type': contentType});

			const res = await fetch(url);

			expect(() => {
				ensureIsHTMLResponse(url, res);
			}).not.toThrow();
		});
	});

	describe(`#${ensureMustHasOne.name}`, () => {
		it('throws error for invalid parameter', arrayEntryParameterChecker(ensureMustHasOne));

		it('throws error if none of specified values exist', () => {
			expect(() => {
				ensureMustHasOne([keys, [undefinedVar1, undefinedVar2, undefinedVar3]]);
			}).toThrow(`expect has and only has one of these field: ${keys.join(', ')}`);
		});

		it('throws error if have more than one specified values exist', () => {
			[[{}, {}, {}], [{}, {}, undefinedVar1], [{}, undefinedVar1, {}], [undefinedVar1, {}, {}]].forEach(values => {
				expect(() => {
					ensureMustHasOne([keys, values]);
				}).toThrow(`expect has and only has one of these field: ${keys.join(', ')}`);
			});
		});

		it('does not throw error if has one specified fields exist', () => {
			[[{}, undefinedVar1, undefinedVar2], [undefinedVar1, {}, undefinedVar2], [undefinedVar1, undefinedVar2, {}]].forEach(values => {
				expect(() => {
					ensureMustHasOne([keys, values]);
				}).not.toThrow();
			});
		});
	});

	[
		[ensureValueIsBoolean, 'boolean', isBoolean, false],
		[ensureValueIsCallable, 'function', isCallable, false],
		[ensureValueIsCallableIfExist, 'function', isCallable, true],
		[ensureValueIsNonEmptyObject, 'non-empty object', isNonEmptyObject, false],
		[ensureValueIsNonEmptyObjectIfExist, 'non-empty object', isNonEmptyObject, true],
		[ensureValueIsNonEmptyString, 'non-empty string', isNonEmptyString, false],
		[ensureValueIsNonEmptyStringIfExist, 'non-empty string', isNonEmptyString, true],
		[ensureValueIsNonEmptyStringOrNonEmptyObject, 'non-empty string or non-empty object', val => isNonEmptyString(val) || isNonEmptyObject(val), false],
		[ensureValueIsNotNegativeNumber, 'postive number or 0', isNonNegativeNumber, false],
		[ensureValueIsNotNegativeNumberIfExist, 'postive number or 0', isNonNegativeNumber, true],
		[ensureValueIsNumber, 'number', isNumber, false],
		[ensureValueIsObjectIfExist, 'object', isPlainObject, true],
		[ensureValueIsPostiveNumber, 'postive number', isPostiveNumber, false],
		[ensureValueIsString, 'string', isString, false],
		[ensureValueIsStringArray, 'string array', isStringArray, false],
		[ensureValueIsStringArrayIfExist, 'string array', isStringArray, true],
	].forEach(ensureTypeChecker);

	describe(`#${ensureValueIsOneOf.name}`, () => {
		const ensureInKeys = ensureValueIsOneOf(keys);

		it('throws error for invalid parameter', () => {
			[String('one'), String(), isCallable, Array(1), Array('str'), Boolean(), Boolean(true), Object(), Object({a: 1}), Number(1), Number(-1), Number(0), Symbol(''), RegExp(), class {}, new Date()].filter(v => !isNonEmptyArray(v)).forEach(value => {
				expect(() => {
					ensureValueIsOneOf(value);
				}).toThrow('expect first parameter to be a non-empty array');
			});

			entryParameterChecker(ensureInKeys)();
		});

		it('throws error if value is not one of specified values', () => {
			[String('one'), String(), isCallable, Array(1), Array('str'), Boolean(), Boolean(true), Object(), Object({a: 1}), Number(1), Number(-1), Number(0), Symbol(''), RegExp(), class {}, new Date()].forEach(value => {
				expect(() => {
					ensureInKeys([key, value]);
				}).toThrow(`expect \`${key}\` is one of: ${JSON.stringify(keys)}`);
			});
		});

		it('does not throw error if value is one of specified values', () => {
			keys.forEach(value => {
				expect(() => {
					ensureInKeys([key, value]);
				}).not.toThrow();
			});
		});
	});
};
