/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MERCADO_PAGO_PUBLIC_KEY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_CHECKIN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
