import basicHelperTests from './basic-helper';
import errorRelatedFunctionTests from './error-related';
import rulesCountersTests from './rules-counters';

describe('Common utils', () => {
	describe('Error related functions', errorRelatedFunctionTests);

	describe('Basic helpers', basicHelperTests);

	describe('Rules counters', rulesCountersTests);
});
