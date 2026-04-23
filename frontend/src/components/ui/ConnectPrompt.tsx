'use client';

import { useWallet } from '../../hooks/useWallet';

interface ConnectPromptProps {
  message?: string;
}

export function ConnectPrompt({ message = 'Connect your Freighter wallet to place bets' }: ConnectPromptProps): JSX.Element {
  const { connect } = useWallet();

  return (
    <div className="rounded-xl bg-gray-900 p-6 text-center space-y-3">
      <p className="text-gray-400 text-sm">{message}</p>
      <button
        onClick={connect}
        className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black"
      >
        Connect Wallet
      </button>
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="block text-xs text-amber-400 hover:text-amber-300"
      >
        Don&apos;t have Freighter? Get it here →
      </a>
    </div>
  );
}
