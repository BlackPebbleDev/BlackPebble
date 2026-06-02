import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } }
};

const articles = [
  {
    date: "TBD",
    headline: "Blackpebble Announces Formation of Meme Asset Fund",
    excerpt: "Today we announce the formal establishment of Blackpebble as the premier institutional vehicle for meme asset management on Solana. The fund structure, operational framework, and shareholder qualification criteria have been finalized."
  },
  {
    date: "TBD",
    headline: "Investment Strategy & Shareholder Qualification Framework Published",
    excerpt: "We are pleased to share our comprehensive investment strategy and the framework by which shareholders will qualify for distributions. The full document outlines our approach to asset selection, risk management, and distribution mechanics."
  },
  {
    date: "TBD",
    headline: "Operation #001 — Accumulation Phase Initiated",
    excerpt: "[CLASSIFIED] — Details to follow upon completion of accumulation phase. Shareholders are advised to maintain qualifying positions."
  }
];

export default function Insights() {
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
          <p className="text-xs uppercase tracking-widest text-accent mb-6">Official Communications</p>
          <h1 className="text-4xl md:text-6xl lg:text-[68px] font-serif leading-tight max-w-3xl mb-8">
            Insights &amp; Announcements
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Official communications from Blackpebble leadership.
          </p>
        </motion.div>
      </section>

      {/* Articles */}
      <section className="py-[100px] px-6 bg-background">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="space-y-6"
          >
            {articles.map((article, i) => (
              <motion.article
                key={i}
                variants={fadeIn}
                className="border border-border bg-card hover:border-accent transition-colors duration-500 relative overflow-hidden"
                data-testid={`card-insight-${i}`}
              >
                {/* gold left border accent */}
                <div className="absolute top-0 left-0 w-1 h-full bg-accent" />
                <div className="p-8 md:p-12 pl-10 md:pl-14">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                    <div className="flex-1">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">{article.date}</p>
                      <h2 className="text-xl md:text-2xl font-serif mb-4 leading-snug">{article.headline}</h2>
                      <p className="text-muted-foreground leading-relaxed text-sm md:text-base max-w-2xl">{article.excerpt}</p>
                    </div>
                    <div className="flex-shrink-0 flex items-start md:items-center">
                      <button
                        className="text-xs uppercase tracking-widest text-accent hover:text-foreground transition-colors border border-accent hover:border-foreground px-5 py-3 whitespace-nowrap"
                        data-testid={`button-read-more-${i}`}
                      >
                        Read More
                      </button>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
