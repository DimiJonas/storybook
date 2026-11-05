import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { isOnForm } from './api';
import './index.css';
import App from './App';

// Phone app / service worker (see vite.config.js): keeps the app's files on the device.
// When a new version of the app has been deployed, switch to it right away – but never while
// the add/edit form is open (the page reloads, which would lose what you're typing).
const updateSW = registerSW({
  onNeedRefresh() {
    if (!isOnForm()) {
      updateSW(true);
      return;
    }
    const waitForLeavingForm = setInterval(() => {
      if (!isOnForm()) {
        clearInterval(waitForLeavingForm);
        updateSW(true);
      }
    }, 2000);
  },
  onRegisteredSW(swUrl, registration) {
    // An app on the home screen can stay open for days: look for a new version whenever it
    // comes back to the screen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration?.update();
    });
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
