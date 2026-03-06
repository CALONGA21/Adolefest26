declare global {
  interface Window {
    mpInstance?: boolean;
    MercadoPago: new (publicKey: string, options?: { locale?: string }) => {
      bricks: () => {
        create: (
          brick: string,
          containerId: string,
          settings: Record<string, unknown>
        ) => Promise<{ unmount: () => void }>;
      };
    };
  }
}

export {};
