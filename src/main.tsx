import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { App } from './ui/app';
import './ui/theme/index.css';
import { applyTheme, storedTheme } from './ui/theme/theme';

// Before the first paint, so the page never flashes the other theme.
applyTheme(storedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
