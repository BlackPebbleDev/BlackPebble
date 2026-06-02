import { useState } from "react";
import { Check, Copy } from "lucide-react";

const CONTRACT_ADDRESS = process.env.VITE_BLK_CONTRACT_ADDRESS || "";
const IS_PRE_LAUNCH = !CONTRACT_ADDRESS || CONTRACT_ADDRESS === "TBA";

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

export function CABar() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (IS_PRE_LAUNCH || !CONTRACT_ADDRESS) return;
    navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 px-4"
      style={{
        height: "36px",
        background: "#0d0d0d",
        borderBottom: "1px solid #1a1a1a"
      }}
      data-testid="ca-bar"
    >
      <span
        className="font-bold flex-shrink-0"
        style={{ color: "#c9a96e", fontSize: "13px" }}
      >
        $BLK
      </span>

      <span
        className="font-mono hidden sm:block"
        style={{
          fontSize: "12px",
          color: "#ffffff",
          letterSpacing: "0.5px",
          userSelect: "all"
        }}
        data-testid="text-contract-address"
      >
        {IS_PRE_LAUNCH
          ? "TBA — Contract address will be published at launch"
          : CONTRACT_ADDRESS}
      </span>

      {/* Mobile truncated */}
      <span
        className="font-mono sm:hidden"
        style={{
          fontSize: "12px",
          color: "#ffffff",
          letterSpacing: "0.5px",
          userSelect: "all"
        }}
      >
        {IS_PRE_LAUNCH
          ? "TBA — Coming at launch"
          : truncateAddress(CONTRACT_ADDRESS)}
      </span>

      {!IS_PRE_LAUNCH && (
        <button
          onClick={handleCopy}
          data-testid="button-copy-ca"
          className="flex items-center gap-1.5 flex-shrink-0 transition-all duration-200"
          style={{
            background: "transparent",
            border: `1px solid ${copied ? "#c9a96e" : "#2a2a2a"}`,
            borderRadius: "4px",
            padding: "4px 8px",
            cursor: "pointer",
            color: copied ? "#c9a96e" : "#888",
            fontSize: "11px"
          }}
          onMouseEnter={(e) => {
            if (!copied) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#c9a96e";
              (e.currentTarget as HTMLButtonElement).style.color = "#c9a96e";
            }
          }}
          onMouseLeave={(e) => {
            if (!copied) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a2a";
              (e.currentTarget as HTMLButtonElement).style.color = "#888";
            }
          }}
        >
          {copied ? (
            <>
              <Check size={11} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
