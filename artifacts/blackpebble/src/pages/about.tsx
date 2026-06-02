import { motion } from "framer-motion";
import logo3d from "@assets/351C0D45-7DB1-4C90-903A-5039321EE1ED_1780370693314.png";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } }
};

export default function About() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero */}
      <section className="min-h-[55vh] flex flex-col items-center justify-center py-32 px-6 border-b border-border relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10 pointer-events-none"
          style={{ backgroundImage: `url(${logo3d})`, backgroundSize: "60%", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
        />
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-[1200px] w-full mx-auto z-10"
        >
          <p className="text-xs uppercase tracking-widest text-accent mb-6">About Us</p>
          <h1 className="text-4xl md:text-6xl lg:text-[68px] font-serif leading-tight max-w-3xl mb-8">
            We started with one belief.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            That meme markets are inefficient, and opportunity exists for those who move with conviction and patience.
          </p>
        </motion.div>
      </section>

      {/* Our Story */}
      <section className="py-[100px] px-6 bg-background">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-16">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="md:col-span-4"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Our Story</p>
            <h2 className="text-3xl md:text-4xl font-serif leading-snug">Founded on a simple observation.</h2>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="md:col-span-8 space-y-8"
          >
            <p className="text-muted-foreground text-lg leading-relaxed">
              Blackpebble was founded on a simple observation: the Solana meme economy generates extraordinary value, yet the vast majority of participants lack the tools, timing, or conviction to capture it. Information moves faster than capital. Narratives form and dissolve within hours. The average participant is perpetually late.
            </p>
            <p className="text-muted-foreground text-lg leading-relaxed">
              We built Blackpebble to solve this problem. By pooling conviction under a single fund structure, we enable our shareholders to benefit from institutional-grade positioning without the need for constant market surveillance. The Lead Fund Manager identifies opportunities, accumulates positions quietly, and distributes acquired assets directly to qualifying holders.
            </p>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Our mandate is broad by design. We do not limit ourselves to a single strategy or asset class within the Solana ecosystem. Distressed assets, emerging narratives, community takeovers, early-stage launches — if the conviction is there, we deploy.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Our Approach — 3-step timeline */}
      <section className="py-[100px] px-6 bg-card border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-20"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Methodology</p>
            <h2 className="text-3xl md:text-5xl font-serif">Our Approach</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border"
          >
            {[
              {
                num: "01",
                title: "Identify",
                desc: "Continuous monitoring of PumpFun launches, social sentiment, on-chain data, and narrative cycles to identify asymmetric opportunities."
              },
              {
                num: "02",
                title: "Accumulate",
                desc: "Quiet position building before public announcement. No community voting. No front-running. The Lead Fund Manager acts with full discretion."
              },
              {
                num: "03",
                title: "Distribute",
                desc: "Acquired tokens are airdropped to qualifying $BLK holders based on a weighted qualification framework."
              }
            ].map((step, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                className="p-10 md:p-14 border-b md:border-b-0 md:border-r last:border-r-0 border-border hover:bg-background transition-colors duration-500"
              >
                <p className="text-accent text-5xl font-serif mb-8">{step.num}</p>
                <h3 className="text-2xl font-serif mb-4">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Leadership */}
      <section className="py-[100px] px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-20"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Personnel</p>
            <h2 className="text-3xl md:text-5xl font-serif">Leadership</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="max-w-[480px]"
          >
            <div className="border border-border bg-card p-10 hover:border-accent transition-colors duration-500">
              {/* Silhouette placeholder */}
              <div className="w-full h-48 bg-background border border-border mb-8 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-muted opacity-30" />
              </div>
              <p className="text-xs uppercase tracking-widest text-accent mb-2">Fund Director</p>
              <h3 className="text-2xl font-serif mb-4">Lead Fund Manager</h3>
              <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                Sole decision-maker for all fund operations. Responsible for opportunity identification, capital deployment, risk management, and shareholder communications. Identity undisclosed.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-border bg-card">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          {[
            { label: "Shareholders", value: "—" },
            { label: "Operations Completed", value: "—" },
            { label: "Total Distributed", value: "—" }
          ].map((stat, i) => (
            <div key={i} className="py-14 px-8 flex flex-col items-center text-center">
              <span className="text-accent text-4xl font-serif mb-3">{stat.value}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
