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
      {
        aliases: ["connect wallet", "sign message", "sign transaction", "wallet signing", "connecting wallet", "wallet connection", "approvals"],
        keywords: ["approve", "token approval", "read-only", "permission", "drainer"],
        shortAnswer:
          "Connecting shares your public address (low risk). Signing a message proves ownership without moving funds. Signing a transaction or approval can move or spend your assets. Review it carefully.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "multichain",
        interactiveModules: [{ id: "wallet-signing-challenge" }],
        diagrams: [
          { id: "connect-vs-sign", placement: "top" },
          { id: "wallet-keys", placement: "inline", caption: "Connecting only ever shares your public address, never your keys." },
        ],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Separate connecting, message signing, and transaction signing",
          "Recognize which wallet requests can move funds",
          "Never approve requests blindly",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Connecting a wallet is read-only: it shares your public address. Signing a message proves you control the wallet without spending. Signing a transaction or token approval can move or authorize spending your assets. Treat those very differently.",
          },
          {
            kind: "what",
            body: "A connection request is generally low risk. A message signature is usually safe but should still make sense for what you are doing. A transaction signature and a token approval can move funds or grant spending rights. These are the requests attackers abuse.",
          },
          {
            kind: "why",
            body: "Wallet drainers rely on users approving dangerous requests out of habit. The challenge below shows realistic but fictional prompts and asks you to classify each by risk, so you build the habit of reading before approving.",
          },
          {
            kind: "stakes",
            body: "Approve the wrong request and there is no reversal. A single blind 'approve all' on a fake site can hand an attacker permission to move your tokens whenever they like, even days later. The whole skill is pausing to read before you sign.",
          },
          {
            kind: "safety",
            body: "No legitimate site ever needs your seed phrase or private key. A request for either is always a scam. Verify the destination, amount, and token on any transaction before you sign.",
          },
        ],
        story: {
          character: "Devon",
          setup:
            "Devon clicks a link to 'claim a free airdrop.' The site pops a wallet request that looks routine, so he approves it the way he's approved dozens of connections.",
          expectation: "He thinks he's just connecting to see his airdrop.",
          reality:
            "It wasn't a connection. It was a token approval granting the site permission to move his tokens. Hours later, his wallet is emptied.",
          lesson:
            "Connecting and signing look similar in the moment but do completely different things. Read what each prompt actually asks for; only a signature can move funds.",
          beats: [
            { label: "The bait", detail: "'Free airdrop, connect to claim'", value: "urgency", tone: "negative" },
            { label: "The prompt", detail: "Looked like a connection, was an approval", value: "signed", tone: "negative" },
            { label: "The lesson", detail: "Read before you sign, every time", value: "habit", tone: "neutral" },
          ],
        },
        tips: [
          "Connecting is safe and reversible; signing can be permanent. Know which one you're doing.",
          "If a prompt says 'approve' and you didn't intend to authorize spending, reject it.",
          "Slow down when a site pushes urgency. That pressure is the point.",
        ],
        commonMistakes: [
          "Treating a transaction signature like a harmless connection.",
          "Approving unlimited token spending without reading the prompt.",
        ],
        relatedLessonSlugs: ["wallet-permissions", "private-key-and-seed", "wallet-attacks", "verify-before-signing"],
        callout: { type: "safety", text: "Connecting is low risk. Signing a transaction or approval is high risk. The challenge uses clearly fictional prompts and never asks for real credentials." },
        related: { label: "Wallet Safety", path: "/safety" },
        quiz: {
          id: "connecting-vs-signing-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Which wallet request can actually move your funds?",
              options: [
                "Connecting a wallet",
                "Signing a plain message",
                "Signing a transaction or token approval",
                "Viewing your public address",
              ],
              correctIndex: 2,
              explanation:
                "Transaction signatures and token approvals authorize on-chain actions that can move or spend assets.",
            },
            {
              id: "q2",
              prompt: "A site asks you to type your seed phrase to 'verify' your wallet. You should:",
              options: [
                "Enter it quickly",
                "Never enter it, this is a scam",
                "Enter only half of it",
                "Ask for support first",
              ],
              correctIndex: 1,
              explanation:
                "No legitimate service ever needs your seed phrase. Any request for it is a scam.",
            },
          ],
        },
      },
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
      {
        aliases: ["SOL recovery", "cleanup", "dust", "rent", "wallet cleanup", "close accounts"],
        keywords: ["rent", "empty token account", "dust", "spam NFT", "reclaim SOL"],
        shortAnswer:
          "Empty token accounts lock small amounts of SOL as rent. Wallet Cleanup finds them and closes them so that SOL comes back to you, after you review and sign.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "solana",
        diagrams: [{ id: "wallet-cleanup", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Explain why empty accounts lock up SOL as rent",
          "Understand what Wallet Cleanup recovers and how",
          "Know that cleanup is real, signed, and reviewable",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Every token account on Solana holds a small amount of SOL as 'rent'. When an account is empty, that rent is just sitting there. Wallet Cleanup finds those accounts and closes them so the rent returns to your balance.",
          },
          {
            kind: "what",
            body: "Over time you accumulate empty token accounts, dust (tiny leftover balances), and spam NFTs. Each empty account has recoverable rent. SOL recovery and Wallet Cleanup batch these into transactions you review and sign.",
          },
          {
            kind: "why",
            body: "It is your SOL, just locked in accounts you no longer use. Recovering it consolidates scattered funds back into a usable balance, and clearing spam makes your wallet easier to read.",
          },
          {
            kind: "stakes",
            body: "Cleanup involves real, irreversible on-chain transactions. Closing an account you still need, or burning a token you meant to keep, cannot be undone, so review the list before you sign, and never approve a cleanup you don't understand.",
          },
          {
            kind: "try-in-blackpebble",
            body: "Open Wallet Cleanup, connect a wallet (a burner is fine to start), and it scans read-only for recoverable rent and junk. Nothing happens on-chain until you review the list and sign.",
          },
        ],
        tips: [
          "Empty token accounts are your SOL locked as rent. Cleanup gives it back.",
          "Review every account before signing; closing and burning are permanent.",
          "Try it with a burner wallet first to see how the flow works.",
        ],
        relatedLessonSlugs: ["burning-and-closing", "connecting-vs-signing", "verify-before-signing"],
        relatedFeatures: [{ label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" }],
        related: { label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" },
        quiz: {
          id: "recovery-and-cleanup-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Why does closing an empty token account return some SOL?",
              options: [
                "It's a reward for cleaning up",
                "The account held SOL as rent, which is refunded on close",
                "The network pays interest",
                "It sells the token for you",
              ],
              correctIndex: 1,
              explanation:
                "Token accounts hold a small rent deposit in SOL. Closing an empty account refunds that rent to you.",
            },
            {
              id: "q2",
              prompt: "Wallet Cleanup can move funds without your signature.",
              kind: "boolean",
              options: ["True", "False"],
              correctIndex: 1,
              explanation:
                "Cleanup only creates real on-chain transactions after you review the list and sign. Nothing happens without your approval.",
            },
          ],
        },
      },
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
