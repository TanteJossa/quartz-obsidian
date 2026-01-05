const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function splitCss() {
  const inputFile = 'temp/styles.css';
  const outputDir = 'quartz/static/tikzjax-fonts';

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileStream = fs.createReadStream(inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const match = trimmedLine.match(/font-family:\s*([^;}]+)/);
    if (match) {
      const fontName = match[1].trim();
      const outputPath = path.join(outputDir, `${fontName}.css`);
      fs.writeFileSync(outputPath, trimmedLine);
      if (count < 5) {
        console.log(`Created ${fontName}.css: ${trimmedLine.substring(0, 100)}...`);
      }
      count++;
    }
  }
  console.log(`Finished splitting ${count} fonts.`);
}

splitCss().catch(console.error);
