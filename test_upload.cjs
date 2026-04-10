const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const filePath = path.resolve('ml_engine/data/sample.csv');

if (!fs.existsSync(filePath)) {
  console.error("Test file not found:", filePath);
  process.exit(1);
}

const form = new FormData();
form.append('dataset', fs.createReadStream(filePath));

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/upload',
  method: 'POST',
  headers: form.getHeaders(),
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("Upload Response Code:", res.statusCode);
    console.log("Upload Response Body:", data);
  });
});

req.on('error', e => console.error("Upload Error:", e));
form.pipe(req);
