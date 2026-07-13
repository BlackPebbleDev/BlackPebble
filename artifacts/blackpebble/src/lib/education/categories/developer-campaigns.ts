import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const developerCampaignsCategory: AcademyCategory = {
  id: "developer-campaigns",
  title: "Developer Insights and Campaigns",
  icon: "hand-coins",
  lessons: [
    L(
      "developer-profile",
      "Developer Profile",
      "A developer profile shows token launch history and creator reputation. Past launches, outcomes, and community feedback help assess credibility.",
      "Reviewing dev history helps you avoid repeat offenders and find trustworthy creators.",
      { aliases: ["dev profile", "creator reputation"], related: { label: "Markets", path: "/markets" } },
    ),
    L(
      "campaign-basics",
      "Campaign Basics",
      "A campaign is a community funding round with a clear goal, deadline, and transparent contribution ledger. Organizers create campaigns; contributors fund them.",
      "Campaigns enable coordinated community action with accountability.",
      { aliases: ["campaign", "funding round"], related: { label: "Community Campaigns", path: "/utilities/campaigns" } },
    ),
    L(
      "funding-and-ledger",
      "Funding and Ledger",
      "The funding goal is the target amount. The contribution ledger tracks all contributions with timestamps. Progress is visible to all participants.",
      "Transparent ledgers prevent hidden contributions or surprise changes.",
      { aliases: ["funding goal", "contribution ledger", "contributors"] },
    ),
    L(
      "escrow-and-security",
      "Escrow and Security",
      "Campaign funds are held in escrow, preventing unilateral withdrawal. Dedicated campaign wallets isolate funds from organizer personal assets.",
      "Escrow adds a layer of trust by restricting fund movement until conditions are met.",
      { aliases: ["escrow", "campaign wallet"], callout: { type: "safety", text: "Campaign features are evolving. Verify current behavior before contributing." } },
    ),
    L(
      "campaign-lifecycle",
      "Campaign Lifecycle",
      "Campaigns have a deadline. Funded campaigns met their goal. Failed campaigns did not. Outcomes determine what happens to contributions.",
      "Understand the lifecycle before contributing to know what happens if funding fails.",
      { aliases: ["deadline", "funded", "failed campaign"] },
    ),
    L(
      "refunds-and-settlement",
      "Refunds and Settlement",
      "Refunds return contributions if a campaign fails or is canceled. Settlement distributes funds or executes actions when a campaign succeeds. Both depend on campaign rules.",
      "Read campaign terms to understand refund and settlement conditions.",
      { aliases: ["refund", "settlement"], callout: { type: "advanced", text: "Refund and settlement mechanics may vary. Check campaign details carefully." } },
    ),
    L(
      "execution-proof",
      "Execution Proof",
      "Execution proof shows verifiable on-chain evidence that campaign actions occurred. Transaction proof links to specific transactions. Burn proof confirms token burns.",
      "On-chain proof lets contributors verify that organizers followed through.",
      { aliases: ["transaction proof", "burn proof", "verification"] },
    ),
    L(
      "community-funding-principles",
      "Community Funding Principles",
      "Community funding works best with transparency, clear goals, realistic timelines, and accountable organizers. Start small, build trust, and scale with track record.",
      "Trust is earned over time. Evaluate organizers by their history, not just promises.",
      { aliases: ["crowdfunding", "community fund"], callout: { type: "why", text: "Transparent campaigns build long-term community trust." } },
    ),
  ],
};
