/**
 * Unit tests for custom icon processing (src/services/iconService.ts) and the near-duplicate
 * name scoring used by the submission review panel (src/services/similarGames.ts).
 * No database, no network. Run with: npm run test:icons
 */
import sharp from 'sharp';
import { IconError, processIcon, customIconName, isCustomIconName } from '../../src/services/iconService';
import { findSimilarGames, nameSimilarity } from '../../src/services/similarGames';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

async function rejects(name: string, input: Buffer, expected: RegExp): Promise<void> {
  try {
    await processIcon(input);
    check(name, false, 'no error thrown');
  } catch (e) {
    check(name, e instanceof IconError && expected.test(e.message), e instanceof Error ? e.message : String(e));
  }
}

const solid = (width: number, height: number, format: 'png' | 'jpeg' | 'gif' | 'webp') =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 145, b: 60 } } })[format]().toBuffer();

async function main(): Promise<void> {
  // ── processIcon ─────────────────────────────────────────────────────────────────
  for (const format of ['png', 'jpeg', 'gif', 'webp'] as const) {
    const out = await processIcon(await solid(300, 300, format));
    const meta = await sharp(out.data).metadata();
    check(`${format} → 96×96 webp`, meta.format === 'webp' && meta.width === 96 && meta.height === 96,
      `${meta.format} ${meta.width}×${meta.height}`);
  }

  const wide = await solid(400, 100, 'png');
  for (const fit of ['cover', 'contain'] as const) {
    const meta = await sharp((await processIcon(wide, fit)).data).metadata();
    check(`wide image with fit=${fit} → exactly 96×96`, meta.width === 96 && meta.height === 96);
  }
  // contain pads a wide image top and bottom with the warm near-black.
  const padded = await sharp((await processIcon(wide, 'contain')).data).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = padded.data.subarray(0, 3);
  check('fit=contain pads with #0d0b08', Math.abs(r - 13) < 6 && Math.abs(g - 11) < 6 && Math.abs(b - 8) < 6, `${r},${g},${b}`);

  const withExif = await sharp(await solid(200, 200, 'jpeg'))
    .withMetadata({ exif: { IFD0: { Copyright: 'secret-marker' } } })
    .jpeg()
    .toBuffer();
  const cleaned = await processIcon(withExif);
  check('EXIF metadata is stripped', !cleaned.data.includes(Buffer.from('secret-marker')) && !(await sharp(cleaned.data).metadata()).exif);

  const trailing = Buffer.concat([await solid(100, 100, 'png'), Buffer.from('<script>alert(1)</script>')]);
  check('bytes appended after the image are dropped', !(await processIcon(trailing)).data.includes(Buffer.from('<script>')));

  const frames = await Promise.all([0, 120, 240].map(hue =>
    sharp({ create: { width: 120, height: 120, channels: 3, background: { r: hue, g: 100, b: 50 } } }).png().toBuffer()));
  const animatedGif = await sharp(frames, { join: { animated: true } }).gif().toBuffer();
  const anim = await processIcon(animatedGif);
  const animMeta = await sharp(anim.data, { animated: true }).metadata();
  check('animated GIF stays animated', anim.animated && (animMeta.pages ?? 1) === 3, `pages=${animMeta.pages}`);

  const a = await processIcon(await solid(100, 100, 'png'));
  const b2 = await processIcon(await solid(100, 100, 'png'));
  const c = await processIcon(await solid(100, 100, 'jpeg'));
  check('hash is stable for the same input', a.hash === b2.hash && /^[0-9a-f]{10}$/.test(a.hash));
  check('hash differs for a different image', a.hash !== c.hash || a.data.equals(c.data));

  await rejects('SVG is rejected', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), /PNG, JPEG, WebP or GIF/);
  await rejects('plain text is rejected', Buffer.from('definitely not an image'), /not a readable image/);
  await rejects('empty file is rejected', Buffer.alloc(0), /empty/);
  await rejects('over 2 MB is rejected', Buffer.alloc(2 * 1024 * 1024 + 1), /2 MB/);

  check('customIconName format', customIconName(412, 'abc123def0') === 'custom/412-abc123def0');
  check('isCustomIconName', isCustomIconName('custom/1-abc') && !isCustomIconName('genshin-impact') && !isCustomIconName(null));

  // ── similarGames ────────────────────────────────────────────────────────────────
  check('server word appended still matches (Limbus Company Global)', nameSimilarity('Limbus Company Global', 'Limbus Company') >= 0.9);
  check('punctuation/case ignored (Punishing: Gray Raven)', nameSimilarity('punishing gray raven', 'Punishing: Gray Raven') === 1);
  check('small typo still close (Cookie Run Crumble vs CookieRun Crumble)', nameSimilarity('Cookie Run Crumble', 'CookieRun: Crumble') > 0.8);
  check('unrelated names score low', nameSimilarity('Azur Promilia', 'Genshin Impact') < 0.3);

  const catalog = [
    { id: 1, name: 'Punishing: Gray Raven', server: 'Global' },
    { id: 2, name: 'Punishing: Gray Raven', server: 'JP' },
    { id: 3, name: 'Genshin Impact', server: 'Asia' },
    { id: 4, name: 'Arknights', server: 'Global' },
  ];
  const found = findSimilarGames('Punishing Gray Raven', catalog);
  check('findSimilarGames returns both PGR servers and nothing else', found.map(g => g.id).sort().join() === '1,2', JSON.stringify(found));

  if (failures > 0) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log('\nALL ICON / SIMILARITY CHECKS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
