import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } }
};

export default function Vault() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero */}
      <section className="min-h-[45vh] flex flex-col items-center justify-center py-32 px-6 border-b border-border">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-[1200px] w-full mx-auto"
        >
          <p className="text-xs uppercase tracking-widest text-accent mb-6">Fund Transparency</p>
          <h1 className="text-4xl md:text-6xl lg:text-[68px] font-serif leading-tight max-w-2xl mb-8">
            The Vault
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Real-time transparency into fund operations and holdings.
          </p>
        </motion.div>
      </section>

      {/* Dashboard Stats */}
      <section className="bg-card border-b border-border">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border"
        >
          {[
            { label: "Total Vault Holdings", value: "—" },
            { label: "Active Positions", value: "—" },
            { label: "Total Distributed to Shareholders", value: "—" },
            { label: "Operations Completed", value: "—" }
          ].map((stat, i) => (
            <motion.div
              key={i}
              variants={fadeIn}
              className="py-14 px-8 flex flex-col items-center text-center"
            >
              <span className="text-accent text-4xl font-serif mb-3">{stat.value}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider leading-snug max-w-[140px]">{stat.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Portfolio Holdings */}
      <section className="py-[100px] px-6 bg-background">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-12"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Current Positions</p>
            <h2 className="text-3xl md:text-4xl font-serif">Portfolio Holdings</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
          >
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm font-mono" data-testid="table-holdings">
                <thead>
                  <tr className="border-b border-border bg-card">
                    {["Asset", "Entry Market Cap", "Current Market Cap", "Status", "Date Acquired"].map((col) => (
                      <th key={col} className="px-6 py-4 text-left text-xs uppercase tracking-widest text-muted-foreground font-normal">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border hover:bg-card transition-colors">
                    <td className="px-6 py-5 text-muted-foreground">[REDACTED]</td>
                    <td className="px-6 py-5 text-muted-foreground">—</td>
                    <td className="px-6 py-5 text-muted-foreground">—</td>
                    <td className="px-6 py-5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-accent text-xs tracking-widest uppercase">Accumulating</span>
                      </span>
                    </td>
                    <td className="px-6 py-5 text-muted-foreground">—</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-6 py-5 border-t border-border bg-card">
                <p className="text-xs text-muted-foreground">More positions will be disclosed as operations complete.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Distribution History */}
      <section className="py-[100px] px-6 bg-card border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-12"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Distributions</p>
            <h2 className="text-3xl md:text-4xl font-serif">Distribution History</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
          >
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-distributions">
                <thead>
                  <tr className="border-b border-border bg-background">
                    {["Operation #", "Asset", "Amount Distributed", "Qualifying Holders", "Date"].map((col) => (
                      <th key={col} className="px-6 py-4 text-left text-xs uppercase tracking-widest text-muted-foreground font-normal">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">
                      No distributions yet. First operation pending.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-6">
              All distributions are verifiable on-chain via Solana Explorer.
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
