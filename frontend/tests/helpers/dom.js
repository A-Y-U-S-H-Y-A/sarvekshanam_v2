const fs = require('fs');
const path = require('path');

const setupDom = () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    document.body.innerHTML = html;
};

const clearDom = () => {
    document.body.innerHTML = '';
};

module.exports = {
    setupDom,
    clearDom
};
