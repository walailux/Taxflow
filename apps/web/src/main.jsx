import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './index.css';
import './theme-dark.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // ไม่ลองซ้ำคำขอที่ผิดเพราะข้อมูล (4xx) ลองซ้ำเฉพาะเครือข่ายขัดข้องหรือเซิร์ฟเวอร์ล่มชั่วคราว
    queries: { retry: (count, err) => count < 2 && (!err || !err.status || err.status >= 500), refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
