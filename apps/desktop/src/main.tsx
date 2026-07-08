import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { initLocale } from './i18n/index.js';
import './index.css';

// Load the saved / system locale before the first React render so no
// user-visible text has to flash-swap between languages.
initLocale();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing in index.html');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
