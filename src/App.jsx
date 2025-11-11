import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { config } from './wagmi';
import { useEffect } from 'react';

const queryClient = new QueryClient();

function GameContainer() {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    // Expose wallet info to the global game.js
    window.walletAddress = address || null;
    window.isWalletConnected = isConnected;

    // Trigger wallet connection event for game.js
    window.dispatchEvent(new CustomEvent('walletChange', {
      detail: { address, isConnected }
    }));
  }, [address, isConnected]);

  return null;
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <div id="wallet-container" style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 1000
          }}>
            <ConnectButton />
          </div>
          <GameContainer />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
