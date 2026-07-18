import { L } from "../helpers";
import type { AcademyCategory } from "../types";

/**
 * Scam Awareness — rebuilt for Phase 3 as one of the strongest parts of the
 * Academy. Every lesson teaches with a concrete, clearly-fictional story, shows
 * the concept visually, and (where useful) lets the reader practice spotting the
 * scam. Copy never normalizes dangerous behavior and never labels a real project
 * a scam — all examples are simulated.
 */
export const scamAwarenessCategory: AcademyCategory = {
  id: "scam-awareness",
  title: "Scam Awareness",
  icon: "alert",
  lessons: [
    L(
      "phishing-and-drainers",
      "Phishing and Wallet Drainers",
      "Phishing sites mimic real wallet or exchange interfaces to steal seed phrases or trick you into signing a draining transaction. Fake support accounts start the con in your DMs.",
      "Most beginners who lose funds are not out-traded. They are tricked into signing or sharing something. Learning the pattern is the single highest-value safety skill.",
      {
        aliases: ["phishing", "drainer", "fake support", "wallet drainer", "scam dm"],
        keywords: ["phishing", "drainer", "seed phrase", "approval", "fake support", "impersonation"],
        shortAnswer:
          "Phishing tricks you into revealing your seed phrase or signing a malicious transaction. Real support never DMs you first and never needs your recovery phrase. Treat any such request as a scam.",
        difficulty: "beginner",
        estimatedMinutes: 7,
        chainScope: "universal",
        learningObjectives: [
          "Recognize the three signals in almost every phishing attempt",
          "Know why 'connect' and 'sign' requests deserve different caution",
          "Build a habit of verifying before you act",
        ],
        sections: [
          {
            kind: "what",
            body: "Phishing is social engineering: a scammer builds a convincing fake (a website, a support 'agent', a pop-up) to get you to hand over access. A wallet drainer is the transaction they want you to sign: once approved, it moves your assets out.",
          },
          {
            kind: "why",
            body: "Fakes can look pixel-perfect. You cannot judge safety by how something looks. You judge it by how you arrived, who contacted whom, and exactly what is being requested.",
          },
          {
            kind: "how",
            body: "Almost every phishing attempt combines three signals: unsolicited contact (they reached out first), a request for something they should never need (your seed phrase, or an unusual signature/approval), and urgency (act now or lose access). Spotting any one should slow you down.",
          },
          {
            kind: "stakes",
            body: "Signing a drainer or entering your seed phrase is usually irreversible. There is no support line that can claw funds back on-chain. The only reliable defense is not signing or sharing in the first place.",
          },
          {
            kind: "safety",
            body: "Bookmark official sites and open them yourself, never from a link in chat or email. Never type your seed phrase anywhere. If a request feels urgent, that is a reason to slow down, not speed up.",
          },
        ],
        story: {
          character: "Maya",
          setup:
            "Maya gets a friendly DM: 'BlackPebble Support here. We detected suspicious activity. Verify your wallet in the next 10 minutes or it will be locked.'",
          expectation: "She thinks she is protecting her funds by acting fast.",
          reality:
            "The 'agent' asks for her 12-word recovery phrase to 'restore access.' The moment she pastes it, the wallet is emptied.",
          lesson:
            "Support never messages first and never needs your recovery phrase. Urgency is the tell. Real security processes don't put a countdown on your funds.",
          beats: [
            { label: "Unsolicited DM", detail: "Support 'reaches out' first", tone: "negative" },
            { label: "Manufactured urgency", detail: "'10 minutes or it locks'", tone: "negative" },
            { label: "The ask", detail: "'Share your recovery phrase'", value: "STOP", tone: "negative" },
            { label: "Safe move", detail: "Ignore, block, verify officially", value: "✓", tone: "positive" },
          ],
        },
        tips: [
          "If someone contacts you first about your wallet, assume it's a scam until proven otherwise.",
          "Your seed phrase is the one thing you never type into a website, form, or chat. Ever.",
          "Reduce urgency by having a rule: you never sign or share anything within 60 seconds of being asked.",
        ],
        commonMistakes: [
          "Believing a message is real because it uses the right brand name or logo.",
          "Signing a transaction because a site 'needs it to continue' without reading it.",
        ],
        diagrams: [
          { id: "connect-vs-sign" },
          { id: "seed-phrase", placement: "inline" },
        ],
        interactiveModules: [{ id: "spot-the-scam" }],
        relatedLessonSlugs: ["fake-ca-impersonation", "fake-airdrops", "warning-signs"],
        related: { label: "Wallet Safety", path: "/safety" },
        callout: {
          type: "safety",
          text: "Real support will never DM you first or ask for your seed phrase. Any request for your recovery phrase is always a scam.",
        },
        quiz: {
          id: "phishing-and-drainers-quiz",
          questions: [
            {
              id: "q1",
              prompt: "A 'support agent' DMs you asking for your recovery phrase to fix an issue. You should:",
              options: [
                "Share it so they can help",
                "Share only the first six words",
                "Never share it, this is a scam",
                "Ask them to verify their identity first",
              ],
              correctIndex: 2,
              explanation:
                "No legitimate service ever needs your recovery phrase. Any request for it is a scam, full stop.",
            },
            {
              id: "q2",
              prompt: "Which combination is the classic phishing pattern?",
              options: [
                "Official app + no urgency + read-only",
                "Unsolicited contact + a request they shouldn't need + urgency",
                "A bookmarked site + a small test + patience",
                "A public address + a price chart + a wallet balance",
              ],
              correctIndex: 1,
              explanation:
                "They reach out first, ask for something they should never need, and pressure you to act fast.",
            },
          ],
        },
      },
    ),
    L(
      "fake-ca-impersonation",
      "Fake Contract Addresses and Impersonation",
      "Scammers deploy tokens with identical symbols or near-identical names to popular projects, then push a fake contract address (CA) so you buy the wrong token.",
      "Two tokens can share a name and ticker but be completely different contracts. Buying the wrong CA can mean buying a worthless or unsellable copy.",
      {
        aliases: ["fake CA", "impersonation", "wrong mint", "fake contract", "copycat token"],
        keywords: ["contract address", "mint", "ticker", "impersonation", "verify"],
        shortAnswer:
          "Anyone can create a token with any name or symbol. The only unique identifier is the contract address (mint). Always confirm the CA from an official source before buying.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "solana",
        learningObjectives: [
          "Understand why a name and ticker prove nothing",
          "Verify a token by its contract address, not its symbol",
          "Get the CA from the project itself, never from chat",
        ],
        sections: [
          {
            kind: "what",
            body: "A contract address (on Solana, the mint) is the token's true identity. Names and tickers are just labels anyone can copy. Impersonators clone a popular token's branding and promote a different CA.",
          },
          {
            kind: "why",
            body: "During a hype moment, scammers flood chats with a fake CA. Buyers in a hurry paste it and buy the copycat, which the scammer controls.",
          },
          {
            kind: "stakes",
            body: "The copycat may be a honeypot (unsellable) or get rugged instantly. Because you bought a different token entirely, there is nothing to recover.",
          },
          {
            kind: "safety",
            body: "Find the CA on the project's official site or verified profile, then match it character-for-character. Bookmark it. Treat any CA pasted in a chat or DM as unverified.",
          },
        ],
        tips: [
          "The token symbol is not proof of anything. The contract address is.",
          "Copy the CA from an official source and compare the first and last few characters carefully.",
          "If a CA is only available 'in the group chat,' that's a red flag, not convenience.",
        ],
        commonMistakes: [
          "Trusting a contract address posted by a stranger in chat or a reply.",
          "Assuming the token with the most hype right now is the 'real' one.",
        ],
        diagrams: [{ id: "wallet-keys" }],
        interactiveModules: [
          {
            id: "spot-the-scam",
            config: {
              title: "Spot the impersonation",
              description:
                "Every example is fictional. Find what should stop you before buying.",
              rounds: [
                {
                  id: "hype-ca",
                  prompt: "Which are red flags? (Select all that apply.)",
                  context:
                    "A reply under a popular token's post says: 'Official CA just dropped 👇 buy fast before it 10x! CA: 7xKf...9adQ (only shared here!)'",
                  fictionLabel: "Simulated post (not real)",
                  multi: true,
                  options: [
                    { id: "reply", label: "CA comes from a reply, not the project", correct: true, note: "Verify from the official source." },
                    { id: "urgency", label: "'Buy fast before it 10x'", correct: true, note: "Urgency + price promises = manipulation." },
                    { id: "only-here", label: "'Only shared here'", correct: true, note: "Real projects publish their CA openly." },
                    { id: "ticker", label: "It uses the token's ticker", correct: false, note: "Tickers are trivially copied." },
                  ],
                  explanation:
                    "The source (a reply), the urgency, and the 'exclusive' CA are all red flags. Confirm the mint from the official site before ever buying.",
                },
              ],
            },
          },
        ],
        relatedLessonSlugs: ["phishing-and-drainers", "honeypots", "warning-signs"],
        callout: { type: "safety", text: "Bookmark official project links. Never trust a CA from chat, replies, or DMs." },
        quiz: {
          id: "fake-ca-quiz",
          questions: [
            {
              id: "q1",
              prompt: "What uniquely identifies a token?",
              options: ["Its name", "Its ticker symbol", "Its contract address (mint)", "Its logo"],
              correctIndex: 2,
              explanation:
                "Names, tickers, and logos can all be copied. The contract address is the token's true identity.",
            },
          ],
        },
      },
    ),
    L(
      "honeypots",
      "Honeypots (Tokens You Can't Sell)",
      "A honeypot is a token you can buy but cannot sell, because the contract restricts selling for most wallets. Your funds are trapped while the creator can still remove value.",
      "A green chart means nothing if you can't actually exit. Honeypots specifically exploit the excitement of a rising price.",
      {
        aliases: ["honeypot", "unsellable", "no sell", "cant sell", "trapped token"],
        keywords: ["honeypot", "sell tax", "blacklist", "unsellable", "test sell"],
        shortAnswer:
          "A honeypot lets you buy but blocks selling. The price can look great while you're quietly trapped. A tiny test sell before committing more is the simplest defense.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "universal",
        sections: [
          {
            kind: "what",
            body: "In a honeypot, the token's code allows buys but blocks or heavily taxes sells for ordinary holders. Only whitelisted wallets (the creator's) can exit.",
          },
          {
            kind: "why",
            body: "It weaponizes FOMO. The chart only goes up because almost no one can sell, which pulls in more buyers whose money is then stuck.",
          },
          {
            kind: "stakes",
            body: "Once you're in a honeypot, there is usually no exit. The 'value' on screen is unrealizable, and the creator drains the real liquidity later.",
          },
          {
            kind: "how",
            body: "Before committing real size, a small test sell tells you whether selling actually works. If a small sell fails or is taxed absurdly, assume the worst and don't add more.",
          },
        ],
        story: {
          character: "Leo",
          setup:
            "Leo buys a token that's up 300% with a chart that never dips. It feels like free money.",
          expectation: "He plans to sell half at 5x and ride the rest.",
          reality:
            "When he tries to sell, every attempt fails. The token is a honeypot: buys work, sells don't. His balance is frozen at a fake number.",
          lesson:
            "A price that only goes up can be a warning, not a gift. A small test sell right after buying would have revealed the trap for a few cents.",
        },
        tips: [
          "A chart that literally never goes down is suspicious, not reassuring.",
          "Do a small test sell soon after buying something brand-new and unaudited.",
          "If a sell fails or is taxed extremely, don't 'average in': get out of the mindset, not deeper in.",
        ],
        commonMistakes: [
          "Treating a one-directional chart as proof of a healthy token.",
          "Adding more funds to 'lower your average' in a token you've never successfully sold.",
        ],
        diagrams: [{ id: "liquidity-pool" }],
        interactiveModules: [
          {
            id: "concept-reveal",
            config: {
              prompt: "A honeypot in two questions: guess, then reveal.",
              cards: [
                { front: "Can you BUY a honeypot token?", back: "Yes, buying is allowed and often looks great. That's the bait." },
                { front: "Can you SELL a honeypot token?", back: "No, selling is blocked or taxed to zero for normal wallets. That's the trap." },
              ],
            },
          },
        ],
        relatedLessonSlugs: ["fake-ca-impersonation", "token-mechanics-risks", "warning-signs"],
        callout: { type: "safety", text: "If you cannot sell a small test amount, assume it is a honeypot and stop adding funds." },
        quiz: {
          id: "honeypots-quiz",
          questions: [
            {
              id: "q1",
              prompt: "What defines a honeypot token?",
              options: [
                "You can sell but not buy",
                "You can buy but not sell",
                "It has low volume",
                "It has a funny name",
              ],
              correctIndex: 1,
              explanation:
                "A honeypot allows buying but blocks selling for ordinary holders, trapping their funds.",
            },
          ],
        },
      },
    ),
    L(
      "fake-airdrops",
      "Fake Airdrops and Malicious NFTs",
      "Unrequested tokens or NFTs can appear in your wallet as bait. 'Claiming' them often means connecting to a malicious site and signing an approval that drains your wallet.",
      "The danger isn't receiving the airdrop. It's interacting with it. Curiosity is the attack vector.",
      {
        aliases: ["airdrop scam", "malicious NFT", "spam NFT", "fake airdrop", "dust attack"],
        keywords: ["airdrop", "nft", "claim", "approval", "spam", "burn"],
        shortAnswer:
          "Surprise tokens and NFTs can be traps. Receiving them is harmless; interacting to 'claim' can trigger a wallet-draining approval. Ignore them, or burn spam with a trusted tool.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "solana",
        sections: [
          {
            kind: "what",
            body: "Scammers send tokens or NFTs to thousands of wallets. The item's name or metadata contains a link promising a valuable 'claim.' The claim page is the trap.",
          },
          {
            kind: "why",
            body: "It exploits curiosity and greed: a surprise item that appears to be worth thousands. But value you didn't earn appearing from nowhere is the hook.",
          },
          {
            kind: "stakes",
            body: "Connecting and signing on the claim site can grant spending approvals that let the attacker move your real assets. The 'reward' is bait for that signature.",
          },
          {
            kind: "safety",
            body: "Never interact with unexpected airdrops. Don't click links in token metadata. Use a trusted wallet cleanup tool to burn spam safely, and keep valuables in a separate wallet.",
          },
        ],
        tips: [
          "Receiving a spam token is not dangerous. Clicking or 'claiming' it is.",
          "Treat any 'you won' surprise in your wallet as spam by default.",
          "Use a burner wallet for experiments so a bad signature can't touch your main funds.",
        ],
        commonMistakes: [
          "Clicking the link inside a surprise NFT to 'see what it is.'",
          "Approving a signature on a claim site to unlock a 'reward.'",
        ],
        diagrams: [{ id: "connect-vs-sign" }],
        relatedLessonSlugs: ["phishing-and-drainers", "warning-signs"],
        related: { label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" },
        callout: { type: "safety", text: "Interacting with unknown airdrops can trigger wallet-draining approvals. Ignore or burn them. Never claim." },
        quiz: {
          id: "fake-airdrops-quiz",
          questions: [
            {
              id: "q1",
              prompt: "A token you never bought appears in your wallet worth '$5,000.' The safest action is to:",
              options: [
                "Claim it quickly before it expires",
                "Connect to the claim site to check",
                "Ignore it and never interact with its link",
                "Sell it immediately",
              ],
              correctIndex: 2,
              explanation:
                "Unexpected airdrops are often bait. Interacting can trigger draining approvals. Ignore or safely burn them.",
            },
          ],
        },
      },
    ),
    L(
      "distribution-risks",
      "Supply Distribution and Insider Risk",
      "Bundled supply hides how much a developer or insiders control across many wallets. Concentrated holders can dump together, and unlocked liquidity means the creator can pull it at any time.",
      "Who holds the supply (and whether liquidity is locked) often matters more than the chart. It's the difference between a trade and a trap.",
      {
        aliases: ["bundled", "concentrated holders", "unlocked LP", "insider supply", "supply distribution"],
        keywords: ["distribution", "holders", "bundle", "liquidity lock", "insider", "concentration"],
        shortAnswer:
          "Check how supply is distributed and whether liquidity is locked. High insider concentration plus unlocked liquidity is a high rug-risk combination.",
        difficulty: "intermediate",
        estimatedMinutes: 6,
        chainScope: "solana",
        sections: [
          {
            kind: "what",
            body: "Distribution is who owns the tokens. 'Bundled' supply is when insiders spread their holdings across many wallets to look decentralized. Liquidity lock status tells you whether the creator can remove the pool.",
          },
          {
            kind: "why",
            body: "If a handful of wallets (or one insider behind many) hold most of the supply, they can sell into every buyer. If liquidity is unlocked, they can also just remove it.",
          },
          {
            kind: "stakes",
            body: "Concentrated supply plus unlocked liquidity is the setup for a coordinated dump or an outright rug. Your exit depends on liquidity that someone else can delete.",
          },
        ],
        tips: [
          "Look past the holder count: many wallets can still be one insider (bundling).",
          "Locked liquidity and broad distribution reduce risk; they never guarantee safety.",
          "Always size positions as if total loss is possible, because with these tokens it is.",
        ],
        commonMistakes: [
          "Assuming many holders means decentralized ownership.",
          "Ignoring liquidity lock status because the price is moving up.",
        ],
        diagrams: [{ id: "holder-concentration" }],
        interactiveModules: [{ id: "holder-concentration-explorer" }],
        relatedLessonSlugs: ["warning-signs", "honeypots", "phishing-and-drainers"],
        callout: { type: "safety", text: "Tokens with high insider concentration and unlocked liquidity are high rug risk." },
        quiz: {
          id: "distribution-risks-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Which combination is the highest rug risk?",
              options: [
                "Broad distribution + locked liquidity",
                "Concentrated insider supply + unlocked liquidity",
                "Many holders + audited contract",
                "Low volume + old token",
              ],
              correctIndex: 1,
              explanation:
                "Concentrated supply lets insiders dump, and unlocked liquidity lets them remove the pool entirely.",
            },
          ],
        },
      },
    ),
    L(
      "token-mechanics-risks",
      "Dangerous Token Mechanics",
      "Hidden mint authority lets a creator print more supply. Freeze authority lets them lock your tokens. Transfer taxes skim a percentage of every trade. Each quietly works against you.",
      "The contract's powers decide what the creator can do to you later. Revoked authorities and no transfer tax are safer defaults.",
      {
        aliases: ["hidden mint", "freeze risk", "tax token", "mint authority", "freeze authority", "transfer tax"],
        keywords: ["mint authority", "freeze authority", "tax", "renounce", "revoke", "contract"],
        shortAnswer:
          "Mint authority can inflate supply, freeze authority can lock your tokens, and transfer taxes skim each trade. Prefer tokens with authorities revoked and no hidden tax.",
        difficulty: "intermediate",
        estimatedMinutes: 6,
        chainScope: "solana",
        sections: [
          {
            kind: "what",
            body: "A token's contract can retain special powers. Mint authority allows creating new supply. Freeze authority allows locking specific wallets. A transfer tax takes a cut of every buy or sell.",
          },
          {
            kind: "why",
            body: "These powers are invisible on a price chart but decide what can be done to holders. Retained mint authority can dilute you to zero; freeze authority can trap you.",
          },
          {
            kind: "stakes",
            body: "If a creator keeps these authorities, they can inflate supply, freeze your ability to sell, or bleed you through taxes, all after you've bought in.",
          },
        ],
        tips: [
          "Prefer tokens where mint and freeze authorities are revoked.",
          "A small, disclosed tax can be legitimate; a hidden or extreme tax is not.",
          "Authorities being revoked reduces certain risks. It never makes a token 'safe.'",
        ],
        commonMistakes: [
          "Ignoring authority status because the token is trending.",
          "Confusing a revoked authority with a full safety guarantee.",
        ],
        diagrams: [{ id: "rug-pull" }],
        relatedLessonSlugs: ["distribution-risks", "honeypots", "warning-signs"],
        callout: { type: "safety", text: "Revoked authorities and no transfer tax are safer defaults, but never a guarantee." },
        quiz: {
          id: "token-mechanics-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Retained mint authority means the creator can:",
              options: [
                "Lower the price directly",
                "Create more supply and dilute holders",
                "Refund your purchase",
                "Lock the chart",
              ],
              correctIndex: 1,
              explanation:
                "Mint authority lets the creator print new tokens, diluting existing holders' share.",
            },
          ],
        },
      },
    ),
    L(
      "fake-activity",
      "Fake Volume and Manufactured Hype",
      "Wash trading inflates volume to fake demand. Bought followers and bot replies simulate a community. Both are designed to make a token look more alive than it is.",
      "If demand is manufactured, the 'community' will vanish exactly when you need liquidity to exit.",
      {
        aliases: ["wash trading", "fake volume", "bot followers", "spoofed social", "manufactured hype"],
        keywords: ["wash trading", "volume", "bots", "engagement", "fake community"],
        shortAnswer:
          "Fake volume (wash trading) and bought social proof make a token look popular so real buyers step in. Cross-check multiple sources and look for organic engagement.",
        difficulty: "intermediate",
        estimatedMinutes: 5,
        chainScope: "universal",
        sections: [
          {
            kind: "what",
            body: "Wash trading is the same actor buying and selling to themselves to inflate volume. Spoofed social is bought followers and bot replies that imitate genuine interest.",
          },
          {
            kind: "why",
            body: "Volume and hype are proxies many beginners use for 'realness.' Faking them is cheap, so scammers manufacture both to pull in genuine money.",
          },
          {
            kind: "stakes",
            body: "When the real demand is zero, the exit is too. You buy into apparent momentum and find no one on the other side when you try to sell.",
          },
        ],
        tips: [
          "Compare volume across independent sources. Inflated numbers often don't match.",
          "Look for specific, varied conversation, not repetitive one-line hype replies.",
          "A large follower count with tiny genuine engagement is a warning, not a green light.",
        ],
        commonMistakes: [
          "Treating high volume as automatic proof of real demand.",
          "Mistaking a wall of bot hype for a genuine community.",
        ],
        diagrams: [{ id: "liquidity-pool" }],
        relatedLessonSlugs: ["warning-signs", "distribution-risks"],
        callout: { type: "beginner", text: "Manufactured hype is loud but shallow. Real communities are specific; bot hype is repetitive." },
        quiz: {
          id: "fake-activity-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Wash trading is used to:",
              options: [
                "Lock liquidity",
                "Inflate volume to fake demand",
                "Reduce token supply",
                "Audit the contract",
              ],
              correctIndex: 1,
              explanation:
                "Wash trading inflates volume so a token appears more in-demand than it really is.",
            },
          ],
        },
      },
    ),
    L(
      "warning-signs",
      "Reading the Warning Signs Together",
      "Extreme slippage, thin or falling liquidity, silent developers, and dropping activity rarely appear alone. Together they often precede a rug or a slow death.",
      "No single signal is proof, but a cluster of them is a strong reason to exit. This lesson ties the whole category together.",
      {
        aliases: ["rug signs", "abandoned token", "no liquidity", "warning signs", "red flags"],
        keywords: ["warning signs", "slippage", "liquidity", "abandoned", "rug", "checklist"],
        shortAnswer:
          "Warning signs cluster: rising slippage, shrinking liquidity, silent devs, and fading activity together are a strong exit signal. Trust the pattern, not any single data point.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        learningObjectives: [
          "Combine multiple signals instead of relying on one",
          "Recognize the sequence a typical rug follows",
          "Know when a cluster of signs means it's time to exit",
        ],
        sections: [
          {
            kind: "what",
            body: "Individual signals (a spike in slippage, a dip in liquidity, a quiet developer) can have innocent explanations. The skill is noticing when several stack up at once.",
          },
          {
            kind: "why",
            body: "Scams and dying tokens follow patterns. Learning the sequence lets you act before the worst of the move, rather than explaining it afterward.",
          },
          {
            kind: "stakes",
            body: "Waiting for certainty usually means waiting until liquidity is gone. By then, selling at any price may be impossible.",
          },
        ],
        tips: [
          "One red flag = pay attention. Several at once = strongly consider exiting.",
          "Rising slippage on a normal-size order often means liquidity is thinning.",
          "Trust your gut: if something feels off, reduce risk first and analyze after.",
        ],
        commonMistakes: [
          "Waiting for a single 'confirmed' signal that never comes in time.",
          "Explaining away a cluster of warnings because you're already in the trade.",
        ],
        diagrams: [{ id: "rug-pull" }, { id: "token-lifecycle", placement: "inline" }],
        interactiveModules: [
          { id: "rug-pull-scenario" },
          {
            id: "sequence-builder",
            config: {
              prompt: "Order the stages of a typical rug pull, earliest to last.",
              steps: [
                { id: "launch", label: "Launch with hype", detail: "New token, big promises" },
                { id: "pump", label: "Coordinated pump", detail: "Manufactured volume and buzz" },
                { id: "fomo", label: "Real buyers FOMO in", detail: "Outsiders provide the exit liquidity" },
                { id: "pull", label: "Liquidity removed", detail: "Insiders drain the pool" },
                { id: "trapped", label: "Holders trapped", detail: "No liquidity left to sell into" },
              ],
            },
          },
        ],
        relatedLessonSlugs: ["distribution-risks", "honeypots", "phishing-and-drainers", "fake-activity"],
        callout: { type: "safety", text: "Trust the cluster, not the single data point. If several warnings stack up, exit and reassess." },
        quiz: {
          id: "warning-signs-quiz",
          questions: [
            {
              id: "q1",
              prompt: "How should you treat warning signs?",
              options: [
                "Ignore them unless one is 100% confirmed",
                "Act on a cluster of them, not just one",
                "Only watch the price",
                "Wait until liquidity is gone to be sure",
              ],
              correctIndex: 1,
              explanation:
                "No single sign is proof, but several together are a strong reason to reduce risk or exit.",
            },
          ],
        },
      },
    ),
  ],
};
