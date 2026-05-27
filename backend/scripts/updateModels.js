const fs = require('fs');
const path = require('path');

const dir = './src/db/models';
fs.readdirSync(dir).forEach(file => {
  if (file !== 'index.js' && file.endsWith('.js')) {
    const p = path.join(dir, file);
    let content = fs.readFileSync(p, 'utf8');
    if (!content.includes('paranoid: true')) {
      content = content.replace(/timestamps:\s*true,/g, "timestamps: true,\n    paranoid: true,\n    deletedAt: 'deleted_at',");
      fs.writeFileSync(p, content);
      console.log('Updated ' + file);
    }
  }
});
