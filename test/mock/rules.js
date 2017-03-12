export const notNonEmptyObjects = [
	undefined,
	null,
	Boolean(),
	'string',
	Number(1),
	Object(),
	Symbol(''),
	Array(1),
	RegExp(),
	class {},
	new Date()
];

/**
 * ▼ Object
 *  ▼ rules: Object
 *   ▼ rules: Object
 *    ▶ rules: Object
 *      selector: ".oops"
 *    ▶ __proto__: Object
 *    selector: ".oops"
 *   ▶ __proto__: Object
 *   selector: ".oops"
 *  ▶__proto__: Object
 */
export const selfContainedPageRule = {
	selector: '.oops'
};
selfContainedPageRule.rules = selfContainedPageRule;

export const normalGroup = {
	concurrent: 10
};
const sameStructureNormalGroup = {
	concurrent: 10
};

const namedRulesRule = {
	selector: '.it.is.a.Rule .not.a.Page.Rule',
	how: 'html'
};
const namedDataRule = {
	list: '.it.is.a.Rule .not.a.Page.Rule',
	data: {
		rules: namedRulesRule
	}
};

const emptyRule = {};
const emptyPageRule = {};

const invalidRuleForFieldCoExist = {
	selector: '.have.data.rules.download.co.exist',
	group: normalGroup,
	rules: {
		selector: '.foo',
		eq: 4,
		rules: {
			selector: '.it.not.a.valid.Rule',
			group: normalGroup
		}
	},
	download: {
		filename: 'foo',
		extension: 'bar'
	},
	data: {
		foo: {
			selector: 'bar',
			group: normalGroup
		}
	}
};

const invalidRuleForNotSelector = {
	do: '.not .have .selector.or.list',
	group: normalGroup,
	rules: {
		selector: '.it.not.a.valid.Rule',
		group: normalGroup
	}
};

const hasDeepNestedOptionsGroup = {
	request: {
		headers: {
			'content-type': 'text/html',
			rules: {
				data: namedDataRule,
				this: 'is not',
				a: 'valid',
				headers: 'option',
				group: normalGroup,
			},
			data: {
				this: 'is not',
				a: 'valid',
				headers: 'option',
				group: normalGroup,
			}
		}
	},
	retry: 5
};

const hasInvalidGroupRule = {
	selector: '.bar',
	data: {
		rules: {
			selector: '.it.is.a.Rule .not.a.Page.Rule',
			trim: false,
			data: {
				rules: namedRulesRule,
				data: namedDataRule
			}
		}
	},
	group: normalGroup // invalid group
};
const hasDeepNestedOptionsInvalidGroupRule = {
	selector: '.qux',
	eq: 4,
	trim: false,
	group: hasDeepNestedOptionsGroup, // invalid group
};
const hasDeepNestedOptionsGroupRule = {
	selector: '.qux',
	eq: 4,
	rules: {
		foo: '.bar'
	},
	group: hasDeepNestedOptionsGroup,
};
const complicatedRule = {
	list: '.corge',
	max: 10,
	data: {
		data: namedDataRule,
		rules: namedRulesRule,
		foo: hasInvalidGroupRule
	}
};

export const depth1Has1PageRulePageRule = {
	foo: '.bar',
	baz: hasDeepNestedOptionsInvalidGroupRule,
	quux: complicatedRule,
	data: namedDataRule,
	rules: {
		selector: '.will not count',
		data: {
			rules: complicatedRule,
			data: complicatedRule
		}
	},
	group: normalGroup // invalid group
};
hasDeepNestedOptionsGroup.request.headers.data.rules = depth1Has1PageRulePageRule; // since this kind of self-contained is invalid options, is not a problem.

export const depth2Has3PageRule1NormalGroupPageRule = {
	foo: {
		selector: '.bar',
		group: normalGroup,
		rules: depth1Has1PageRulePageRule
	},
	baz: hasDeepNestedOptionsGroupRule,
	hey: '.hoo',
	rules: complicatedRule
};

export const depth4Has9PageRules5NormalGroupsPageRule = {
	foo: {
		selector: '.bar',
		group: normalGroup,
		rules: emptyPageRule
	},
	b: emptyRule,
	c: invalidRuleForFieldCoExist,
	f: invalidRuleForNotSelector,
	o: {
		selector: '.bar',
		group: normalGroup,
		download: true
	},
	bo: {
		selector: '.bar',
		group: normalGroup, // invalid group
	},
	h: {
		selector: '.bar',
		group: normalGroup, // invalid group
		data: {}
	},
	w: {
		selector: '.foo',
		group: hasDeepNestedOptionsGroup,
		rules: depth1Has1PageRulePageRule
	},
	qux: {
		list: '.foo',
		group: normalGroup,
		rules: depth2Has3PageRule1NormalGroupPageRule
	},
	bar: {
		selector: '.foo',
		group: sameStructureNormalGroup,
		rules: {
			foo: '.bar',
			bar: {
				list: '.foo',
				group: sameStructureNormalGroup,
				rules: depth2Has3PageRule1NormalGroupPageRule
			}
		}
	},
	hey: '.hoo',
	rules: complicatedRule
};
