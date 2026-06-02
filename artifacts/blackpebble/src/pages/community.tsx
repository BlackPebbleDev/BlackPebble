import { motion } from "framer-motion";
import { SiX, SiTelegram } from "react-icons/si";
import { Pill, Lock, BarChart2 } from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } }
};

const socialChannels = [
  { Icon: SiX, label: "X (Twitter)", href: "#" },
  { Icon: SiTelegram, label: "Telegram", href: "#" },
  { Icon: Pill, label: "PumpFun", href: "#" },
  { Icon: BarChart2, label: "DEX Screener", href: "#" }
];

export default function Community() {
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
          <p className="text-xs uppercase tracking-widest text-accent mb-6">Shareholder Acquisition</p>
          <h1 className="text-4xl md:text-6xl lg:text-[68px] font-serif leading-tight max-w-3xl mb-8">
            Become a Shareholder
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Join the most sophisticated community in the meme economy.
          </p>
        </motion.div>
      </section>

      {/* How to Participate */}
      <section className="py-[100px] px-6 bg-background">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-16"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Process</p>
            <h2 className="text-3xl md:text-5xl font-serif">Acquire $BLK</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="border border-border divide-y divide-border mb-16"
          >
            {[
              "Purchase $BLK on PumpFun or Jupiter Exchange",
              "Hold in your Solana wallet to qualify for distributions",
              "Engage with the community to increase your Participation Score",
              "Receive airdropped assets from fund operations directly to your wallet"
            ].map((step, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                className="flex items-center gap-8 p-8 md:p-10 hover:bg-card transition-colors duration-300"
              >
                <span className="text-accent font-serif text-2xl flex-shrink-0 w-8">0{i + 1}</span>
                <p className="text-foreground text-lg leading-relaxed">{step}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="flex flex-col sm:flex-row gap-4"
          >
            <a
              href="#"
              data-testid="button-buy-pumpfun"
              className="inline-flex items-center justify-center px-8 py-4 text-xs uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-accent-foreground transition-colors duration-300"
            >
              Buy on PumpFun
            </a>
            <a
              href="#"
              data-testid="button-buy-jupiter"
              className="inline-flex items-center justify-center px-8 py-4 text-xs uppercase tracking-widest border border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors duration-300"
            >
              Buy on Jupiter
            </a>
          </motion.div>
        </div>
      </section>

      {/* Shareholder Benefits */}
      <section className="py-[100px] px-6 bg-card border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-16"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Advantages</p>
            <h2 className="text-3xl md:text-5xl font-serif">Shareholder Benefits</h2>
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
                title: "Token Distributions",
                desc: "Receive airdropped tokens from every fund operation proportional to your qualification score."
              },
              {
                title: "Priority Intelligence",
                desc: "Shareholders receive operation announcements before public disclosure."
              },
              {
                title: "Community Governance",
                desc: "Participate in non-binding sentiment polls on fund direction (note: final decisions remain with Lead Fund Manager)."
              },
              {
                title: "Exclusive Access",
                desc: "Future NFT drops, tools, and alpha channels reserved for qualifying holders."
              }
            ].map((benefit, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                className="bg-background border border-border p-10 hover:border-accent transition-colors duration-500"
                data-testid={`card-benefit-${i}`}
              >
                <div className="w-1 h-8 bg-accent mb-6" />
                <h3 className="text-xl font-serif mb-3">{benefit.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{benefit.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Official Channels */}
      <section className="py-[100px] px-6 bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-16"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Connect</p>
            <h2 className="text-3xl md:text-5xl font-serif">Official Channels</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="flex flex-wrap gap-6"
          >
            {socialChannels.map(({ Icon, label, href }, i) => (
              <motion.a
                key={i}
                href={href}
                variants={fadeIn}
                aria-label={label}
                data-testid={`link-social-${label.toLowerCase().replace(/\s/g, "-")}`}
                className="w-16 h-16 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition-colors duration-300"
              >
                <Icon size={22} />
              </motion.a>
            ))}
          </motion.div>
        </div>
      </section>

      {/* PFP Generator teaser */}
      <section className="py-[80px] px-6 bg-card border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="border border-border bg-background p-10 md:p-14 opacity-60 pointer-events-none select-none"
          >
            <div className="flex items-start gap-6">
              <Lock size={20} className="text-muted-foreground flex-shrink-0 mt-1" />
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Coming Soon</p>
                <h3 className="text-2xl font-serif mb-3">Institutional Profile Generator</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Generate your official Blackpebble shareholder profile image.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
