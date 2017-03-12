import {
	ensureValueIsNotNegativeNumber,
	ensureValueIsObjectIfExist,
} from './utils';

/**
 * Priority queue options.
 *
 * NOTE:
 * - If rate is specified, concurrent will be overwrite by 1.
 *
 * @typedef PriorityQueueOptions
 * @type {Object}
 * @prop {number} [concurrent=5]
 * @prop {nubmer} [rate=0]
 * @prop {number} [priorityRange]
 */

/**
 * Make an priority queue.
 *
 * An Priority queue is a task queue, it will run tasks automaticaly according
 * to the priority order.
 *
 * @param {PriorityQueueOptions} [options]
 * @return {Object}
 */
export default function makePriorityQueue(options) {
	ensureValueIsObjectIfExist(['frist argument', options]);

	const {
		concurrent,
		defaultPriority,
		priorityRange,
		rate,
	} = processOptions(options);

	let total = 0;
	// Don't do this, since every element in the array will shared the SAME array.
	// let currentSlots = Array(priorityRange).fill([]);
	let currentSlots = [...Array(priorityRange)].map(() => []);
	let nextSlots = currentSlots;
	let running = false;
	let runningTasks = 0;
	let nextRequestTime = Date.now();

	return {addTask, isRunning};

	/**
	 * @typedef Task
	 * @type {Function}
	 * @param {Done} done
	 */

	/**
	 * Add a Task to Priority queue. If queue is not running, start it.
	 *
	 * @param {Task} task
	 * @param {number} [priority]
	 */
	function addTask(task, priority) {
		enqueue(priority, task);
		running = true;
		run();
	}

	/**
	 * Check wether a priority queue is running.
	 *
	 * @return {boolean}
	 */
	function isRunning() {
		return running;
	}

	function run() {
		const isEmpty = total === 0;
		if (runningTasks < concurrent && !isEmpty) {
			++runningTasks;

			const task = dequeue();

			const wait = Math.max(nextRequestTime - Date.now(), 0);
			const caledRate = concurrent > 1 ? geneRandomRate() : rate;
			nextRequestTime = Date.now() + wait + caledRate;

			setTimeout(task, wait, done);
		} else if (isEmpty && runningTasks === 0) {
			running = false;
			if (concurrent > 1) {
				nextRequestTime = Date.now();
			}
		} else if (concurrent > 1) {
			nextRequestTime = Date.now();
		}
	}

	/**
	 * Callback function for indicate a task is done, ready
	 * for run the next task.
	 *
	 * @typedef Done
	 * @type {Function}
	 */
	function done() {
		--runningTasks;
		run();
	}

	function enqueue(priority = defaultPriority, task) {
		if (priority < 0) {
			throw new Error('priority queue error: expect `priority` better equal than 0');
		}

		if (priority > defaultPriority) {
			priority = defaultPriority;
		}

		ensureCanMutateNextSlots();

		nextSlots[priority].push(task);
		++total;
		currentSlots = nextSlots;
	}

	function dequeue() {
		ensureCanMutateNextSlots();

		for (const slot of nextSlots) {
			if (slot.length > 0) {
				--total;
				currentSlots = nextSlots;
				return slot.shift();
			}
		}
	}

	function ensureCanMutateNextSlots() {
		nextSlots = currentSlots.slice();
	}
}

function processOptions({
	rate = 0,
	concurrent = 5,
	priorityRange = 1,
} = {}) {
	const defaultPriority = priorityRange - 1;
	[['priority queue option concurrent', concurrent], ['priority queue option rate', rate], ['priority queue option priorityRange', priorityRange]].forEach(ensureValueIsNotNegativeNumber);

	rate = Math.round(rate);
	priorityRange = Math.round(priorityRange);
	concurrent = rate > 0 ? 1 : Math.round(concurrent);

	return {
		rate,
		concurrent,
		priorityRange,
		defaultPriority
	};
}

/**
 * Generate a small random delay for task run, typically use to avoid requests
 * erupt simultaneously.
 *
 * @return {number}
 */
function geneRandomRate() {
	return 1 + (Math.floor(Math.random() * 2) * Math.floor(Math.random() * 5) * Math.floor(Math.random() * 6));
}
