import {
	isPlainObject
} from 'lodash';

import {
	initRefVar,
	ReferenceVariableWaiter,
	waitFor,
} from '../src/reference-variables';

import {
	asyncShouldThrowErrorMatch
} from './helper';

describe('Reference Variables related', () => {
	describe(`#${waitFor.name}`, () => {
		it('throws error for invalid parameters', () => {
			[
				() => {
					waitFor();
				},
				() => {
					waitFor(true, () => {});
				},
				() => {
					waitFor({
						foo: 'bar',
						bar: false
					}, () => {});
				},
				() => {
					waitFor(['foo', 1], () => {});
				},
				() => {
					waitFor('foo', {}, () => {});
				}
			].forEach(fn => {
				expect(fn).toThrow();
			});
		});

		it('generates a ReferenceVariableWaiter instance', () => {
			const callback = () => {};
			const withoutArgs = waitFor(callback);
			const singleArg = waitFor('foo', callback);
			const multiArgs = waitFor('foo', 'bar', callback);
			const objectArg = waitFor({
				foo: 'bar',
				bar: 'foo'
			}, callback);
			const arrayArg = waitFor(['bar', 'foo'], callback);

			[withoutArgs, singleArg, multiArgs, objectArg, arrayArg].forEach(r => {
				expect(r instanceof ReferenceVariableWaiter).toBe(true);
				expect(r.callback).toBe(callback);
			});

			expect(withoutArgs.refPaths).toBe(undefined);
			expect(singleArg.refPaths).toBe('foo');
			expect(Array.isArray(multiArgs.refPaths)).toBe(true);
			expect(multiArgs.refPaths[0]).toBe('foo');
			expect(multiArgs.refPaths[1]).toBe('bar');
			expect(Array.isArray(arrayArg.refPaths)).toBe(true);
			expect(arrayArg.refPaths[0]).toBe('bar');
			expect(arrayArg.refPaths[1]).toBe('foo');
			expect(isPlainObject(objectArg.refPaths)).toBe(true);
			expect(objectArg.refPaths.foo).toBe('bar');
			expect(objectArg.refPaths.bar).toBe('foo');
		});
	});

	const {
		makeRefVarRelatedFns,
		clearReferVar,
		setRefVar
	} = initRefVar();
	describe(`#${makeRefVarRelatedFns.name}`, () => {
		const rootPageRule = {
			foo: {
				selector: '.bar',
				rules: {
					'bar/r[23]': '.foo',
					'.test': '.vsdf',
					'/bar': '.sdklfj',
					'\\/bar/foo': '.test',
				}
			},
			'bar/r[23]': {
				list: '.foo',
				data: {
					foo: '.bar',
					bar: {
						list: '.bar'
					},
					qux: {
						list: '.bar',
						rules: {
							foo: '.bar'
						}
					}
				}
			},
			bar: '.foo',
			qux: {
				unvalid: 'error'
			},
			d: {
				selector: '.foo',
				download: {
					cookie: 'ceo'
				}
			},
			c: {
				selector: '.bar'
			}
		};
		const {processRefVarString, processRefVarWaiter, getRefVar} = makeRefVarRelatedFns(['bar/r[23][0]'], rootPageRule);
		const {processRefVarString: processRefVarString2, processRefVarWaiter: processRefVarWaiter2, getRefVar: getRefVar2} = makeRefVarRelatedFns(['foo'], rootPageRule);
		it('throws error for invalid parameters', () => {
			expect(() => {
				makeRefVarRelatedFns(true);
			}).toThrow('expect first argument (for entered Page Path) to be a array');
			expect(() => {
				makeRefVarRelatedFns([true]);
			}).toThrow();
		});

		describe(`return three Reference Variables related functions`, () => {
			describe(`#${getRefVar.name} × #${setRefVar.name} × #${clearReferVar.name}`, () => {
				it('get a Reference Variable value', async () => {
					setTimeout(async () => {
						setRefVar(['foo', 'bar/r[23]'], 'foobar');
						setRefVar(['foo', '/bar'], 'barfoo');
						setRefVar(['foo', '.test'], '.foobar');
						setRefVar(['bar/r[23][2]', 'foo'], 'foobar[]');
						setRefVar(['foo', '\\/bar/foo'], 1024);
					}, 0);

					const [
						foobar,
						barfoo,
						dotFoobar,
						listFoobar,
						isNum
					] = await Promise.all([
						getRefVar('../foo/bar\\/r[23\\]'),
						getRefVar('.../foo/\\/bar'),
						getRefVar('../foo/../foo/\\.test'),
						getRefVar('../bar\\/r[23][2]/foo'),
						getRefVar2('./\\\\/bar\\/foo')
					]);

					expect(foobar).toBe('foobar');
					expect(barfoo).toBe('barfoo');
					expect(dotFoobar).toBe('.foobar');
					expect(listFoobar).toBe('foobar[]');
					expect(isNum).toBe(1024);

					setTimeout(clearReferVar, 0);

					await Promise.all([
						[getRefVar('../bar\\/r[23][0]/foo'), `reference variable for path \`bar/r[23][0],foo\` never get`],
						[getRefVar('foo'), 'expect first argument (for Reference Path) start with `.`']
					].map(asyncShouldThrowErrorMatch));
				});
			});

			describe(`#${processRefVarString.name} × #${setRefVar.name} × #${clearReferVar.name}`, () => {
				it('replaces the given template string with Reference Variables', async () => {
					clearReferVar();

					setTimeout(async () => {
						setRefVar(['foo', 'bar/r[23]'], 'foobar');
						setRefVar(['foo', '/bar'], 'barfoo');
						setRefVar(['foo', '.test'], '.foobar');
						setRefVar(['bar/r[23][2]', 'foo'], 'foobar[]');
						setRefVar(['foo', '\\/bar/foo'], 'barbarbar');
						const bar = await processRefVarString2('bar{{./\\\\/bar\\/foo}}bar');
						expect(bar).toBe('barbarbarbarbar');
					}, 0);

					const [normalFoobar, foobar, barfoo, dotFoobar, listFoobar, multiVariables, bar] = await Promise.all([
						processRefVarString('foobar'),
						processRefVarString('foo{{../foo/bar\\/r[23\\]}}'),
						processRefVarString('bar{{.../foo/\\/bar}}'),
						processRefVarString('bar{{../foo/../foo/\\.test}}'),
						processRefVarString('foo{{../bar\\/r[23][2]/foo}}bar'),
						processRefVarString('foo{{../bar\\/r[23][2]/foo}}bar{{../foo/bar\\/r[23\\]}}foo'),
						processRefVarString2('bar{{./\\\\/bar\\/foo}}bar')
					]);

					expect(normalFoobar).toBe('foobar');
					expect(bar).toBe('barbarbarbarbar');
					expect(foobar).toBe('foofoobar');
					expect(barfoo).toBe('barbarfoo');
					expect(dotFoobar).toBe('bar.foobar');
					expect(listFoobar).toBe('foofoobar[]bar');
					expect(multiVariables).toBe('foofoobar[]barfoobarfoo');

					await Promise.all([
						[processRefVarString('bar{{../foo/../foo/..err/\\/bar}}'), `invalid reference path found: expect \`..err\` not to starts with '.' (you can use '\\\\.' to escape '.')`],
						[processRefVarString('bar{{../bar[0]/foo}}'), `invalid reference path found: \`rootPageRule["bar"]\` is not a list`],
						[processRefVarString('bar{{../d[0]/foo}}'), `invalid reference path found: \`rootPageRule["d"]\` is not a list`],
						[processRefVarString('bar{{../qux[0]/foo}}'), `invalid reference path found: \`rootPageRule["qux"]\` is not a list`],
						[processRefVarString('bar{{../foo/\\.test[0]}}'), `invalid reference path found: \`rootPageRule["foo"][".test"]\` is not a list`],
						[processRefVarString('bar{{../ceo}}'), `invalid reference path found: can not find \`rootPageRule["ceo"]\``],
						[processRefVarString('bar{{../bar/foo}}'), `invalid reference path found: can not find \`rootPageRule["bar"]["foo"]\``],
						[processRefVarString('bar{{../bar\\/r[23\\]}}'), `invalid reference path found: \`rootPageRule["bar/r[23]"]\` is a Page Rule list, but likely you forgot to specify index`],
						[processRefVarString('bar{{../bar\\/r[23][0]/qux}}'), `invalid reference path found: \`rootPageRule["bar/r[23][0]"]["qux"]\` is a Page Rule list, but likely you forgot to specify index`],
						[processRefVarString('bar{{../d/foo}}'), `invalid reference path found: can not find \`rootPageRule["d"]["foo"]\``],
						[processRefVarString('bar{{../foo}}'), `invalid reference path found: can refer a whole page data (\`rootPageRule["foo"]\`)`],
						[processRefVarString('bar{{..}}'), `invalid reference path found: can refer a whole page data (\`rootPageRule\`)`]
					].map(asyncShouldThrowErrorMatch));

					expect(() => {
						setRefVar(['foo', 'bar/r[23]'], 'foobar');
					}).toThrow(`duplicate reference Page Path is not allow: \`foo,bar/r[23]\``);

					setTimeout(clearReferVar, 0);

					await Promise.all([
						[processRefVarString2('badslkwemf{{../bar\\/r[23][0]/foo}}'), `reference variable for path \`bar/r[23][0],foo\` never get`],
						[processRefVarString2('badslkwemf{{../bar\\/r[23][2]/bar[1]}}'), `reference variable for path \`bar/r[23][2],bar[1]\` never get`],
						[processRefVarString2('badslkwemf{{../bar\\/r[23][2]/bar[1]}}'), `reference variable for path \`bar/r[23][2],bar[1]\` never get`]
					].map(asyncShouldThrowErrorMatch));
				});
			});

			describe(`#${processRefVarWaiter.name} × #${waitFor.name} × #${setRefVar.name} × #${clearReferVar.name}`, () => {
				it('throw error for invalid parameters', async () => {
					await asyncShouldThrowErrorMatch([processRefVarWaiter('wat'), `expect first argument (for Reference Variable Waiter) to be a ReferenceVariableWaiter instance`]);
				});

				it('invoke callbacks when all variable they require is available', async () => {
					clearReferVar();

					setTimeout(async () => {
						setRefVar(['foo', 'bar/r[23]'], 'foobar');
						setRefVar(['foo', '/bar'], 'barfoo');
						setRefVar(['foo', '.test'], '.foobar');
						setRefVar(['bar/r[23][2]', 'foo'], 'foobar[]');
						setRefVar(['bar/r[23][3]', 'foo'], 233);
						setRefVar(['foo', '\\/bar/foo'], 1024);
					}, 0);

					const mock = jest.fn();
					const mockReturnValue = jest.fn(r => r);
					const noRefVarWaiter = new ReferenceVariableWaiter(mock);
					const singleRefVarWaiter = new ReferenceVariableWaiter(mock, '../foo/bar\\/r[23\\]');
					const arrayRefVarWaiter = new ReferenceVariableWaiter(mock, ['.../foo/\\/bar', '../foo/../foo/\\.test']);
					const objectRefVarWaiter = new ReferenceVariableWaiter(mock, {
						foo: '../bar\\/r[23][2]/foo',
						bar: '../foo/bar\\/r[23\\]',
						quex: '../bar\\/r[23][3]/foo'
					});
					const neverInvokeCBWaiter = new ReferenceVariableWaiter(mock, ['.../foo/\\/bar', '../foo/../foo/\\.test', '../bar\\/r[23][0]/foo']);
					const singleRefVarWaiter2 = new ReferenceVariableWaiter(mockReturnValue, '../foo/bar\\/r[23\\]');

					await Promise.all([
						processRefVarWaiter(noRefVarWaiter),
						processRefVarWaiter(singleRefVarWaiter),
						processRefVarWaiter(arrayRefVarWaiter),
						processRefVarWaiter(objectRefVarWaiter)
					]);
					const value = await processRefVarWaiter2(singleRefVarWaiter2);

					expect(mock.mock.calls.length).toBe(4);
					expect(mock.mock.calls[0][0]).toBe(undefined);
					expect(mock.mock.calls[0][1]).toBe(getRefVar);
					expect(mock.mock.calls[1][0]).toBe('foobar');
					expect(mock.mock.calls[1][1]).toBe(getRefVar);
					expect(mock.mock.calls[2][0]).toEqual(['barfoo', '.foobar']);
					expect(mock.mock.calls[2][1]).toBe(getRefVar);
					expect(mock.mock.calls[3][0]).toEqual({
						foo: 'foobar[]',
						bar: 'foobar',
						quex: 233
					});
					expect(mock.mock.calls[3][1]).toBe(getRefVar);
					expect(value).toBe('foobar');

					setTimeout(clearReferVar, 0);

					await asyncShouldThrowErrorMatch([processRefVarWaiter(neverInvokeCBWaiter), `reference variable for path \`bar/r[23][0],foo\` never get`]);
				});
			});
		});
	});
});
