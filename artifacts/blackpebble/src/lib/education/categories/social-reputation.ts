import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const socialReputationCategory: AcademyCategory = {
  id: "social-reputation",
  title: "Social and Reputation",
  icon: "users",
  lessons: [
    L(
      "public-profile-basics",
      "Public Profile Basics",
      "Your public profile shows your trading history, calls, thesis posts, achievements, and badges. Followers can see your activity and track your performance.",
      "A strong profile builds credibility and helps others discover you.",
      { aliases: ["profile", "public profile"], related: { label: "Leaderboard", path: "/leaderboard" } },
    ),
    L(
      "trust-score-explained",
      "Trust Score Explained",
      "Trust Score measures your call and trading quality. Higher trust comes from accurate calls, consistent performance, and time-tested activity.",
      "Trust Score helps others gauge your reliability before following your calls.",
      { aliases: ["trust", "trust score"] },
    ),
    L(
      "bp-score-and-rank",
      "BP Score and Rank",
      "BP Score reflects overall platform engagement and quality. Rank compares your standing to other traders. Both update based on activity and outcomes.",
      "Rank visibility helps surface active, high-quality traders.",
      { aliases: ["BP score", "rank", "ranking"] },
    ),
    L(
      "tiers",
      "Tiers",
      "Tiers group traders by experience level and performance. Higher tiers unlock recognition and sometimes features. Tier progression depends on sustained quality.",
      "Tiers provide clear progression milestones for your trading journey.",
      { aliases: ["tier", "level"] },
    ),
    L(
      "official-badges",
      "Official Badges",
      "Official badges like Founder, Team, or Verified mark special account statuses. These badges are assigned by BlackPebble, not earned through trading.",
      "Official badges help identify trusted accounts and team members.",
      { aliases: ["verified", "founder badge", "team badge"] },
    ),
    L(
      "trader-dna-profile",
      "Trader DNA on Profile",
      "Trader DNA appears on profiles showing trading style patterns. Hold time, entry timing, and position habits reveal your approach.",
      "DNA helps others understand your trading style at a glance.",
      { aliases: ["DNA", "trading style"], related: { label: "Trading Intelligence", path: "/utilities/trading-analysis" } },
    ),
    L(
      "call-and-thesis-history",
      "Call and Thesis History",
      "Your call history shows past public calls with verified outcomes. Thesis history shows your reasoning posts. Trophy case highlights your best-performing calls.",
      "A track record of good calls builds trust and attracts followers.",
      { aliases: ["call history", "thesis history", "trophy case"], related: { label: "Feed", path: "/feed" } },
    ),
    L(
      "profile-sharing",
      "Profile Sharing",
      "Share your profile link so others can view your stats, calls, and achievements. Public equity display shows portfolio value if you choose to share it.",
      "Sharing your profile helps build community connections and credibility.",
      { aliases: ["share profile", "public equity"], related: { label: "Portfolio", path: "/portfolio" } },
    ),
  ],
};
