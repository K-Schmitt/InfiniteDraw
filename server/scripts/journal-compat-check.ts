import { copyFile } from 'node:fs/promises';
import { StrokeJournal } from '../src/storage/StrokeJournal.js';

const source = process.argv[2];
if (!source) {
  console.error('usage: tsx journal-compat-check.ts <journal-path>');
  process.exit(2);
}

const scratch = `${source}.compat-check-copy`;
await copyFile(source, scratch);
const journal = await StrokeJournal.open(scratch);
const strokes = journal.load();
const authored = strokes.filter((s) => s.authorId !== undefined).length;
console.log(
  JSON.stringify(
    {
      source,
      strokes: strokes.length,
      authored,
      firstId: strokes[0]?.id ?? null,
      lastId: strokes[strokes.length - 1]?.id ?? null,
    },
    null,
    2
  )
);
