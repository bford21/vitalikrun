import { createContext, useContext, useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

const FarcasterContext = createContext({
  isFarcaster: false,
  context: null,
  isLoading: true,
});

export function useFarcaster() {
  return useContext(FarcasterContext);
}

export function FarcasterProvider({ children }) {
  const [isFarcaster, setIsFarcaster] = useState(false);
  const [context, setContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkFarcaster = async () => {
      try {
        // Try to access Farcaster SDK context
        const ctx = await sdk.context;

        if (ctx && ctx.client) {
          setIsFarcaster(true);
          setContext(ctx);
          console.log('🟣 Running in Farcaster mini app', ctx);

          // Expose context to game.js
          window.farcasterContext = ctx;
          window.isFarcasterApp = true;
        } else {
          setIsFarcaster(false);
          window.isFarcasterApp = false;
        }
      } catch (error) {
        // Not in Farcaster environment
        setIsFarcaster(false);
        window.isFarcasterApp = false;
        console.log('Running in regular web browser');
      } finally {
        setIsLoading(false);
      }
    };

    checkFarcaster();
  }, []);

  return (
    <FarcasterContext.Provider value={{ isFarcaster, context, isLoading }}>
      {children}
    </FarcasterContext.Provider>
  );
}
