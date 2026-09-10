import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { loadSettings, saveSettings } from './ui/settings';
import './styles.css';

// Aplica a escala de fonte salva (acessibilidade) já na inicialização
saveSettings(loadSettings());

// PWA: service worker só em produção (em dev atrapalha o HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
