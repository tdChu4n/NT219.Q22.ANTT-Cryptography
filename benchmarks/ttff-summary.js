#!/usr/bin/env node
'use strict';

/**
 * Tổng hợp benchmark TTFF từ file CSV.
 *
 * Input CSV format:
 * scenario,ttff_ms
 * drm,1287
 * clear,702
 *
 * Usage:
 *   node benchmarks/ttff-summary.js benchmarks/ttff-samples.csv
 */

const fs = require('fs');
const path = require('path');

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    n: values.length,
    min: sorted[0] ?? 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    avg: values.length ? sum / values.length : 0,
  };
}

function parseCsv(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV không đủ dữ liệu.');
  }
  const [header, ...rows] = lines;
  if (header.toLowerCase() !== 'scenario,ttff_ms') {
    throw new Error('Header phải là: scenario,ttff_ms');
  }

  const groups = { drm: [], clear: [] };
  for (const row of rows) {
    const [scenarioRaw, ttffRaw] = row.split(',');
    const scenario = (scenarioRaw || '').trim().toLowerCase();
    const ttff = Number(ttffRaw);
    if (!Number.isFinite(ttff) || ttff < 0) {
      throw new Error(`TTFF không hợp lệ: ${row}`);
    }
    if (scenario !== 'drm' && scenario !== 'clear') {
      throw new Error(`Scenario phải là drm hoặc clear: ${row}`);
    }
    groups[scenario].push(ttff);
  }
  return groups;
}

function printSummary(name, stats) {
  console.log(
    `${name.padEnd(5)} | n=${String(stats.n).padStart(2)} | min=${stats.min.toFixed(
      0,
    )}ms | p50=${stats.p50.toFixed(0)}ms | p95=${stats.p95.toFixed(
      0,
    )}ms | max=${stats.max.toFixed(0)}ms | avg=${stats.avg.toFixed(1)}ms`,
  );
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node benchmarks/ttff-summary.js <path-to-csv>');
    process.exit(1);
  }
  const fullPath = path.resolve(inputPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const groups = parseCsv(content);

  const drm = summarize(groups.drm);
  const clear = summarize(groups.clear);

  console.log('TTFF summary');
  console.log('------------');
  printSummary('DRM', drm);
  printSummary('CLEAR', clear);

  if (drm.n > 0 && clear.n > 0) {
    const delta = drm.avg - clear.avg;
    const ratio = clear.avg > 0 ? drm.avg / clear.avg : 0;
    console.log(
      `\nDelta avg (DRM-CLEAR): ${delta.toFixed(1)}ms | Ratio: ${ratio.toFixed(
        2,
      )}x`,
    );
  }
}

main();
