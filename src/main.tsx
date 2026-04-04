import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { BettingProvider } from './context/BettingContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BettingProvider>
      <App />
    </BettingProvider>
  </StrictMode>,
);
