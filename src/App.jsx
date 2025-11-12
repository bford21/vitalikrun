import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton, RainbowKitProvider, useConnectModal } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount, useConnect } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { config } from './wagmi';
import { useEffect } from 'react';
import { FarcasterProvider, useFarcaster } from './FarcasterProvider';

const queryClient = new QueryClient();

function GameContainer() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isFarcaster, isLoading } = useFarcaster();
  const { connect, connectors } = useConnect();

  // Auto-connect Farcaster wallet when in Farcaster app
  useEffect(() => {
    if (isFarcaster && !isConnected && !isLoading) {
      console.log('🟣 Attempting to auto-connect Farcaster wallet...');
      console.log('🟣 Available connectors:', connectors.map(c => ({ id: c.id, name: c.name, type: c.type })));

      const farcasterConnector = connectors.find(c => c.id === 'farcaster');
      if (farcasterConnector) {
        console.log('🟣 Found Farcaster connector:', farcasterConnector);
        try {
          connect({ connector: farcasterConnector });
          console.log('🟣 Connect called successfully');
        } catch (error) {
          console.error('❌ Failed to connect:', error);
        }
      } else {
        console.log('⚠️ Farcaster connector not found. Available:', connectors.map(c => c.id));
      }
    }
  }, [isFarcaster, isConnected, isLoading, connect, connectors]);

  useEffect(() => {
    // Update wallet state for game.js
    window.walletAddress = address || null;
    window.isWalletConnected = isConnected;
    window.openWalletModal = openConnectModal;
    window.isFarcasterApp = isFarcaster;

    console.log('Wallet state update:', {
      address,
      isConnected,
      isFarcaster,
      isFarcasterApp: window.isFarcasterApp
    });

    window.dispatchEvent(new CustomEvent('walletChange', {
      detail: { address, isConnected, isFarcaster }
    }));
  }, [address, isConnected, openConnectModal, isFarcaster]);

  return null;
}

function WalletButton() {
  const { isFarcaster } = useFarcaster();

  // Hide wallet button in Farcaster (auto-connects with embedded wallet)
  if (isFarcaster) {
    return null;
  }

  return (
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
  );
}

export default function App() {
  return (
    <FarcasterProvider>
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
            <WalletButton />
            <GameContainer />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </FarcasterProvider>
  );
}
