const https = require('https');
const data = `cdn_id=${process.env.CDN_ID}&login=${process.env.CDN_LOGIN}&passwd=${process.env.CDN_PASS}`;
const req = https.request({
	host: 'api.cdn77.com',
	method: 'POST',
	path: '/v2.0/data/purge-all',
	headers: {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Content-Length': Buffer.byteLength(data)
	}
}, (res) => {
	res.on('error', (e) => {
		console.log(e);
		process.exit(1);
	});
	res.on('data', (d) => {
		console.log(d.toString('utf-8'));
	});
});

req.end(data);