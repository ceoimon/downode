import {
	access,
	remove,
	constants,
	chmod,
	ensureDir
} from 'fs-extra';
import {
	set
} from 'winattr';

export function asyncShouldThrowErrorMatch([fn, message]) {
	return fn
		.then(() => {
			throw new Error('No Error');
		})
		.catch(err => {
			expect(err.message).toMatch(message);
		});
}

export const removeAsync = path => new Promise(resolve => {
	remove(path, resolve);
});

export const existAsync = path => new Promise(resolve => {
	access(path, constants.R_OK | constants.W_OK, err => {
		if (err) {
			return resolve(false);
		}
		resolve(true);
	});
});

export const chmodToReadOnlyAsync = path => new Promise(resolve => {
	chmod(path, 0o444, resolve);
});

export const setWindowsReadOnlyAsync = path => new Promise(resolve => {
	set(path, {readonly: true}, resolve);
});

export const ensureDirAsync = path => new Promise(resolve => {
	ensureDir(path, resolve);
});
