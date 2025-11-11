import { http, createConfig } from 'wagmi';
import { base, mainnet, optimism, arbitrum } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet, metaMask } from 'wagmi/connectors';

const projectId = '8c5ea67d5ea68c86c53da6e13ac2cfa0';

export const config = createConfig({
  chains: [base, mainnet, optimism, arbitrum],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId,
      showQrModal: true,
      qrModalOptions: {
        themeMode: 'dark'
      }
    }),
    coinbaseWallet({
      appName: 'Vitalik Run',
      appLogoUrl: undefined
    })
  ],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http()
  }
});
