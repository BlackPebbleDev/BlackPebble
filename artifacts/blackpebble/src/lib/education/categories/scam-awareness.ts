import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const scamAwarenessCategory: AcademyCategory = {
  id: "scam-awareness",
  title: "Scam Awareness",
  icon: "alert",
  lessons: [
    L(
      "fake-ca-impersonation",
      "Fake CAs and Impersonation",
      "Scammers create tokens with identical symbols or similar names to popular projects. They promote fake contract addresses (CAs) hoping you buy the wrong one.",
      "Always verify the mint from official project sources before buying.",
      { aliases: ["fake CA", "impersonation", "wrong mint"], callout: { type: "safety", text: "Bookmark official project links. Never trust a CA from chat or DMs." } },
    ),
    L(
      "honeypots",
      "Honeypots",
      "A honeypot is a token you can buy but cannot sell due to code restrictions. Unsellable tokens trap funds until the creator drains liquidity.",
      "Small test sells and checking the contract can reveal honeypots before committing more capital.",
      { aliases: ["honeypot", "unsellable", "no sell"], callout: { type: "safety", text: "If you cannot sell a small test amount, assume it is a honeypot." } },
    ),
    L(
      "fake-airdrops",
      "Fake Airdrops and Malicious NFTs",
      "Scam airdrops appear in your wallet, often prompting interaction to claim them. Some malicious NFTs contain approval attacks disguised as free rewards.",
      "Never interact with random airdrops or unfamiliar NFTs. Burn them with a trusted cleanup tool if needed.",
      { aliases: ["airdrop scam", "malicious NFT", "spam NFT"], related: { label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" }, callout: { type: "safety", text: "Interacting with unknown airdrops can trigger wallet-draining approvals." } },
    ),
    L(
      "phishing-and-drainers",
      "Phishing and Drainers",
      "Phishing sites mimic real wallet or exchange UIs to steal credentials or seed phrases. Wallet drainers are contracts that, once signed, empty your wallet. Fake support accounts lure victims through DMs.",
      "Bookmark official sites. Never share your seed phrase. Ignore unsolicited support messages.",
      { aliases: ["phishing", "drainer", "fake support"], callout: { type: "safety", text: "Real support will never DM you first or ask for your seed phrase." } },
    ),
    L(
      "fake-activity",
      "Fake Activity",
      "Fake volume is wash trading that inflates perceived interest. Spoofed social shows bots or bought followers to simulate community. Both mislead about real demand.",
      "Cross-check multiple data sources and look for organic engagement patterns.",
      { aliases: ["wash trading", "fake volume", "bot followers", "spoofed social"] },
    ),
    L(
      "distribution-risks",
      "Distribution Risks",
      "Bundled supply hides dev or insider ownership across multiple wallets. Concentrated holders can coordinate dumps. Unlocked liquidity means the creator can remove liquidity at any time.",
      "Check holder distribution and liquidity lock status before buying.",
      { aliases: ["bundled", "concentrated holders", "unlocked LP"], callout: { type: "safety", text: "Tokens with high insider concentration and unlocked LP are high rug risk." } },
    ),
    L(
      "token-mechanics-risks",
      "Token Mechanics Risks",
      "Hidden mint authority allows the creator to inflate supply. Freeze authority lets them lock your tokens. Tax tokens take a percentage of each trade. All reduce your expected returns or freeze your funds.",
      "Check if authorities are revoked and whether transfer taxes exist.",
      { aliases: ["hidden mint", "freeze risk", "tax token"], callout: { type: "safety", text: "Revoked authorities and no transfer tax are safer defaults." } },
    ),
    L(
      "warning-signs",
      "Warning Signs",
      "Extreme slippage suggests liquidity is nearly gone. Low or declining liquidity makes exits impossible. Abandoned tokens with silent devs and dropping activity often precede rugs.",
      "Multiple warning signs together are a strong sell signal.",
      { aliases: ["rug signs", "abandoned token", "no liquidity"], callout: { type: "safety", text: "Trust your gut. If something feels off, exit and reassess." } },
    ),
  ],
};
