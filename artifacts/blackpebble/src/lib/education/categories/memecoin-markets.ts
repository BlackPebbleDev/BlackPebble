import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const memecoinMarketsCategory: AcademyCategory = {
  id: "memecoin-markets",
  title: "Memecoin Market Dynamics",
  icon: "rocket",
  lessons: [
    L(
      "launch-lifecycle",
      "Launch Lifecycle",
      "Memecoins often start on a bonding curve (price rises with each buy), then migrate to a DEX after graduation when a funding threshold is met. Pre-migration tokens have different liquidity rules than post-migration tokens.",
      "Understanding phases helps you know whether a token is early, migrating, or established.",
      {
        aliases: ["bonding curve", "migration", "graduation", "new pair", "launch lifecycle", "memecoin launch"],
        keywords: ["pump.fun", "launchpad", "graduation", "liquidity migration", "early buyers"],
        shortAnswer:
          "A memecoin usually moves through creation, early buying on a curve, graduation/migration to a DEX, then open-market trading — each phase carries different liquidity and risk.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "multichain",
        interactiveModules: [{ id: "memecoin-launch-lifecycle" }],
        diagrams: [{ id: "token-lifecycle", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Name the phases of a typical memecoin launch",
          "Explain why pre- and post-migration liquidity differ",
          "Spot which phase carries which risks",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "A launch typically runs: token creation, early buyers on a bonding curve or initial pool, a graduation/migration threshold, liquidity migration to a DEX, then open-market trading. Each phase changes how price and liquidity behave.",
          },
          {
            kind: "what",
            body: "Creation mints the token. Early buyers push price along a curve or seed an initial pool. Graduation is a funding threshold that triggers migration. Migration moves liquidity to a DEX pair. After that, the token trades on the open market like any other pair.",
          },
          {
            kind: "why",
            body: "Pre-migration tokens can have thin, mechanically-priced liquidity that moves sharply. Post-migration tokens depend on the seeded pool depth. Knowing the phase tells you whether you are early, at a volatile handoff, or in an established market.",
          },
          {
            kind: "stakes",
            body: "Buy without knowing the phase and you can walk straight into the top. Most attention — and most buying — arrives near the peak, right before early buyers take profit and the token fades. Recognizing the lifecycle is how you avoid being the exit liquidity for someone who got in far cheaper.",
          },
          {
            kind: "common-mistakes",
            body: "Assuming every chain and launchpad works exactly like one platform. The core lifecycle is universal, but thresholds, curves, and fees vary by launchpad and chain.",
          },
        ],
        story: {
          character: "Aria",
          setup:
            "Aria sees a token trending everywhere — group chats, feeds, big green candles — and buys because 'everyone' is in it.",
          expectation: "She expects the momentum to keep going up.",
          reality:
            "The hype she saw was the peak. Early buyers who entered near launch use the wave of new attention to sell into, and the token fades over the next hours.",
          lesson:
            "Peak attention often marks peak price, not the start. Knowing where a token sits in its lifecycle matters more than how loud the hype is.",
          beats: [
            { label: "Launch", detail: "Quiet, cheap, early buyers enter", value: "cheap", tone: "positive" },
            { label: "Pump", detail: "Attention builds, price climbs", value: "hype", tone: "neutral" },
            { label: "Peak", detail: "Everyone's talking — Aria buys", value: "top", tone: "negative" },
            { label: "Fade", detail: "Early buyers sell into the hype", value: "down", tone: "negative" },
          ],
        },
        tips: [
          "Loud hype often means late, not early. Check where the token is in its lifecycle.",
          "Pre-migration liquidity is thin and moves fast — treat it with extra caution.",
          "Being 'early' is about the phase, not about how excited the chat is.",
        ],
        commonMistakes: [
          "Treating a pre-migration price like a deep, liquid market.",
          "Ignoring the volatility around the migration handoff.",
        ],
        relatedLessonSlugs: ["bonding-curves", "liquidity-seeding", "top-holders", "rug-pulls"],
        related: { label: "Markets", path: "/markets" },
        quiz: {
          id: "launch-lifecycle-quiz",
          questions: [
            {
              id: "q1",
              prompt: "What is graduation in a memecoin launch?",
              options: [
                "The token is delisted",
                "A funding threshold that triggers migration to a DEX",
                "The developer sells everything",
                "A guaranteed price increase",
              ],
              correctIndex: 1,
              explanation:
                "Graduation is a funding threshold that moves the token from its launch curve to a DEX pool.",
            },
          ],
        },
      },
    ),
    L(
      "bonding-curves",
      "Bonding Curves",
      "A bonding curve is a formula that sets a token's price based on how much supply has been bought. Price rises as more tokens are purchased and falls as they are sold, so earlier buyers pay less than later buyers along the same curve.",
      "Bonding curves explain why the first buyers of a launch get a very different price than people who buy after a wave of demand.",
      {
        aliases: ["bonding curve", "curve", "price curve", "launch curve"],
        keywords: ["early buyers", "migration threshold", "constant product", "launchpad curve"],
        shortAnswer:
          "A bonding curve prices a token by how much supply has been bought: buying pushes price up along the curve, selling pushes it down.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "multichain",
        interactiveModules: [{ id: "bonding-curve-simulator" }],
        diagrams: [{ id: "bonding-curve", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Explain how a bonding curve sets price from supply sold",
          "See why early buyers pay less than later buyers",
          "Understand the migration threshold concept",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "A bonding curve is a pricing formula: the more supply that has been bought, the higher the price, and selling moves back down the curve. It lets a token trade before it has a traditional liquidity pool.",
          },
          {
            kind: "what",
            body: "Instead of matching buyers and sellers, a bonding curve prices each buy and sell directly from a formula tied to supply sold. Early purchases sit low on the curve; as demand climbs the curve, each new buy costs more.",
          },
          {
            kind: "why",
            body: "This is why the earliest buyers of a launch have a much lower cost basis than people who arrive after a pump. It also concentrates risk: if demand reverses, price slides back down the same curve.",
          },
          {
            kind: "stakes",
            body: "If you don't understand the curve, a fast-rising price feels like proof the token is 'winning' — when it's just the formula charging later buyers more. Buy high on the curve and the same mechanism that lifted the price will drop it just as fast the moment buying slows.",
          },
          {
            kind: "advanced",
            advanced: true,
            body: "Different launchpads use different curve shapes (linear, exponential, or constant-product style). The simulator here uses a clearly simplified educational curve to build intuition, not to reproduce any specific launchpad's exact formula. Once a funding threshold is met, the token typically migrates to a standard DEX pool and stops pricing from the curve.",
          },
        ],
        story: {
          character: "Marco",
          setup:
            "Marco watches a brand-new token's price tick up every few seconds and reads it as unstoppable momentum, so he buys near the top of the curve.",
          expectation: "He expects the steady climb to keep going.",
          reality:
            "The climb was just the curve charging each new buyer more. When buying pauses, sells push the price right back down the same curve — and he's underwater almost immediately.",
          lesson:
            "On a bonding curve, price rises because people are buying, not because the token is 'succeeding.' The earliest buyers pay the least; late buyers carry the most risk.",
          beats: [
            { label: "Early buyer", detail: "Buys low on the curve", value: "cheap", tone: "positive" },
            { label: "The climb", detail: "Each buy costs more (the formula)", value: "up", tone: "neutral" },
            { label: "Marco buys", detail: "Near the top, chasing momentum", value: "high", tone: "negative" },
            { label: "The slide", detail: "Selling walks price back down", value: "down", tone: "negative" },
          ],
        },
        tips: [
          "A rising curve price means more buying, not a guarantee the token will keep climbing.",
          "The earlier you are on a curve, the cheaper your cost basis — and the later, the riskier.",
          "Selling moves price back down the same curve, so exits can be sharp.",
        ],
        commonMistakes: [
          "Assuming the curve guarantees the price keeps rising — selling moves back down it.",
          "Treating one launchpad's curve as if every curve is identical.",
        ],
        relatedLessonSlugs: ["launch-lifecycle", "liquidity-seeding", "price-impact-and-slippage"],
        related: { label: "Markets", path: "/markets" },
        quiz: {
          id: "bonding-curves-quiz",
          questions: [
            {
              id: "q1",
              prompt: "On a bonding curve, later buyers usually pay:",
              options: [
                "Less than earlier buyers",
                "The same as earlier buyers",
                "More than earlier buyers",
                "Nothing",
              ],
              correctIndex: 2,
              explanation:
                "Buying pushes price up the curve, so later buyers pay more than earlier ones.",
            },
          ],
        },
      },
    ),
    L(
      "liquidity-seeding",
      "Liquidity Seeding",
      "Liquidity seeding is when early funds create the DEX pool at migration. The initial pool depth affects post-migration volatility and slippage.",
      "Thin initial liquidity means early swaps may have large price impact.",
      { aliases: ["LP seeding", "initial liquidity"] },
    ),
    L(
      "wallet-distribution",
      "Wallet Distribution",
      "Dev wallet is the creator address. Bundled supply is when the dev launches with tokens spread across multiple wallets. Snipers buy immediately at launch, often with bots. Insiders get tokens before or at launch through coordination.",
      "High insider or bundled concentration increases dump risk.",
      { aliases: ["dev wallet", "sniper", "insider", "bundled supply"], callout: { type: "safety", text: "Beware of tokens where the dev or insiders hold large percentages." } },
    ),
    L(
      "top-holders",
      "Top Holders and Distribution",
      "Top holder percentage shows how much supply sits in the largest wallets. Concentrated ownership means fewer players can move the market.",
      "Diversified holder bases are generally safer from coordinated sells.",
      {
        aliases: ["holder distribution", "whale concentration", "top 10 holders", "holder concentration", "developer wallet", "dev supply"],
        keywords: ["top holders", "whale", "distribution risk", "clusters", "developer supply"],
        shortAnswer:
          "Holder concentration measures how much supply the largest wallets control. The more concentrated it is, the more a few holders can move the market.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "universal",
        interactiveModules: [{ id: "holder-concentration-explorer" }],
        diagrams: [{ id: "holder-concentration", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Read top-holder and top-10 percentages",
          "Explain why concentration raises dump risk",
          "Avoid treating any single threshold as universally safe",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Holder concentration is how much of the supply the biggest wallets hold. High concentration means a small number of holders (whales, insiders, or the developer) can move price on their own.",
          },
          {
            kind: "what",
            body: "Top-holder percentage looks at the single largest wallets. Top-10 percentage sums the ten largest. Developer supply and clustered wallets (multiple addresses controlled together) can hide true concentration.",
          },
          {
            kind: "why",
            body: "If a few wallets hold most of the supply, coordinated selling can crash the price while everyone else is stuck. A wider distribution is generally more resilient, though it is never a guarantee.",
          },
          {
            kind: "stakes",
            body: "Skip the holder check and you might be buying a token where one wallet can end the game whenever it wants. If a single holder controls most of the supply, they can dump on every buyer at once — and you'd be one of them. This is a two-minute check that avoids a permanent loss.",
          },
          {
            kind: "common-mistakes",
            body: "Trusting a single 'safe' concentration number. Real distributions vary, wallets can be split to look decentralized, and locked/burned supply changes the picture.",
          },
        ],
        story: {
          character: "Jonah",
          setup:
            "Jonah loves a token's chart and community and buys in without checking who holds the supply.",
          expectation: "He expects a healthy, widely-held token.",
          reality:
            "One wallet quietly holds 40% of supply. When it sells, the price craters in minutes and there aren't enough buyers to absorb it. Jonah is stuck.",
          lesson:
            "A great chart can't protect you from a concentrated holder. Checking the top holders before you buy tells you whether one person can pull the floor out.",
          beats: [
            { label: "The vibe", detail: "Nice chart, active chat", value: "looks good", tone: "positive" },
            { label: "The check skipped", detail: "One wallet holds 40%", value: "hidden risk", tone: "negative" },
            { label: "The dump", detail: "Whale sells into thin buyers", value: "crash", tone: "negative" },
          ],
        },
        tips: [
          "Check the top holders before buying — concentration is a two-minute look that can save you.",
          "One wallet holding a large share means one person can move the price alone.",
          "Watch for clustered wallets: several addresses controlled by the same party hide real concentration.",
        ],
        commonMistakes: [
          "Assuming one fixed concentration percentage is always safe.",
          "Ignoring clustered wallets that are controlled by the same party.",
        ],
        relatedLessonSlugs: ["wallet-distribution", "rug-pulls", "burned-vs-locked"],
        callout: {
          type: "safety",
          text: "Very high top-holder or developer concentration is a warning sign, not proof of a scam. Weigh it alongside liquidity, authorities, and lock status.",
        },
        quiz: {
          id: "top-holders-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Higher holder concentration generally means:",
              options: [
                "Lower dump risk",
                "A few wallets can move the market more easily",
                "The token is guaranteed safe",
                "There is no developer wallet",
              ],
              correctIndex: 1,
              explanation:
                "Concentrated ownership lets a small number of holders move price, raising coordinated-sell risk.",
            },
          ],
        },
      },
    ),
    L(
      "burned-vs-locked",
      "Burned vs Locked Liquidity",
      "Burned liquidity is permanently destroyed. Locked liquidity is inaccessible until a time unlock. Both reduce immediate rug risk, but lock expiration matters.",
      "Verify lock duration and whether the lock provider is trustworthy.",
      { aliases: ["burned LP", "locked LP", "liquidity lock"], callout: { type: "safety", text: "Burned is permanent. Locked can unlock. Check the unlock date." } },
    ),
    L(
      "token-authorities",
      "Token Authorities",
      "Mint authority can create new supply. Freeze authority can lock token accounts. If these are not revoked, the creator retains dangerous powers.",
      "Revoked authorities reduce risk. Check token details before buying.",
      { aliases: ["mint authority", "freeze authority", "revoked authority"], callout: { type: "safety", text: "If mint or freeze authority exists, the creator can manipulate supply or freeze wallets." } },
    ),
    L(
      "token-2022",
      "Token-2022 Extensions",
      "Token-2022 is a newer Solana token standard with additional features like built-in transfer taxes, interest, and metadata. Some features can be misused.",
      "Understand what extensions a token uses before trading.",
      { aliases: ["Token22", "SPL extensions"], callout: { type: "advanced", text: "Token-2022 can enable transfer taxes or other mechanics that affect trades." } },
    ),
    L(
      "market-cap-phases",
      "Market Cap Phases",
      "Launch MC is the initial valuation. Peak MC is the highest reached. Current MC is now. Tracking these phases shows where hype peaked and where it stands relative to history.",
      "Comparing current to peak MC helps frame risk and opportunity.",
      { aliases: ["launch cap", "peak cap", "current cap"] },
    ),
    L(
      "rug-pulls",
      "Rug Pulls",
      "A rug pull is when creators abandon or drain liquidity, crashing the price. A slow rug is a gradual sell-off by insiders. Both leave later buyers holding worthless tokens.",
      "Watch for sudden liquidity removal or coordinated insider sells.",
      {
        aliases: ["rug", "slow rug", "soft rug", "rug pull", "rugpull", "scam token"],
        keywords: ["unlocked liquidity", "mint authority", "warning signs", "insider selling", "fake social proof"],
        shortAnswer:
          "A rug pull is when a token's creators drain or abandon liquidity so the price collapses. Warning signs cluster: concentrated supply, unlocked liquidity, risky authorities, and fake hype.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        interactiveModules: [{ id: "rug-pull-scenario" }],
        diagrams: [{ id: "rug-pull", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "List common rug-pull warning signs",
          "Understand why no single signal is proof",
          "Combine signals to judge risk",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "A rug pull crashes a token when insiders remove liquidity or dump supply. It is rarely one signal: concentrated holders, unlocked liquidity, dangerous token authorities, unverifiable claims, and coordinated hype tend to appear together.",
          },
          {
            kind: "what",
            body: "A hard rug removes or drains liquidity suddenly. A slow rug is a gradual insider sell-off. Both leave later buyers holding tokens they cannot sell at a fair price.",
          },
          {
            kind: "why",
            body: "Learning to weigh several warning signs together protects you better than reacting to any one metric. The exercise below asks you to review a fictional token and identify the risks.",
          },
          {
            kind: "stakes",
            body: "A rug pull is not a bad trade you can recover from — it is a total loss. When the creator pulls liquidity, there is no one left to sell to at any price, and the chain won't reverse it. The whole defense is spotting the warning signs before you buy, because there is no after.",
          },
          {
            kind: "common-mistakes",
            body: "Relying on a single 'green flag' (like a nice website) while ignoring unlocked liquidity or a wallet that controls most of the supply.",
          },
        ],
        story: {
          character: "Elena",
          setup:
            "Elena finds a token with a slick website, a busy chat, and a chart that's straight up. Everyone says it's the next big thing, so she buys.",
          expectation: "She expects to ride the momentum for a quick multiple.",
          reality:
            "The liquidity was never locked and one wallet held most of the supply. Overnight the creator pulls the liquidity — the price goes to near zero and her sell button does nothing.",
          lesson:
            "A polished website and loud hype are marketing, not safety. On-chain facts — locked liquidity, holder spread, revoked authorities — are what actually protect you.",
          beats: [
            { label: "The lure", detail: "Slick site, hype, vertical chart", value: "looks legit", tone: "neutral" },
            { label: "Ignored facts", detail: "Unlocked liquidity, one big wallet", value: "red flags", tone: "negative" },
            { label: "The rug", detail: "Creator pulls liquidity overnight", value: "→ $0", tone: "negative" },
            { label: "The lesson", detail: "Check on-chain facts, not vibes", value: "verify", tone: "positive" },
          ],
        },
        tips: [
          "Hype and a nice website prove nothing — check liquidity locks, holders, and authorities.",
          "If liquidity isn't locked or burned, the creator can remove it at any time.",
          "No single green flag outweighs several red ones. Weigh the signals together.",
          "When something feels too good and too urgent, that's the feeling scammers engineer.",
        ],
        commonMistakes: [
          "Trusting hype and social proof over on-chain facts.",
          "Assuming a single safe signal outweighs several risky ones.",
        ],
        relatedLessonSlugs: ["top-holders", "burned-vs-locked", "token-authorities", "wallet-distribution"],
        callout: { type: "safety", text: "Rugs can happen fast. Watch liquidity, holder changes, and dev activity. This lesson uses fictional tokens only and never labels a real project a scam." },
        quiz: {
          id: "rug-pulls-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Which combination is the strongest rug-pull warning?",
              kind: "multiple",
              options: [
                "Unlocked liquidity",
                "Supply concentrated in a few wallets",
                "Active mint authority",
                "A published roadmap",
              ],
              correctIndices: [0, 1, 2],
              explanation:
                "Unlocked liquidity, concentrated supply, and an active mint authority are all on-chain risk signals; a roadmap alone proves nothing.",
            },
          ],
        },
      },
    ),
    L(
      "cto",
      "Community Takeover",
      "CTO (community takeover) happens when the original dev abandons a project and the community revives it. Success depends on new organizers and remaining liquidity.",
      "CTOs can recover or fail. They are high-risk revival attempts.",
      { aliases: ["CTO", "takeover"] },
    ),
    L(
      "narratives-and-rotation",
      "Narratives and Rotation",
      "A narrative is a trending theme driving attention (AI, cat coins, political tokens). Meta is the current dominant narrative. Rotation is capital moving from one narrative to another. Momentum is the strength of a trend.",
      "Narratives shift fast. Timing entries and exits around rotation is difficult.",
      { aliases: ["narrative", "meta", "rotation", "momentum"] },
    ),
    L(
      "token-size-tiers",
      "Token Size Tiers",
      "Low-cap tokens have small market caps with high volatility. Micro-caps are even smaller and riskier. Blue-chip memecoins have survived and grown large, carrying less speculation risk but also less upside.",
      "Smaller caps move faster in both directions.",
      { aliases: ["low-cap", "micro-cap", "blue chip"] },
    ),
  ],
};
