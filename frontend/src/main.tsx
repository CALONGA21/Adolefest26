import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.tsx';
import CheckinScanner from './pages/CheckinScanner.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  // StrictMode em dev pode montar/desmontar duas vezes e interferir no SDK do Mercado Pago.
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/admin/checkin" element={<CheckinScanner />} />
    </Routes>
  </BrowserRouter>,
);
