import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const walletsSafetyCategory: AcademyCategory = {
  id: "wallets-safety",
  title: "Wallets and Transaction Safety",
  icon: "wallet",
  lessons: [
    L(
      "connecting-vs-signing",
      "Connecting vs Signing",
      "Connecting a wallet shares your public address with a site for read-only access. Signing a message proves ownership without moving funds. Signing a transaction authorizes an on-chain action that can move assets.",
      "Always distinguish connection (safe) from signing a transaction (can spend).",
      { aliases: ["connect wallet", "sign message", "sign transaction"], callout: { type: "safety", text: "Connecting is low risk. Signing a transaction is high risk. Review every signing prompt." }, related: { label: "Wallet Safety", path: "/safety" } },
    ),
    L(
      "read-only-analysis",
      "Read-Only Wallet Analysis",
      "Read-only tools analyze public wallet data without signing. Portfolio reviews, trade history, and Trading Intelligence work without transaction risk.",
      "Read-only features cannot move your funds because no signing occurs.",
      { aliases: ["read-only", "public wallet data"], related: { label: "Trading Intelligence", path: "/utilities/trading-analysis" } },
    ),
    L(
      "wallet-permissions",
      "Wallet Permissions",
      "Wallets may prompt for permissions like signing messages, approving tokens, or executing swaps. Each prompt grants different access levels. Never approve unlimited spending.",
      "Review each permission prompt carefully. Approvals can be revoked but damage may already be done.",
      { aliases: ["approval", "permissions"], callout: { type: "safety", text: "Unlimited token approvals are dangerous. Approve only what you need." } },
    ),
    L(
      "no-seed-phrase-needed",
      "No Seed Phrase Needed",
      "Legitimate sites never ask for your seed phrase or private key. BlackPebble authenticates through your wallet connection, never direct key entry.",
      "Any site asking for your seed phrase is a scam. Leave immediately.",
      { callout: { type: "safety", text: "Never type your seed phrase into any website, app, or form." }, related: { label: "Wallet Safety", path: "/safety" } },
    ),
    L(
      "wallet-types",
      "Wallet Types",
      "A hot wallet (like Phantom or Solflare) stays connected to the internet for convenience. A cold wallet (hardware wallet) stays offline for security. A burner wallet is a throwaway used to test sites or receive airdrops.",
      "Keep valuable assets in a cold or separate wallet. Use a burner for risky interactions.",
      { aliases: ["hot wallet", "cold wallet", "burner wallet", "hardware wallet"] },
    ),
    L(
      "wallet-attacks",
      "Wallet Attacks",
      "A wallet drainer is a malicious contract that steals assets when you sign. Approval scams trick you into granting spending rights. Fake popups mimic wallet prompts to capture approvals or seed phrases.",
      "Always verify the source before signing. Bookmark official wallet sites and app URLs.",
      { aliases: ["drainer", "approval scam", "fake popup"], callout: { type: "safety", text: "Scammers create convincing fake wallet prompts. Verify you are on the real site." } },
    ),
    L(
      "verify-before-signing",
      "Verify Before Signing",
      "Before approving any transaction, check the destination address, the amount, and the token mint. Fake prompts may show slightly altered addresses or wrong tokens.",
      "Taking 30 seconds to verify can prevent losing everything.",
      { aliases: ["check destination", "verify mint", "review transaction"], callout: { type: "safety", text: "Scammers rely on urgency. Slow down and verify every detail." } },
    ),
    L(
      "disconnect-and-revoke",
      "Disconnecting and Revoking",
      "Disconnecting removes the site from your wallet session. Revoking removes a previously granted token approval. Disconnect after each session and periodically review outstanding approvals.",
      "Disconnecting limits exposure if a site is later compromised.",
      { aliases: ["disconnect", "revoke", "clear approvals"] },
    ),
    L(
      "recovery-and-cleanup",
      "SOL Recovery and Wallet Cleanup",
      "SOL recovery retrieves rent deposits from closed accounts. Wallet Cleanup finds empty token accounts, dust, and spam NFTs that can be closed or burned. Both involve real on-chain transactions after your review and signature.",
      "Recovering rent SOL consolidates scattered funds into usable balance.",
      { aliases: ["SOL recovery", "cleanup", "dust"], related: { label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" } },
    ),
    L(
      "burning-and-closing",
      "Burning and Closing Accounts",
      "Token burning permanently destroys selected assets. Closing an account removes it from the chain and returns rent. Both are irreversible. Compressed NFTs burn without refund because they do not hold rent.",
      "Only burn or close assets you intentionally select. There is no undo.",
      { aliases: ["burn", "close account", "compressed NFT"], callout: { type: "safety", text: "Burning and closing are permanent. Double-check before confirming." } },
    ),
  ],
};
