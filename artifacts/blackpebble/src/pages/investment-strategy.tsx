import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } }
};

export default function InvestmentStrategy() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero */}
      <section className="min-h-[55vh] flex flex-col items-center justify-center py-32 px-6 border-b border-border">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-[1200px] w-full mx-auto"
        >
          <p className="text-xs uppercase tracking-widest text-accent mb-6">Investment Strategy</p>
          <h1 className="text-4xl md:text-6xl lg:text-[68px] font-serif leading-tight max-w-3xl mb-8">
            Full-Spectrum Meme Asset Management
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            We deploy capital wherever conviction meets opportunity.
          </p>
        </motion.div>
      </section>

      {/* Investment Thesis */}
      <section className="py-[100px] px-6 bg-background">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-16">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="md:col-span-4"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Philosophy</p>
            <h2 className="text-3xl md:text-4xl font-serif leading-snug">Investment Thesis</h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="md:col-span-8"
          >
            <p className="text-muted-foreground text-lg leading-relaxed">
              The PumpFun ecosystem generates thousands of new assets daily. The overwhelming majority fail. But within that noise exists a consistent stream of mispriced opportunities — assets with strong narrative potential, undervalued community bases, or technical setups that favor asymmetric returns. Blackpebble exists to identify and capture these opportunities before the broader market recognizes them.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Strategy Universe — 4 cards */}
      <section className="py-[100px] px-6 bg-card border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-20"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Coverage</p>
            <h2 className="text-3xl md:text-5xl font-serif">Strategy Universe</h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {[
              {
                num: "I",
                title: "Distressed Asset Acquisition",
                desc: "Legacy tokens with dormant but recoverable communities. We acquire controlling positions and catalyze revival through coordinated shareholder action."
              },
              {
                num: "II",
                title: "Emerging Narrative Plays",
                desc: "Early identification of narrative cycles (AI, gaming, political, cultural) and positioning in assets likely to benefit from attention rotation."
              },
              {
                num: "III",
                title: "Community Takeover (CTO) Targets",
                desc: "Abandoned projects with strong ticker/branding but absent developers. Blackpebble acquires and redistributes to shareholders who execute the takeover."
              },
              {
                num: "IV",
                title: "High-Conviction Early Stage",
                desc: "New PumpFun launches with exceptional fundamentals: strong dev, unique narrative, organic community formation. We enter early and hold with conviction."
              }
            ].map((card, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                className="bg-background border border-border p-10 hover:border-accent transition-colors duration-500"
              >
                <p className="text-accent text-sm font-serif tracking-widest mb-6">{card.num}</p>
                <h3 className="text-xl font-serif mb-4">{card.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm md:text-base">{card.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Operational Framework — 6-step timeline */}
      <section className="py-[100px] px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-20"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Process</p>
            <h2 className="text-3xl md:text-5xl font-serif">Operational Framework</h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="relative"
          >
            {/* vertical line */}
            <div className="absolute left-[23px] md:left-[27px] top-0 bottom-0 w-px bg-border hidden md:block" />
            <div className="space-y-0 border border-border divide-y divide-border">
              {[
                { step: "01", title: "Identification", desc: "Lead Fund Manager identifies opportunity through proprietary screening." },
                { step: "02", title: "Due Diligence", desc: "Assessment of risk factors: liquidity, holder distribution, narrative durability, dev history." },
                { step: "03", title: "Accumulation", desc: "Quiet position building. No pre-announcement. No community vote. Zero front-running risk." },
                { step: "04", title: "Announcement", desc: "Position disclosed to shareholders via official channels once accumulation is complete." },
                { step: "05", title: "Distribution", desc: "Acquired tokens airdropped to qualifying $BLK holders based on weighted framework." },
                { step: "06", title: "Community Execution", desc: "Shareholders collectively drive awareness, volume, and value for distributed assets." }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  variants={fadeIn}
                  className="flex items-start gap-8 p-8 md:p-10 hover:bg-card transition-colors duration-300"
                >
                  <span className="text-accent font-serif text-lg flex-shrink-0 w-8">{item.step}</span>
                  <div>
                    <h3 className="text-lg font-serif mb-2">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Shareholder Qualification */}
      <section className="py-[100px] px-6 bg-card border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-6"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Eligibility</p>
            <h2 className="text-3xl md:text-5xl font-serif mb-4">Shareholder Qualification</h2>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Not all shareholders receive equal distributions. Allocation is weighted by the following factors:
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {[
              { title: "Position Size", desc: "Larger $BLK holdings receive proportionally larger distributions." },
              { title: "Loyalty Tenure", desc: "Duration of continuous holding. Longer holders receive multiplied allocations." },
              { title: "Participation Score", desc: "Active engagement in community raids, content creation, and ecosystem support." },
              { title: "Diamond Hands Bonus", desc: "Shareholders who have never sold receive enhanced weighting." }
            ].map((factor, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                className="bg-background border border-border p-8 hover:border-accent transition-colors duration-500"
              >
                <div className="w-1 h-8 bg-accent mb-6" />
                <h3 className="text-xl font-serif mb-3">{factor.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{factor.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Risk Factors */}
      <section className="py-[80px] px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Disclosures</p>
            <h2 className="text-2xl font-serif mb-8">Risk Factors</h2>
            <div className="border border-border bg-card p-8 md:p-12">
              <ul className="space-y-4">
                {[
                  "All investments carry risk. Past operations do not guarantee future results.",
                  "Meme assets are highly volatile and may lose 100% of their value.",
                  "Distribution timing and amounts are at the sole discretion of the Lead Fund Manager.",
                  "There is no guarantee that any acquired position will appreciate in value.",
                  "$BLK itself is a memecoin and carries all associated risks including but not limited to: liquidity risk, smart contract risk, regulatory risk, and market risk.",
                  "This is not financial advice. Do your own research."
                ].map((risk, i) => (
                  <li key={i} className="flex items-start gap-4 text-muted-foreground text-sm leading-relaxed">
                    <span className="text-accent flex-shrink-0 mt-0.5">—</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
