const fs = require('fs');
const path = './backend/tests/unit/runnerService.test.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/findByPk: mockFindByPk\r?\n\s*},/, 'findByPk: mockFindByPk,\n        findOne: mockFindOne\n      },');

fs.writeFileSync(path, content);
console.log('Fixed mock!');
