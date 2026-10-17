/**
 * Run an image through the same pipeline as an admin icon upload (validate, re-encode to a
 * 96x96 WebP) and write the result to disk, to check how an icon will look before uploading
 * it, or to batch-convert a folder.
 *
 *   npm run icon:process -- <input> [output.webp] [--fit cover|contain]
 *   npm run icon:process -- ./icons-in/ ./icons-out/ --fit contain     (every file in a folder)
 */
import fs from 'fs';
import path from 'path';
import { IconError, parseIconFit, processIcon } from '../src/services/iconService';

async function convert(input: string, output: string, fit: ReturnType<typeof parseIconFit>): Promise<boolean> {
  try {
    const icon = await processIcon(fs.readFileSync(input), fit);
    fs.writeFileSync(output, icon.data);
    console.log(`✓ ${input} → ${output} (${icon.data.length} bytes${icon.animated ? ', animated' : ''})`);
    return true;
  } catch (err) {
    console.error(`✗ ${input}: ${err instanceof IconError ? err.message : err}`);
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fitIdx = args.indexOf('--fit');
  const fit = parseIconFit(fitIdx >= 0 ? args[fitIdx + 1] : 'cover');
  const positional = args.filter((_, i) => i !== fitIdx && i !== fitIdx + 1);
  const [input, outputArg] = positional;

  if (!input) {
    console.error('Usage: npm run icon:process -- <input file or folder> [output] [--fit cover|contain]');
    process.exit(1);
  }

  if (fs.statSync(input).isDirectory()) {
    const outDir = outputArg ?? path.join(input, 'processed');
    fs.mkdirSync(outDir, { recursive: true });
    let failed = 0;
    for (const file of fs.readdirSync(input)) {
      const full = path.join(input, file);
      if (!fs.statSync(full).isFile()) continue;
      const out = path.join(outDir, `${path.parse(file).name}.webp`);
      if (!(await convert(full, out, fit))) failed++;
    }
    process.exit(failed > 0 ? 1 : 0);
  }

  const output = outputArg ?? path.join(path.dirname(input), `${path.parse(input).name}.96.webp`);
  process.exit((await convert(input, output, fit)) ? 0 : 1);
}

main();
