import {
	depth1Has1PageRulePageRule,
	depth2Has3PageRule1NormalGroupPageRule,
	depth4Has9PageRules5NormalGroupsPageRule,
	notNonEmptyObjects,
	normalGroup,
	selfContainedPageRule,
} from '../mock/rules';

import {
	countPageRuleRulesDepth,
	countSameGroups,
	countTotalPageRules,
} from '../../src/utils';

export default () => {
	describe(`#${countPageRuleRulesDepth.name}`, () => {
		it('throws error for non-object or empty-object', () => {
			notNonEmptyObjects.forEach(rules => {
				expect(() => {
					countPageRuleRulesDepth(rules);
				}).toThrow('expect page rule to be a non-empty-object');
			});
		});

		it('throws error for self-contained object', () => {
			expect(() => {
				countPageRuleRulesDepth(selfContainedPageRule);
			}).toThrow(`self-contained page rule is not allow`);
		});

		it('counts rules depth properly', () => {
			expect(countPageRuleRulesDepth(depth1Has1PageRulePageRule)).toBe(1);
			expect(countPageRuleRulesDepth(depth2Has3PageRule1NormalGroupPageRule)).toBe(2);
			expect(countPageRuleRulesDepth(depth4Has9PageRules5NormalGroupsPageRule)).toBe(4);
		});
	});

	describe(`#${countSameGroups.name}`, () => {
		it('throws error for non-object or empty-object rules', () => {
			notNonEmptyObjects.forEach(rules => {
				expect(() => {
					countSameGroups(rules, normalGroup);
				}).toThrow('expect page rule to be a non-empty-object');
			});
		});

		it('throws error for non-object and empty-object group', () => {
			notNonEmptyObjects.forEach(group => {
				expect(() => {
					countSameGroups(depth4Has9PageRules5NormalGroupsPageRule, group);
				}).toThrow('expect group to be an non-empty object');
			});
		});

		it('throws error for self-contained object', () => {
			expect(() => {
				countSameGroups(selfContainedPageRule, normalGroup);
			}).toThrow(`self-contained page rule is not allow`);
		});

		it('counts same groups properly', () => {
			expect(countSameGroups(depth2Has3PageRule1NormalGroupPageRule, normalGroup)).toBe(1);
			expect(countSameGroups(depth4Has9PageRules5NormalGroupsPageRule, normalGroup)).toBe(5);
		});
	});

	describe(`#${countTotalPageRules.name}`, () => {
		it('throws error for non-object and empty-object rules', () => {
			notNonEmptyObjects.forEach(rules => {
				expect(() => {
					countTotalPageRules(rules);
				}).toThrow('expect page rule to be a non-empty-object');
			});
		});

		it('throws error for self-contained object', () => {
			expect(() => {
				countTotalPageRules(selfContainedPageRule);
			}).toThrow(`self-contained page rule is not allow`);
		});

		it('count page rules properly', () => {
			expect(countTotalPageRules(depth1Has1PageRulePageRule)).toBe(1);
			expect(countTotalPageRules(depth2Has3PageRule1NormalGroupPageRule)).toBe(3);
			expect(countTotalPageRules(depth4Has9PageRules5NormalGroupsPageRule)).toBe(9);
		});
	});
};
