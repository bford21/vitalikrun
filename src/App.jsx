import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton, RainbowKitProvider, useConnectModal } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { config } from './wagmi';
import { useEffect } from 'react';

const queryClient = new QueryClient();

function GameContainer() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    // Expose wallet info to the global game.js
    window.walletAddress = address || null;
    window.isWalletConnected = isConnected;

    // Expose function to open wallet modal from game.js
    window.openWalletModal = openConnectModal;

    // Trigger wallet connection event for game.js
    window.dispatchEvent(new CustomEvent('walletChange', {
      detail: { address, isConnected }
    }));
  }, [address, isConnected, openConnectModal]);

  return null;
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          initialChain={config.chains[0]}
          appInfo={{
            appName: 'Vitalik Run',
            learnMoreUrl: 'https://github.com/bford21/vitalikrun',
            disclaimer: () => (
              <div style={{ padding: '10px', fontSize: '12px', color: '#888', textAlign: 'center' }}>
                On mobile? Open this page in your wallet's browser (MetaMask, Coinbase Wallet, Rainbow, etc.) or use WalletConnect.
              </div>
            ),
          }}
        >
          <div id="wallet-container" style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 1000
          }}>
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{
                smallScreen: 'avatar',
                largeScreen: 'full',
              }}
            />
          </div>
          <GameContainer />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
