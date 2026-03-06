import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  // StrictMode em dev pode montar/desmontar duas vezes e interferir no SDK do Mercado Pago.
  <App />, 
);
