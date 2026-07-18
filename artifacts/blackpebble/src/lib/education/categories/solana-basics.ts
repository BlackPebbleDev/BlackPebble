import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const solanaBasicsCategory: AcademyCategory = {
  id: "solana-basics",
  title: "Solana Basics",
  icon: "link",
  lessons: [
    L(
      "what-solana-is",
      "What Solana Is",
      "Solana is a high-speed blockchain with low fees designed for scalability. BlackPebble runs on Solana because memecoin trading needs fast, cheap transactions.",
      "Knowing you are on Solana helps you understand addresses, wallets, and transaction costs.",
      { aliases: ["blockchain", "chain"], callout: { type: "beginner", text: "If you are new to crypto, Solana is the network that BlackPebble uses." } },
    ),
    L(
      "transactions",
      "Transactions",
      "A transaction is an on-chain instruction like a swap, transfer, or account close. Transactions are grouped into blocks validated by validators. Confirmation is when the network includes the transaction in a block. Finality is when it becomes irreversible.",
      "Understanding confirmation and finality helps you know when an action is truly complete.",
      { aliases: ["tx", "block", "validator", "confirmation", "finality"] },
    ),
    L(
      "wallet-address",
      "Wallet Address and Public Key",
      "Your wallet address is the public identifier for receiving funds. The public key is the cryptographic form of this address. Both can be shared safely.",
      "You can share your public address to receive tokens without exposing sensitive information.",
      { aliases: ["address", "pubkey", "public key"] },
    ),
    L(
      "private-key-and-seed",
      "Private Key and Seed Phrase",
      "Your private key is the secret that signs transactions. Your seed phrase (recovery phrase) generates all your private keys. Never share either with anyone, ever.",
      "Anyone with your seed phrase can drain your wallet. Store it offline, not in screenshots or cloud notes.",
      {
        aliases: ["seed phrase", "recovery phrase", "secret key", "private key", "mnemonic", "seed words"],
        keywords: ["phishing", "fake support", "recovery", "offline storage", "backup"],
        shortAnswer:
          "Your private key signs transactions and your seed phrase regenerates all your keys. Anyone who gets either controls your funds, so never share or type them into a website.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        interactiveModules: [{ id: "seed-phrase-safety-exercise" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Explain what a seed phrase and private key control",
          "Recognize phishing and fake-support scams",
          "Store recovery material safely offline",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "A seed phrase (recovery phrase) generates every private key in your wallet, and a private key signs transactions. Whoever holds either can move all your funds. They should never be typed into a website, shared with 'support', or stored in a screenshot or cloud note.",
          },
          {
            kind: "what",
            body: "When you create a wallet you get a seed phrase (often 12 or 24 words). From it, the wallet derives your private keys and addresses. The seed phrase is the master backup; the private key is the per-account secret.",
          },
          {
            kind: "why",
            body: "Most catastrophic losses come from leaking recovery material, not from bad trades. Scammers impersonate support, run fake 'wallet validation' sites, and offer fake airdrops that ask you to 'import' your phrase. The exercise below drills these scenarios with clearly fictional prompts.",
          },
          {
            kind: "safety",
            body: "Write the phrase down offline and store it securely. No legitimate service — including BlackPebble — will ever ask for it. If any site, app, or person asks for your seed phrase or private key, it is a scam.",
          },
        ],
        commonMistakes: [
          "Storing the seed phrase in a screenshot, notes app, or cloud drive.",
          "Trusting 'support' who direct messages you and asks to verify your wallet.",
        ],
        relatedLessonSlugs: ["connecting-vs-signing", "wallet-address", "no-seed-phrase-needed"],
        callout: { type: "safety", text: "No legitimate service will ever ask for your seed phrase. This exercise never asks you to type a real one." },
        quiz: {
          id: "private-key-and-seed-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Where should you store your seed phrase?",
              options: [
                "In a cloud notes app",
                "In a screenshot on your phone",
                "Written down offline and kept private",
                "In a reply to wallet support",
              ],
              correctIndex: 2,
              explanation:
                "Recovery phrases belong offline and private, never in the cloud, screenshots, or messages.",
            },
          ],
        },
      },
    ),
    L(
      "token-accounts",
      "Token Accounts",
      "On Solana, each token you hold has a separate token account linked to the mint. An Associated Token Account (ATA) is the default address for a token. Token accounts require rent (a small SOL deposit) to exist.",
      "Empty token accounts hold SOL rent that can be recovered by closing them.",
      { aliases: ["token account", "ATA", "associated token account"], related: { label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" } },
    ),
    L(
      "sol-and-lamports",
      "SOL and Lamports",
      "SOL is the native token used for fees and base-pair trading. Lamports are the smallest SOL unit (1 SOL = 1 billion lamports). You need SOL to pay transaction fees.",
      "Keep a small SOL reserve for fees. Without it, you cannot send transactions.",
      { aliases: ["SOL", "lamport", "lamports"] },
    ),
    L(
      "network-fees",
      "Network Fees",
      "Network fees pay the network to process your transaction. The core idea is universal across chains: every action costs a small fee, and paying more can get you processed faster when the network is busy.",
      "Understanding fees helps you estimate transaction costs, especially during high-activity periods.",
      {
        aliases: ["gas", "transaction fee", "priority fee", "network fee"],
        shortAnswer:
          "Network fees are what you pay a blockchain to process a transaction. The mechanics differ by chain but the idea is the same everywhere.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "multichain",
        chainModules: [
          {
            chain: "solana",
            title: "Solana fees and priority fees",
            body: "Base fees are tiny fractions of a cent. During congestion you can add a priority fee to jump the queue. You pay fees in SOL, so always keep a small SOL reserve.",
          },
          {
            chain: "ethereum",
            title: "Ethereum gas",
            body: "Fees are called gas and are paid in ETH. Gas can be far higher than on Solana and rises sharply with network demand, so timing and gas limits matter.",
          },
          {
            chain: "base",
            title: "Base and L2 fees",
            body: "Base is an Ethereum layer-2, so fees are much lower than Ethereum mainnet but still settle to Ethereum. You pay in ETH on Base.",
          },
        ],
      },
    ),
    L(
      "rent-and-closing",
      "Rent and Closing Accounts",
      "Rent is a small SOL deposit required to keep an account on-chain. Most accounts are rent-exempt (one-time deposit, never consumed). Closing an account returns the rent deposit to your wallet.",
      "Cleaning up empty accounts lets you recover rent SOL from tokens you no longer hold.",
      { aliases: ["rent", "rent-exempt", "close account"], related: { label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" } },
    ),
    L(
      "transaction-verification",
      "Transaction Verification",
      "A transaction signature is a unique ID for each on-chain transaction. Explorers like Solscan let you verify what happened. Checking the signature confirms amount, destination, and status.",
      "Verifying transactions on an explorer protects you from fake confirmations or spoofed receipts.",
      { aliases: ["signature", "tx id", "explorer", "Solscan"], example: "After a swap or recovery, paste the signature into Solscan to confirm the details." },
    ),
    L(
      "failed-transactions",
      "Failed Transactions",
      "A failed transaction did not complete. On Solana, some failure modes still consume network fees. Failures can result from slippage, insufficient funds, or expired conditions.",
      "Check transaction status if something did not appear as expected.",
      { aliases: ["tx failed", "dropped transaction"] },
    ),
    L(
      "programs-and-pdas",
      "Programs and PDAs",
      "Programs are the Solana equivalent of smart contracts. A Program-Derived Address (PDA) is an on-chain account controlled by a program, often used for escrow, vaults, or state.",
      "Knowing about programs helps you understand where funds go in advanced DeFi and campaigns.",
      { aliases: ["smart contract", "PDA", "program"] },
    ),
    L(
      "escrow",
      "Escrow",
      "Escrow holds funds in a secure on-chain program until conditions are met. Neither party can withdraw early. Community Campaigns use escrow-like patterns for funding rounds.",
      "Escrow adds safety by preventing unilateral fund movement until goals are met.",
      { aliases: ["escrow account", "locked funds"], related: { label: "Community Campaigns", path: "/campaigns" } },
    ),
  ],
};
