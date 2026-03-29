const fs = require('fs');
const path = require('path');

function walk(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) files = files.concat(walk(full));
    else if (f.endsWith('.html')) files.push(full.split(path.sep).join('/'));
  }
  return files;
}

const distDir = 'parking';
const htmlFiles = walk(distDir);
const pages = new Set(htmlFiles.map(f => '/' + f.replace('/index.html', '/')));

const allLinks = new Set();
htmlFiles.forEach(f => {
  const html = fs.readFileSync(f, 'utf8');
  const re = /href="(\/parking\/[^"#]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) allLinks.add(m[1]);
});

const broken = [...allLinks].filter(l => !pages.has(l)).sort();
console.log('Broken links:', broken.length);
broken.forEach(l => console.log(l));
