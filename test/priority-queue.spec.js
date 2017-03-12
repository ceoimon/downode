import makePriorityQueue from '../src/priority-queue';

describe('Priority Queue', () => {
	const _now = Date.now;
	beforeEach(() => {
		Date.now = jest.fn(() => 0);
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		Date.now = _now;
	});

	it('set concurrent to default value while invoke without parameter ', () => {
		const mock1 = jest.fn(done => {
			done();
		});

		const mock2Timeout = 1000;
		const mock2 = jest.fn(done => {
			setTimeout(() => {
				done();
			}, mock2Timeout);
		});

		const mock3Timeout = 2000;
		const mock3 = jest.fn(done => {
			setTimeout(() => {
				done();
			}, mock3Timeout);
		});

		const {addTask, isRunning} = makePriorityQueue(); // set concurrent to 5.
		expect(isRunning()).toBe(false);

		addTask(mock2);
		addTask(mock1);
		addTask(mock3);
		expect(isRunning()).toBe(true);
		expect(setTimeout.mock.calls.length).toBe(3); // task runner inner timeout * 3.
		expect(setTimeout.mock.calls[0][1]).toBe(0);

		jest.runTimersToTime(0); // mock2 run.
		expect(setTimeout.mock.calls.length).toBe(4); // task runner inner timeout * 3 + mock2 timeout.
		expect(setTimeout.mock.calls[3][1]).toBe(mock2Timeout);
		expect(mock2.mock.calls.length).toBe(1);
		expect(mock1.mock.calls.length).toBe(0);
		expect(mock3.mock.calls.length).toBe(0);

		Date.now = jest.fn(() => 40);
		jest.runTimersToTime(40); // after two random delay (<=20), all task should started.
		expect(setTimeout.mock.calls.length).toBe(5); // (task runner inner timeout) * 3 + mock * 2;
		expect(mock2.mock.calls.length).toBe(1);
		expect(mock1.mock.calls.length).toBe(1);
		expect(mock3.mock.calls.length).toBe(1);
		expect(setTimeout.mock.calls[4][1]).toBe(mock3Timeout);

		Date.now = jest.fn(() => 40 + mock2Timeout);
		jest.runTimersToTime(mock2Timeout); // mock2 done
		expect(isRunning()).toBe(true); // mock3 is not done yet.

		Date.now = jest.fn(() => 40 + mock3Timeout);
		jest.runTimersToTime(mock3Timeout - mock2Timeout);
		expect(isRunning()).toBe(false); // all tasks are done.

		expect(() => {
			addTask(mock1, -1);
			jest.runTimersToTime(0);
		}).toThrow('priority queue error: expect `priority` better equal than 0');
	});

	it('sets concurrent to 1 while rate is specified', () => {
		const mock1 = jest.fn(done => {
			done();
		});

		const mock2Timeout = 1000;
		const mock2 = jest.fn(done => {
			setTimeout(() => {
				done();
			}, mock2Timeout);
		});

		const mock3Timeout = 2000;
		const mock3 = jest.fn(done => {
			setTimeout(() => {
				done();
			}, mock3Timeout);
		});
		const rate = 3000;

		const {addTask, isRunning} = makePriorityQueue({
			rate,
			priorityRange: 2
		});
		expect(isRunning()).toBe(false);

		addTask(mock2, 10);
		addTask(mock1);
		addTask(mock3, 0); // mock3 has higher priority than 1
		expect(isRunning()).toBe(true);
		expect(setTimeout.mock.calls.length).toBe(1); // only one task runner inner timeout.
		expect(setTimeout.mock.calls[0][1]).toBe(0);

		jest.runTimersToTime(0); // mock2 run first.

		expect(setTimeout.mock.calls.length).toBe(2); // task runner inner timeout * 1 + mock2 timeout.
		expect(setTimeout.mock.calls[1][1]).toBe(mock2Timeout);
		expect(mock2.mock.calls.length).toBe(1);
		expect(mock1.mock.calls.length).toBe(0);
		expect(mock3.mock.calls.length).toBe(0);

		Date.now = jest.fn(() => mock2Timeout);
		jest.runTimersToTime(mock2Timeout); // mock2 done

		expect(setTimeout.mock.calls.length).toBe(3); // task runner inner timeout * 2 + mock2 timeout.
		expect(setTimeout.mock.calls[2][1]).toBe(rate - mock2Timeout);
		expect(mock1.mock.calls.length).toBe(0);
		expect(mock3.mock.calls.length).toBe(0);

		Date.now = jest.fn(() => rate);
		jest.runTimersToTime(rate - mock2Timeout); // mock3 run.

		expect(setTimeout.mock.calls.length).toBe(4); // task runner inner timeout * 2 + mock2 timeout + mock3 timeout.
		expect(setTimeout.mock.calls[3][1]).toBe(mock3Timeout);
		expect(mock1.mock.calls.length).toBe(0);
		expect(mock3.mock.calls.length).toBe(1);

		Date.now = jest.fn(() => rate + mock3Timeout);
		jest.runTimersToTime(mock3Timeout); // mock3 done.

		expect(setTimeout.mock.calls.length).toBe(5); // task runner inner timeout * 3 + mock2 timeout + mock3 timeout.
		expect(setTimeout.mock.calls[4][1]).toBe(rate - mock3Timeout);
		expect(mock1.mock.calls.length).toBe(0);

		expect(isRunning()).toBe(true); // still running.

		Date.now = jest.fn(() => rate + rate);
		jest.runTimersToTime(rate - mock3Timeout); // mock1 run.
		expect(mock1.mock.calls.length).toBe(1);
		expect(isRunning()).toBe(false);
	});
});
