import {
	clearLine,
	cursorTo
} from 'readline';

export default function makeProgressBar(completed = 0, total = 1) {
	const stdout = process.stderr;
	const bars = ['█', '░'];
	let timeout;
	clearLine(stdout, 0);
	cursorTo(stdout, 0);
	render();

	return {
		completedOne,
		addOne
	};

	function completedOne() {
		completed++;

		if (!timeout) {
			timeout = setTimeout(render, 60);
		}

		if (completed >= total) {
			clearLine(stdout, 0);
			cursorTo(stdout, 0);
		}
	}

	function addOne() {
		total++;
	}

	function render() {
		clearTimeout(timeout);
		timeout = null;

		let ratio = completed / total;
		ratio = Math.min(Math.max(ratio, 0), 1);

		if (completed === 0) {
			stdout.write('wait for start...');
			return;
		}

		let bar = ` ${completed}/${total}`;

		const availableSpace = Math.max(0, stdout.columns - bar.length - 1);
		const width = Math.min(total, availableSpace);
		const completeLength = Math.round(width * ratio);
		const complete = bars[0].repeat(completeLength);
		const incomplete = bars[1].repeat(width - completeLength);
		bar = `${complete}${incomplete}${bar}`;

		cursorTo(stdout, 0);
		stdout.write(bar);
	}
}
