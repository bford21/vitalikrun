import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton, RainbowKitProvider, useConnectModal } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { config } from './wagmi';
import { useEffect } from 'react';
import { FarcasterProvider, useFarcaster } from './FarcasterProvider';

const queryClient = new QueryClient();

function GameContainer() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isFarcaster, context } = useFarcaster();

  useEffect(() => {
    // In Farcaster, use FID for authentication
    if (isFarcaster && context?.user) {
      window.farcasterUser = context.user;
      window.walletAddress = null; // Don't use wallet in Farcaster mode
      window.isWalletConnected = false;

      // Trigger Farcaster auth event
      window.dispatchEvent(new CustomEvent('walletChange', {
        detail: {
          address: null,
          isConnected: false,
          farcasterFid: context.user.fid,
          farcasterUsername: context.user.username
        }
      }));

      console.log('🟣 Farcaster user:', context.user);
    } else {
      // Regular web/mobile: use wallet
      window.walletAddress = address || null;
      window.isWalletConnected = isConnected;
      window.openWalletModal = openConnectModal;

      window.dispatchEvent(new CustomEvent('walletChange', {
        detail: { address, isConnected }
      }));
    }
  }, [address, isConnected, openConnectModal, isFarcaster, context]);

  return null;
}

function WalletButton() {
  const { isFarcaster } = useFarcaster();

  // Hide wallet button in Farcaster (auto-authenticated)
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
