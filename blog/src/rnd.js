const rnd = ({max, min = 0}) => Math.random() * max + min;
const rndInt = ({max, min = 0}) => Math.floor(rnd(min, max));
const rndEl = (arr) => arr[rndInt(arr.length)];

const fixedEl = (str, arr) => {
	let x = 0;
		let i = str.length;
		while (i--) {
			x = (x + str.charCodeAt(i)) % arr.length;
	}

	return arr[x];
};

module.exports = {
	rnd,
	rndInt,
	rndEl,
	fixedEl
};