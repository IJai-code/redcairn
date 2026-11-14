// REDCAIRN — entry point.
// Phase 1 placeholder: confirms the module pipeline works on GitHub Pages.
// The map engine, layer fusion and telemetry modules land in Phase 3.

const status = document.getElementById('boot-status');
const shell = document.querySelector('.standby');

if (status && shell) {
  status.textContent = 'STANDBY — systems nominal';
  shell.dataset.state = 'ready';
}
