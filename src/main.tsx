import {injectSpeedInsights} from '@vercel/speed-insights';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import './index.css';

injectSpeedInsights();

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Analytics />
  </>
);
