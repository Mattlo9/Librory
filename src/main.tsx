import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/newsreader/wght-italic.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '@/App';
import { applyThemeToDocument } from '@/hooks/useTheme';
import { useUiStore } from '@/store/uiStore';
import '@/styles/globals.css';

applyThemeToDocument(useUiStore.getState().theme);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el contenedor raíz #root en index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
