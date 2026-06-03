import { Wrench } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function Utilities() {
  return (
    <ComingSoon
      icon={Wrench}
      title="Trader Utilities"
      description="A suite of analytics and research tools to sharpen your edge is in development. These utilities will plug directly into your paper-trading workflow."
      features={[
        "Wallet and token research dashboards",
        "Position sizing and risk calculators",
        "Market scanners with custom filters",
        "Performance reports and exportable insights",
      ]}
    />
  );
}
