import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Admin root element #root is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <a href="#main" className="skip-link">
      跳到主要内容
    </a>
    <App />
  </StrictMode>,
);
