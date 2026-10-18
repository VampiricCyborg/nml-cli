import { readFile } from 'node:fs/promises';
import { extractClaim } from '../dist/claim-parser.js';

async function readJsonl(path) {
  const text = await readFile(path, 'utf8');
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

function evaluate(rows) {
  const results = rows.map((row) => {
    const claim = extractClaim(row.text);
    const predicted = claim.type === 'tests_pass' && claim.confidence === 'high';
    return { row, claim, predicted };
  });
  const tp = results.filter(({ row, predicted }) => row.label === 'genuine' && predicted).length;
  const fp = results.filter(({ row, predicted }) => row.label !== 'genuine' && predicted).length;
  const fn = results.filter(({ row, predicted }) => row.label === 'genuine' && !predicted).length;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const categories = [...new Set(rows.map((row) => row.category))].sort();
  return {
    results,
    metrics: { precision, recall, f1, tp, fp, fn },
    categories: categories.map((category) => {
      const subset = results.filter(({ row }) => row.category === category);
      return {
        category,
        total: subset.length,
        genuine: subset.filter(({ row }) => row.label === 'genuine').length,
        highConfidence: subset.filter(({ predicted }) => predicted).length,
        lowConfidence: subset.filter(({ claim }) => claim.type === 'tests_pass' && claim.confidence === 'low').length,
      };
    }),
  };
}

function printReport(name, rows) {
  const report = evaluate(rows);
  const { precision, recall, f1, tp, fp, fn } = report.metrics;
  console.log(`\n${name}: ${rows.length} examples`);
  console.log(`precision=${precision.toFixed(3)} recall=${recall.toFixed(3)} F1=${f1.toFixed(3)} (TP=${tp}, FP=${fp}, FN=${fn})`);
  console.table(report.categories);
  return report;
}

const dev = await readJsonl(new URL('./dev.jsonl', import.meta.url));
const heldout = await readJsonl(new URL('./heldout.jsonl', import.meta.url));
printReport('Development set', dev);
if (process.env.BENCH_HELDOUT_CONFIRMED === '1') {
  printReport('Held-out set', heldout);
} else {
  console.log(`\nHeld-out set: ${heldout.length} candidate examples loaded; skipped until a human confirms every label.`);
}
