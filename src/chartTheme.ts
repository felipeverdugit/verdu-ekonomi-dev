/**
 * chartTheme.ts — Global Chart.js-standarder
 *
 * Sätter typsnitt och linjestil för alla diagram i appen, i linje med
 * designspråket i style.css (Fraunces/Source Sans 3/IBM Plex Mono).
 * Rör inte data, skalor eller beräkningar — ren presentation.
 */
import { Chart } from 'chart.js';

let applied = false;

export function applyChartTheme(): void {
  if (applied) return;
  applied = true;

  Chart.defaults.font.family = "'Source Sans 3', system-ui, sans-serif";
  Chart.defaults.font.size = 12;

  if (Chart.defaults.scale) {
    Chart.defaults.scale.ticks.font = { family: "'IBM Plex Mono', ui-monospace, monospace", size: 11 };
  }

  // Bar-only sidor registrerar inte LineElement — elements.line finns då inte.
  if (Chart.defaults.elements.line) {
    Chart.defaults.elements.line.borderCapStyle = 'round';
    Chart.defaults.elements.line.borderJoinStyle = 'round';
  }

  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 16;
  Chart.defaults.plugins.legend.labels.boxHeight = 2;
  Chart.defaults.plugins.legend.labels.padding = 16;

  Chart.defaults.plugins.tooltip.titleFont = { family: "'IBM Plex Mono', ui-monospace, monospace", weight: 600 };
  Chart.defaults.plugins.tooltip.bodyFont = { family: "'Source Sans 3', system-ui, sans-serif" };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
}
