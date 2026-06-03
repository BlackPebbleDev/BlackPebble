import { Trophy } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function Leaderboard() {
  return (
    <ComingSoon
      icon={Trophy}
      title="Leaderboard & Competitions"
      description="Rankings, seasonal trading competitions, and head-to-head performance tracking are on the way. Keep building your track record on the Trading Desk in the meantime."
      features={[
        "Global trader rankings by ROI and realized P&L",
        "Time-boxed trading competitions with cohorts",
        "Win-rate, streak, and consistency analytics",
        "Public trader profiles and performance history",
      ]}
    />
  );
}
