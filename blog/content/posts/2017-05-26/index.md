---
title: Catigories in TS
date: "2017-05-25T22:40:32.169Z"
cover: "https://upload.wikimedia.org/wikipedia/commons/0/0a/Lead_Photo_For_Category_%28mathematics%290-41319275833666325.png"
category: "tech"
published: false
tags:
    - programming
    - stuff
	- other

---
```js_eval
if (typeof window !== 'undefined') {
	type primitive = number | string;
	type primitiveArr = number[] | string[];

	const CORE_COUNT = 4;

	const range = (size: number) =>  [...Array(CORE_COUNT).keys()];
	const chunk = (size: number) => (arr: primitiveArr) => range(size).map(i => {
		const chunk_size = arr.length / size;
		return arr.slice(i * chunk_size, (i + 1) * chunk_size - 1);
	});


	const CORE_SRC = `
		const FN_CACHE = new Map();
		onmessage = function (e) {  
			const data = JSON.parse(e.data);
			if (!FN_CACHE.has(data.fn)) {
				FN_CACHE.set(data.fn, eval(e.data));
			}
			postMessage(FN_CACHE.get(data.fn)(data.data));
		};
	`;
	class CORE {
		worker: Worker;
		constructor() {
			this.worker = new Worker(
				window.URL.createObjectURL(
					new Blob([CORE_SRC], ('application/ecmascript' as any))
				)
			);
		}

		run (fn: Function, data: primitiveArr) {

		}
	};

	class COREPOOL {
		workerPool: CORE[];
		constructor() {
			this.workerPool = range(CORE_COUNT).map(() => new CORE());
		}
	}



	const pool = new COREPOOL();
	const pmap = (fn: Function) => (arr: primitiveArr) => {
		chunk(CORE_COUNT)(arr).map((data, i) => {
			pool.workerPool[i].run(fn, data);
		});
	};

	pmap(x => x**2);
		(range(19));
}
```