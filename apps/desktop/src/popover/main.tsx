/**
 * Popover window entry — separate from the main app webview.
 *
 * This is the floating panel that pops up when the user fires ⌥+E from
 * inside any macOS app. Architecture-wise it's a sibling SPA mounted to
 * its own HTML file (`popover.html`); both windows talk to the same Rust
 * process and the same in-proc AI gateway.
 *
 * Listens for the Rust event `system-capture` which carries the snippet
 * the user had selected. Calls the same `explainSelection` AI path the
 * main app uses (灵感池 / Lens flow), so we get one source of truth for
 * the explain prompt + Haiku schema validation.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopoverApp } from './PopoverApp.js';
import { initLocale } from '../i18n/index.js';
import '../index.css';

initLocale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopoverApp />
  </StrictMode>,
);
