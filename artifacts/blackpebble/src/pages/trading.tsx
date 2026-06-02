import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Search, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Trophy, Clock, RefreshCw } from "lucide-react";

const API = "/api/paper";

function formatPrice(p: number): string {
  if (!p || p === 0) return "$0";
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.0001) return `$${p.toFixed(8)}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
function formatPriceSol(p: number): string {
  if (!p || p === 0) return "0";
  if (p < 0.000001) return p.toExponential(2);
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  return p.toFixed(4);
}
function formatSol(n: number, d = 3): string {
  if (n === undefined || n === null) return "—";
  return `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(d)} SOL`;
}
function formatBig(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
function formatTokenAmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function pctColor(v: number | null): string {
  if (v === null) return "text-muted-foreground";
  return v >= 0 ? "text-green-500" : "text-red-500";
}
function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}
function tierLabel(tier: string): { label: string; bonus: string; color: string } {
  if (tier === "fund-manager") return { label: "Fund Manager", bonus: "+30%", color: "text-accent" };
  if (tier === "senior-analyst") return { label: "Senior Analyst", bonus: "+20%", color: "text-accent/80" };
  if (tier === "analyst") return { label: "Analyst", bonus: "+10%", color: "text-accent/60" };
  return { label: "No tier", bonus: "—", color: "text-muted-foreground" };
}

interface TokenResult { mint: string; name: string; symbol: string; price: number; priceChange24h: number; marketCap: number; volume24h: number; logo: string | null; }
interface TokenData { mint: string; name: string; symbol: string; logo: string | null; priceUsd: number | null; marketCap: number; volume24h: number; priceChange24h: number; }
interface PaperAccount { wallet: string; paper_balance: number; realized_pnl: number; total_pnl: number; total_trades: number; winning_trades: number; participation_points: number; graduation_tier: string; weekPnl: number; weekTrades: number; }
interface Position { id: number; tokenMint: string; tokenName: string; tokenSymbol: string; tokenLogo: string | null; totalTokens: number; totalSolSpent: number; avgEntryPrice: number; currentPriceSol: number | null; currentValue: number | null; pnlSol: number | null; pnlPct: number | null; openedAt: string; }
interface Trade { id: number; tokenMint: string; tokenName: string; tokenSymbol: string; side: string; solAmount: number; tokenAmount: number; pricePerToken: number; pnlSol: number; timestamp: string; }
interface LeaderboardEntry { rank: number; wallet: string; walletShort: string; totalPnl: number; roi: number; winRate: number; totalTrades: number; graduationTier: string; }
interface Competition { timeRemaining: string; topPerformers: Array<{ rank: number; walletShort: string; weekPnl: number; multiplier: number }>; }

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };

function SkeletonRow() {
  return <div className="h-4 bg-card rounded animate-pulse" />;
}

export default function TradingDesk() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const wallet = publicKey?.toBase58() || null;

  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<Trade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbPeriod, setLbPeriod] = useState<"all" | "month" | "week">("all");
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [mobileTab, setMobileTab] = useState<"positions" | "history" | "leaderboard">("positions");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TokenResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [posLoading, setPosLoading] = useState(false);
  const [lbLoading, setLbLoading] = useState(false);

  const priceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAccount = useCallback(async (w: string) => {
    const r = await fetch(`${API}/account/${w}`);
    if (r.ok) setAccount(await r.json());
  }, []);

  const fetchPositions = useCallback(async (w: string) => {
    setPosLoading(true);
    const r = await fetch(`${API}/positions/${w}`);
    if (r.ok) { const d = await r.json(); setPositions(d.positions || []); }
    setPosLoading(false);
  }, []);

  const fetchHistory = useCallback(async (w: string) => {
    const r = await fetch(`${API}/history/${w}`);
    if (r.ok) { const d = await r.json(); setHistory(d.trades || []); }
  }, []);

  const fetchLeaderboard = useCallback(async (period: string) => {
    setLbLoading(true);
    const r = await fetch(`${API}/leaderboard?period=${period}`);
    if (r.ok) { const d = await r.json(); setLeaderboard(d.leaderboard || []); }
    setLbLoading(false);
  }, []);

  const fetchCompetition = useCallback(async () => {
    const r = await fetch(`${API}/competition`);
    if (r.ok) setCompetition(await r.json());
  }, []);

  const fetchTokenData = useCallback(async (mint: string) => {
    setTokenLoading(true);
    const r = await fetch(`${API}/token/${mint}`);
    if (r.ok) setSelectedToken(await r.json());
    setTokenLoading(false);
  }, []);

  useEffect(() => {
    fetchLeaderboard(lbPeriod);
    fetchCompetition();
  }, []);

  useEffect(() => {
    if (!wallet) { setAccount(null); setPositions([]); setHistory([]); return; }
    fetchAccount(wallet);
    fetchPositions(wallet);
    fetchHistory(wallet);
    if (posIntervalRef.current) clearInterval(posIntervalRef.current);
    posIntervalRef.current = setInterval(() => {
      fetchPositions(wallet);
      fetchAccount(wallet);
    }, 30000);
    return () => { if (posIntervalRef.current) clearInterval(posIntervalRef.current); };
  }, [wallet]);

  useEffect(() => {
    fetchLeaderboard(lbPeriod);
    const iv = setInterval(() => fetchLeaderboard(lbPeriod), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [lbPeriod]);

  useEffect(() => {
    if (!selectedToken) { if (priceIntervalRef.current) clearInterval(priceIntervalRef.current); return; }
    if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
    priceIntervalRef.current = setInterval(() => fetchTokenData(selectedToken.mint), 10000);
    return () => { if (priceIntervalRef.current) clearInterval(priceIntervalRef.current); };
  }, [selectedToken?.mint]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); setSearchOpen(false); return; }
    setSearchOpen(true);
    setSearchLoading(true);
    searchTimeout.current = setTimeout(async () => {
      const r = await fetch(`${API}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      if (r.ok) { const d = await r.json(); setSearchResults(d.results || []); }
      setSearchLoading(false);
    }, 400);
  };

  const selectToken = (tok: TokenResult) => {
    setSearchOpen(false);
    setSearchQuery(`${tok.symbol} — ${tok.name}`);
    fetchTokenData(tok.mint);
    setTradeSide("buy");
    setTradeAmount("");
    setSelectedPosition(null);
    setTradeMsg(null);
  };

  const handleSellPosition = (pos: Position) => {
    setSelectedPosition(pos);
    setTradeSide("sell");
    setTradeMsg(null);
    if (pos.currentPriceSol !== null) {
      fetchTokenData(pos.tokenMint);
      setSearchQuery(`${pos.tokenSymbol} — ${pos.tokenName}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const executeTrade = async () => {
    if (!wallet) return;
    if (!selectedToken && tradeSide === "buy") { setTradeMsg({ text: "Select a token first.", ok: false }); return; }
    const amount = parseFloat(tradeAmount);
    if (isNaN(amount) || amount < 0.1) { setTradeMsg({ text: "Minimum trade is 0.1 SOL.", ok: false }); return; }

    setTradeLoading(true);
    setTradeMsg(null);
    try {
      const body: any = {
        wallet,
        tokenMint: tradeSide === "sell" ? selectedPosition?.tokenMint : selectedToken?.mint,
        side: tradeSide,
        solAmount: tradeSide === "buy" ? amount : undefined,
        positionId: tradeSide === "sell" ? selectedPosition?.id : undefined
      };
      if (tradeSide === "sell" && selectedPosition) {
        body.solAmount = selectedPosition.currentValue ?? selectedPosition.totalSolSpent;
      }
      const r = await fetch(`${API}/trade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setTradeMsg({ text: d.error || "Trade failed.", ok: false }); }
      else {
        setTradeMsg({ text: d.message, ok: true });
        setTradeAmount("");
        setSelectedPosition(null);
        await fetchAccount(wallet);
        await fetchPositions(wallet);
        await fetchHistory(wallet);
      }
    } catch {
      setTradeMsg({ text: "Trade failed — please try again.", ok: false });
    }
    setTradeLoading(false);
  };

  const portfolioValue = positions.reduce((s, p) => s + (p.currentValue ?? p.totalSolSpent), 0);
  const totalValue = (account?.paper_balance ?? 0) + portfolioValue;
  const unrealizedPnl = positions.reduce((s, p) => s + (p.pnlSol ?? 0), 0);
  const totalPnl = (account?.realized_pnl ?? 0) + unrealizedPnl;
  const startingSol = 100;
  const totalPnlPct = ((totalValue - startingSol) / startingSol) * 100;

  const estimatedTokens = (() => {
    if (!selectedToken?.priceUsd || !tradeAmount || tradeSide !== "buy") return null;
    const amt = parseFloat(tradeAmount);
    if (isNaN(amt) || amt <= 0) return null;
    return (amt / (selectedToken.priceUsd / 150)) * 0.99;
  })();

  if (!wallet) {
    return (
      <div className="flex flex-col w-full">
        <section className="min-h-[55vh] flex flex-col items-center justify-center py-32 px-6 border-b border-border">
          <motion.div initial="hidden" animate="visible" variants={fadeIn} className="max-w-[1200px] w-full mx-auto">
            <p className="text-xs uppercase tracking-widest text-accent mb-6">Shareholder Training Program</p>
            <h1 className="text-4xl md:text-6xl lg:text-[68px] font-serif leading-tight max-w-3xl mb-6">Trading Desk</h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed mb-4">
              Demonstrate conviction in a risk-free environment.
            </p>
            <p className="text-sm text-muted-foreground max-w-xl mb-10">
              Trade real tokens at real prices with simulated capital. Top performers earn enhanced distribution weight.
            </p>
            <button
              onClick={() => setVisible(true)}
              className="inline-flex items-center justify-center px-8 py-4 text-xs uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-black transition-colors duration-300"
            >
              Connect Wallet to Begin
            </button>
          </motion.div>
        </section>

        <section className="py-[100px] px-6 bg-card border-t border-border">
          <div className="max-w-[1200px] mx-auto">
            <div className="mb-12">
              <p className="text-xs uppercase tracking-widest text-accent mb-4">Global Leaderboard</p>
              <h2 className="text-3xl font-serif mb-2">Top Performers</h2>
            </div>
            <LeaderboardTable entries={leaderboard} loading={lbLoading} period={lbPeriod} setLbPeriod={setLbPeriod} competition={competition} connectedWallet={null} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <section className="py-16 px-6 border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeIn}>
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Shareholder Training Program</p>
            <h1 className="text-3xl md:text-5xl font-serif mb-2">Trading Desk</h1>
            <p className="text-sm text-muted-foreground">Demonstrate conviction in a risk-free environment.</p>
          </motion.div>
        </div>
      </section>

      <section className="py-6 px-6 bg-card border-b border-border">
        <div className="max-w-[1200px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Paper Balance", value: account ? `${account.paper_balance.toFixed(2)} SOL` : "—" },
            { label: "Portfolio Value", value: `${portfolioValue.toFixed(2)} SOL` },
            { label: "Total Value", value: `${totalValue.toFixed(2)} SOL` },
            { label: "Total P&L", value: account ? `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} SOL (${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}%)` : "—", color: pctColor(totalPnl) }
          ].map((s, i) => (
            <div key={i} className="bg-background border border-border p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-lg font-mono font-semibold ${s.color || "text-foreground"}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-8 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="relative mb-6">
            <div className="flex items-center border border-border bg-card px-4 py-3 gap-3 focus-within:border-accent transition-colors">
              <Search size={16} className="text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search by token name, ticker, or contract address..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              />
              {searchLoading && <RefreshCw size={14} className="text-muted-foreground animate-spin" />}
            </div>
            {searchOpen && (
              <div className="absolute top-full left-0 right-0 z-50 bg-card border border-border border-t-0 shadow-xl max-h-72 overflow-auto">
                {searchLoading && !searchResults.length ? (
                  <div className="p-4 text-sm text-muted-foreground">Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No results found.</div>
                ) : searchResults.map((tok) => (
                  <button
                    key={tok.mint}
                    onClick={() => selectToken(tok)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-background text-left transition-colors border-t border-border first:border-t-0"
                  >
                    {tok.logo ? <img src={tok.logo} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" /> : <div className="w-8 h-8 rounded-full bg-border flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{tok.symbol}</p>
                      <p className="text-xs text-muted-foreground truncate">{tok.name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-mono">{formatPrice(tok.price)}</p>
                      <p className={`text-xs font-mono ${pctColor(tok.priceChange24h)}`}>{tok.priceChange24h >= 0 ? "+" : ""}{tok.priceChange24h?.toFixed(2)}%</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-xs text-muted-foreground">MCap</p>
                      <p className="text-xs font-mono">${formatBig(tok.marketCap)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-widest text-accent mb-4">Token Info</p>
              {!selectedToken && !tokenLoading ? (
                <p className="text-sm text-muted-foreground">Search for a token above to view details.</p>
              ) : tokenLoading ? (
                <div className="space-y-3"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
              ) : selectedToken ? (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    {selectedToken.logo ? <img src={selectedToken.logo} className="w-10 h-10 rounded-full object-cover" alt="" /> : <div className="w-10 h-10 rounded-full bg-border" />}
                    <div>
                      <p className="text-lg font-semibold">{selectedToken.symbol}</p>
                      <p className="text-xs text-muted-foreground">{selectedToken.name}</p>
                    </div>
                    {selectedToken.priceChange24h !== undefined && (
                      <div className={`ml-auto flex items-center gap-1 text-sm font-mono ${pctColor(selectedToken.priceChange24h)}`}>
                        {selectedToken.priceChange24h >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {selectedToken.priceChange24h >= 0 ? "+" : ""}{selectedToken.priceChange24h?.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Price (USD)", value: formatPrice(selectedToken.priceUsd ?? 0) },
                      { label: "Market Cap", value: `$${formatBig(selectedToken.marketCap)}` },
                      { label: "24h Volume", value: `$${formatBig(selectedToken.volume24h)}` },
                      { label: "24h Change", value: `${(selectedToken.priceChange24h ?? 0) >= 0 ? "+" : ""}${(selectedToken.priceChange24h ?? 0).toFixed(2)}%`, color: pctColor(selectedToken.priceChange24h) }
                    ].map((s, i) => (
                      <div key={i} className="bg-background border border-border p-3">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
                        <p className={`text-sm font-mono font-semibold ${s.color || ""}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-widest text-accent mb-4">Execute Trade</p>
              <div className="flex mb-4">
                <button onClick={() => { setTradeSide("buy"); setSelectedPosition(null); setTradeMsg(null); }}
                  className={`flex-1 py-2 text-xs uppercase tracking-widest border transition-colors ${tradeSide === "buy" ? "border-accent bg-accent text-black" : "border-border text-muted-foreground hover:border-accent hover:text-accent"}`}>
                  Buy
                </button>
                <button onClick={() => { setTradeSide("sell"); setTradeMsg(null); }}
                  className={`flex-1 py-2 text-xs uppercase tracking-widest border border-l-0 transition-colors ${tradeSide === "sell" ? "border-red-500 bg-red-500 text-white" : "border-border text-muted-foreground hover:border-red-500 hover:text-red-500"}`}>
                  Sell
                </button>
              </div>

              {tradeSide === "sell" && !selectedPosition ? (
                <div className="space-y-2 mb-4 max-h-44 overflow-auto">
                  {positions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No open positions to sell.</p>
                  ) : positions.map((pos) => (
                    <button key={pos.id} onClick={() => setSelectedPosition(pos)}
                      className="w-full flex items-center gap-3 p-3 border border-border hover:border-accent transition-colors text-left">
                      {pos.tokenLogo ? <img src={pos.tokenLogo} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" /> : <div className="w-7 h-7 rounded-full bg-border flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{pos.tokenSymbol}</p>
                        <p className="text-xs text-muted-foreground">{formatTokenAmt(pos.totalTokens)} tokens</p>
                      </div>
                      <div className={`text-right text-xs font-mono ${pctColor(pos.pnlPct)}`}>
                        {pos.pnlSol !== null ? `${pos.pnlSol >= 0 ? "+" : ""}${pos.pnlSol.toFixed(2)} SOL` : "—"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : tradeSide === "sell" && selectedPosition ? (
                <div className="mb-4 p-3 bg-background border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold">{selectedPosition.tokenSymbol}</p>
                    <button onClick={() => setSelectedPosition(null)} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatTokenAmt(selectedPosition.totalTokens)} tokens · Avg {formatPriceSol(selectedPosition.avgEntryPrice)} SOL</p>
                  {selectedPosition.currentValue !== null && (
                    <p className={`text-xs font-mono mt-1 ${pctColor(selectedPosition.pnlPct)}`}>
                      Value: {selectedPosition.currentValue.toFixed(3)} SOL ({selectedPosition.pnlSol !== null && (selectedPosition.pnlSol >= 0 ? "+" : "")}{selectedPosition.pnlSol?.toFixed(3)} SOL)
                    </p>
                  )}
                </div>
              ) : null}

              {tradeSide === "buy" && (
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-2">Amount (SOL)</label>
                  <input
                    type="number" min="0.1" step="0.1"
                    className="w-full bg-background border border-border px-3 py-3 text-sm font-mono outline-none focus:border-accent transition-colors"
                    placeholder="0.0"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                  />
                  {estimatedTokens !== null && selectedToken && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      ≈ {formatTokenAmt(estimatedTokens)} {selectedToken.symbol} (after 1% slippage)
                    </p>
                  )}
                  {account && (
                    <div className="flex gap-2 mt-2">
                      {[25, 50, 75, 100].map((pct) => (
                        <button key={pct} onClick={() => setTradeAmount(((account.paper_balance * pct) / 100).toFixed(2))}
                          className="text-xs px-2 py-1 border border-border hover:border-accent hover:text-accent transition-colors">
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tradeSide === "sell" && selectedPosition && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground">
                    Selling full position: {formatTokenAmt(selectedPosition.totalTokens)} {selectedPosition.tokenSymbol}
                  </p>
                  <p className="text-xs text-muted-foreground">Estimated receive: {selectedPosition.currentValue?.toFixed(3) ?? "—"} SOL (after 1% slippage)</p>
                </div>
              )}

              {tradeMsg && (
                <div className={`mb-3 p-3 text-xs border ${tradeMsg.ok ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-red-500/40 bg-red-500/10 text-red-400"}`}>
                  {tradeMsg.text}
                </div>
              )}

              <button
                onClick={executeTrade}
                disabled={tradeLoading || (tradeSide === "buy" && !selectedToken) || (tradeSide === "sell" && !selectedPosition)}
                className={`w-full py-3 text-xs uppercase tracking-widest border transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2
                  ${tradeSide === "buy" ? "border-accent text-accent hover:bg-accent hover:text-black" : "border-red-500 text-red-500 hover:bg-red-500 hover:text-white"}`}>
                {tradeLoading ? <><RefreshCw size={14} className="animate-spin" /> Processing...</> : tradeSide === "buy" ? "Execute Buy" : "Execute Sell"}
              </button>
            </div>
          </div>

          <div className="hidden md:block">
            <PositionsSection positions={positions} loading={posLoading} onSell={handleSellPosition} />
            <HistorySection trades={history} />
            <div className="mt-8">
              <LeaderboardTable entries={leaderboard} loading={lbLoading} period={lbPeriod} setLbPeriod={setLbPeriod} competition={competition} connectedWallet={wallet} />
            </div>
          </div>

          <div className="md:hidden mt-4">
            <div className="flex border border-border">
              {(["positions", "history", "leaderboard"] as const).map((tab) => (
                <button key={tab} onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-3 text-xs uppercase tracking-widest transition-colors ${mobileTab === tab ? "bg-accent text-black" : "text-muted-foreground hover:text-foreground"}`}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {mobileTab === "positions" && <PositionsSection positions={positions} loading={posLoading} onSell={handleSellPosition} />}
              {mobileTab === "history" && <HistorySection trades={history} />}
              {mobileTab === "leaderboard" && <LeaderboardTable entries={leaderboard} loading={lbLoading} period={lbPeriod} setLbPeriod={setLbPeriod} competition={competition} connectedWallet={wallet} />}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PositionsSection({ positions, loading, onSell }: { positions: Position[]; loading: boolean; onSell: (p: Position) => void }) {
  return (
    <div className="border border-border mb-6">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-accent">Open Positions</p>
        <p className="text-xs text-muted-foreground">{positions.length} / 20</p>
      </div>
      {loading ? (
        <div className="p-4 space-y-2"><SkeletonRow /><SkeletonRow /></div>
      ) : positions.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No open positions. Search for a token above to make your first trade.</p>
      ) : (
        <>
          <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_80px] text-xs uppercase tracking-widest text-muted-foreground px-4 py-2 border-b border-border">
            <span>Token</span><span>Entry Price</span><span>Current Price</span><span>Quantity</span><span>Value (SOL)</span><span>P&L</span><span />
          </div>
          {positions.map((pos) => (
            <div key={pos.id} className="border-t border-border first:border-t-0">
              <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_80px] px-4 py-3 items-center text-sm hover:bg-card/50 transition-colors">
                <div className="flex items-center gap-2">
                  {pos.tokenLogo ? <img src={pos.tokenLogo} className="w-6 h-6 rounded-full object-cover" alt="" /> : <div className="w-6 h-6 rounded-full bg-border" />}
                  <span className="font-semibold">{pos.tokenSymbol}</span>
                </div>
                <span className="font-mono text-xs">{formatPriceSol(pos.avgEntryPrice)}</span>
                <span className="font-mono text-xs">{pos.currentPriceSol !== null ? formatPriceSol(pos.currentPriceSol) : "—"}</span>
                <span className="font-mono text-xs">{formatTokenAmt(pos.totalTokens)}</span>
                <span className="font-mono text-xs">{pos.currentValue !== null ? pos.currentValue.toFixed(3) : "—"}</span>
                <div className={`font-mono text-xs ${pctColor(pos.pnlPct)}`}>
                  <div>{pos.pnlSol !== null ? `${pos.pnlSol >= 0 ? "+" : ""}${pos.pnlSol.toFixed(3)}` : "—"}</div>
                  <div>{pos.pnlPct !== null ? `${pos.pnlPct >= 0 ? "+" : ""}${pos.pnlPct.toFixed(1)}%` : ""}</div>
                </div>
                <button onClick={() => onSell(pos)} className="text-xs border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors px-2 py-1">Sell</button>
              </div>
              <div className="md:hidden p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {pos.tokenLogo ? <img src={pos.tokenLogo} className="w-6 h-6 rounded-full" alt="" /> : <div className="w-6 h-6 rounded-full bg-border" />}
                    <span className="font-semibold">{pos.tokenSymbol}</span>
                  </div>
                  <div className={`font-mono text-sm font-semibold ${pctColor(pos.pnlPct)}`}>{pos.pnlSol !== null ? `${pos.pnlSol >= 0 ? "+" : ""}${pos.pnlSol.toFixed(3)} SOL` : "—"}</div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>{formatTokenAmt(pos.totalTokens)} tokens</span>
                  <span>{pos.currentValue !== null ? `${pos.currentValue.toFixed(3)} SOL` : "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-mono ${pctColor(pos.pnlPct)}`}>{pos.pnlPct !== null ? `${pos.pnlPct >= 0 ? "+" : ""}${pos.pnlPct.toFixed(1)}%` : ""}</span>
                  <button onClick={() => onSell(pos)} className="text-xs border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors px-3 py-1 min-h-[32px]">Sell</button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function HistorySection({ trades }: { trades: Trade[] }) {
  return (
    <div className="border border-border mb-6">
      <div className="p-4 border-b border-border">
        <p className="text-xs uppercase tracking-widest text-accent">Trade History</p>
      </div>
      {trades.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No trades yet. Your trading history will appear here.</p>
      ) : (
        <>
          <div className="hidden md:grid grid-cols-[1fr_1fr_80px_1fr_1fr_1fr] text-xs uppercase tracking-widest text-muted-foreground px-4 py-2 border-b border-border">
            <span>Token</span><span>Side</span><span>Amount</span><span>Price</span><span>P&L</span><span>Date</span>
          </div>
          {trades.slice(0, 50).map((t) => (
            <div key={t.id} className="border-t border-border first:border-t-0">
              <div className="hidden md:grid grid-cols-[1fr_1fr_80px_1fr_1fr_1fr] px-4 py-3 items-center text-sm">
                <span className="font-semibold">{t.tokenSymbol}</span>
                <span className={`text-xs uppercase tracking-widest ${t.side === "buy" ? "text-accent" : "text-red-400"}`}>{t.side}</span>
                <span className="font-mono text-xs">{t.solAmount.toFixed(2)}</span>
                <span className="font-mono text-xs">{formatPriceSol(t.pricePerToken)}</span>
                <span className={`font-mono text-xs ${t.side === "sell" ? pctColor(t.pnlSol) : "text-muted-foreground"}`}>
                  {t.side === "sell" ? `${t.pnlSol >= 0 ? "+" : ""}${t.pnlSol.toFixed(3)} SOL` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo(t.timestamp)}</span>
              </div>
              <div className="md:hidden px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{t.tokenSymbol}</span>
                    <span className={`text-xs uppercase ${t.side === "buy" ? "text-accent" : "text-red-400"}`}>{t.side}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{t.solAmount.toFixed(2)} SOL · {timeAgo(t.timestamp)}</p>
                </div>
                {t.side === "sell" && <span className={`font-mono text-sm font-semibold ${pctColor(t.pnlSol)}`}>{t.pnlSol >= 0 ? "+" : ""}{t.pnlSol.toFixed(3)}</span>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function LeaderboardTable({ entries, loading, period, setLbPeriod, competition, connectedWallet }: {
  entries: LeaderboardEntry[]; loading: boolean; period: string; setLbPeriod: (p: "all" | "month" | "week") => void; competition: Competition | null; connectedWallet: string | null;
}) {
  const userRank = connectedWallet ? entries.findIndex((e) => e.wallet === connectedWallet) + 1 : 0;
  const borderAccent = (rank: number) =>
    rank === 1 ? "border-l-4 border-l-[#c9a96e]" : rank === 2 ? "border-l-4 border-l-gray-400" : rank === 3 ? "border-l-4 border-l-amber-700" : "";

  return (
    <div className="border border-border">
      <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent mb-1">Leaderboard</p>
          {competition && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={11} /> Weekly competition — Ends in: <span className="text-accent">{competition.timeRemaining}</span></p>}
          {userRank > 0 && <p className="text-xs text-accent mt-1">Your rank: #{userRank}</p>}
        </div>
        <div className="flex gap-1">
          {(["all", "month", "week"] as const).map((p) => (
            <button key={p} onClick={() => setLbPeriod(p)}
              className={`px-3 py-1.5 text-xs uppercase tracking-widest border transition-colors ${period === p ? "border-accent bg-accent text-black" : "border-border text-muted-foreground hover:border-accent hover:text-accent"}`}>
              {p === "all" ? "All Time" : p === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="p-4 space-y-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
      ) : entries.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">{period === "all" ? "Minimum 5 closed trades required to appear on the all-time leaderboard." : "No data for this period yet."}</p>
      ) : (
        <>
          <div className="hidden md:grid grid-cols-[60px_1.5fr_1fr_1fr_80px_1fr] text-xs uppercase tracking-widest text-muted-foreground px-4 py-2 border-b border-border">
            <span>Rank</span><span>Wallet</span><span>Total P&L</span><span>ROI %</span><span>Win Rate</span><span>Trades</span>
          </div>
          {entries.map((e) => {
            const isUser = e.wallet === connectedWallet;
            const tier = tierLabel(e.graduationTier);
            return (
              <div key={e.wallet} className={`border-t border-border first:border-t-0 ${borderAccent(e.rank)} ${isUser ? "bg-accent/5" : "hover:bg-card/50"} transition-colors`}>
                <div className="hidden md:grid grid-cols-[60px_1.5fr_1fr_1fr_80px_1fr] px-4 py-3 items-center text-sm">
                  <span className={`font-mono font-bold ${e.rank <= 10 ? "text-accent" : "text-muted-foreground"}`}>#{e.rank}</span>
                  <div>
                    <p className="font-mono text-xs">{e.walletShort}{isUser && <span className="ml-1 text-accent text-xs">(you)</span>}</p>
                    {e.graduationTier !== "none" && <p className={`text-xs ${tier.color}`}>{tier.label} {tier.bonus}</p>}
                  </div>
                  <span className={`font-mono text-xs font-semibold ${pctColor(e.totalPnl)}`}>{e.totalPnl >= 0 ? "+" : ""}{e.totalPnl.toFixed(2)} SOL</span>
                  <span className={`font-mono text-xs ${pctColor(e.roi)}`}>{e.roi >= 0 ? "+" : ""}{e.roi.toFixed(1)}%</span>
                  <span className="font-mono text-xs">{e.winRate}%</span>
                  <span className="font-mono text-xs">{e.totalTrades}</span>
                </div>
                <div className="md:hidden px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold font-mono ${e.rank <= 10 ? "text-accent" : "text-muted-foreground"}`}>#{e.rank}</span>
                    <div>
                      <p className="text-xs font-mono">{e.walletShort}{isUser && <span className="text-accent"> (you)</span>}</p>
                      <p className="text-xs text-muted-foreground">{e.totalTrades} trades · {e.winRate}% win</p>
                    </div>
                  </div>
                  <span className={`font-mono text-sm font-semibold ${pctColor(e.totalPnl)}`}>{e.totalPnl >= 0 ? "+" : ""}{e.totalPnl.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
