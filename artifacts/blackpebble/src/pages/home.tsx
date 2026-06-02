import { motion } from "framer-motion";
import { Link } from "wouter";
import logo3d from "@assets/351C0D45-7DB1-4C90-903A-5039321EE1ED_1780370693314.png";
import { Button } from "@/components/ui/button";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

export default function Home() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center relative overflow-hidden py-20 px-6">
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-[1200px] w-full mx-auto flex flex-col items-center text-center z-10"
        >
          <img 
            src={logo3d} 
            alt="Blackpebble Logo" 
            className="w-full max-w-[400px] md:max-w-[500px] mb-12 drop-shadow-2xl" 
          />
          <h1 className="text-4xl md:text-6xl lg:text-[72px] font-serif leading-tight mb-8 max-w-4xl">
            Helping more and more people experience financial well-being in the meme economy.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12 font-sans font-light">
            Blackpebble is a global meme asset manager dedicated to identifying asymmetric opportunities across the Solana ecosystem.
          </p>
          <Link href="/investment-strategy">
            <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-none px-8 py-6 text-sm uppercase tracking-widest font-semibold">
              Learn Our Strategy
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-border bg-card">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {[
            { label: "Assets Under Management", value: "—" },
            { label: "Shareholders", value: "—" },
            { label: "Operations Completed", value: "—" },
            { label: "Markets Covered", value: "Solana" }
          ].map((stat, i) => (
            <div key={i} className="py-12 px-6 flex flex-col items-center text-center">
              <span className="text-accent text-3xl font-serif mb-2">{stat.value}</span>
              <span className="text-sm text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* What We Do */}
      <section className="py-[120px] px-6 bg-background">
        <div className="max-w-[1200px] mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
          >
            <h2 className="text-3xl md:text-5xl mb-20 text-center">Institutional-Grade Conviction in an Inefficient Market</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: "Strategic Acquisition",
                  desc: "We identify and accumulate positions in high-conviction opportunities before public announcement, ensuring optimal entry for the fund."
                },
                {
                  title: "Shareholder Distribution",
                  desc: "Acquired assets are distributed directly to qualifying $BLK holders based on position size, loyalty tenure, and participation metrics."
                },
                {
                  title: "Portfolio Management",
                  desc: "Active monitoring and management of fund positions across the Solana ecosystem, with transparent reporting to all shareholders."
                }
              ].map((card, i) => (
                <div key={i} className="bg-card border border-border p-10 hover:border-accent transition-colors duration-500">
                  <h3 className="text-xl font-serif mb-4 text-foreground">{card.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm md:text-base">{card.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Latest Operation */}
      <section className="py-[120px] px-6 bg-card border-t border-border">
        <div className="max-w-[800px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
          >
            <h2 className="text-sm uppercase tracking-widest text-accent mb-8 text-center">Latest Operation</h2>
            <div className="border border-border bg-background p-10 md:p-16 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-accent"></div>
              <h3 className="text-2xl md:text-4xl font-serif mb-6">OPERATION #001 — [CLASSIFIED]</h3>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
                <span className="text-sm tracking-widest uppercase text-muted-foreground">Status: Pending</span>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed font-serif italic">
                "Details will be disclosed following accumulation phase completion."
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Our Thesis */}
      <section className="py-[120px] px-6 bg-background border-t border-border">
        <div className="max-w-[1000px] mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeIn}
          >
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-8">Our Thesis</h2>
            <p className="text-xl md:text-3xl font-serif leading-relaxed text-foreground">
              Traditional meme markets are defined by information asymmetry, fragmented liquidity, and irrational pricing. Blackpebble exists to exploit these inefficiencies on behalf of our shareholders. We deploy capital across the full spectrum of PumpFun opportunities — distressed legacy assets, emerging narratives, undervalued community takeovers, and early-stage high-conviction plays — distributing gains directly to those who hold with us.
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
