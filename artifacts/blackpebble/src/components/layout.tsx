import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { SiX, SiTelegram } from "react-icons/si";
import { Pill, Menu, X, BarChart2 } from "lucide-react";
import logoFlat from "@assets/D911D882-6C4D-49D9-8A77-DA7A52962ABA_1780370693314.png";
import { Button } from "@/components/ui/button";
import { CABar } from "@/components/ca-bar";

interface LayoutProps {
  children: React.ReactNode;
}

const navLinks = [
  { href: "/about", label: "About Us" },
  { href: "/investment-strategy", label: "Investment Strategy" },
  { href: "/vault", label: "The Vault" },
  { href: "/insights", label: "Insights" },
  { href: "/community", label: "Community" },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <div className="min-h-[100dvh] flex flex-col w-full bg-background text-foreground selection:bg-accent/30 selection:text-accent dark">
      <CABar />
      {/* Navigation */}
      <header
        className={`fixed top-[36px] left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-background/90 backdrop-blur-md border-b border-border" : "bg-transparent"
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex-shrink-0" data-testid="link-logo">
            <img src={logoFlat} alt="Blackpebble" className="w-[150px] h-auto object-contain" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs tracking-widest uppercase transition-colors hover:text-accent ${
                  location === link.href ? "text-accent" : "text-muted-foreground"
                }`}
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex flex-shrink-0">
            <Link href="/community">
              <Button
                variant="outline"
                className="border-accent text-accent hover:bg-accent hover:text-accent-foreground rounded-none uppercase tracking-widest text-xs px-5 py-2 h-auto"
                data-testid="button-become-shareholder"
              >
                Become a Shareholder
              </Button>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors p-2"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            data-testid="button-mobile-menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden bg-background border-b border-border">
            <nav className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm tracking-widest uppercase transition-colors hover:text-accent ${
                    location === link.href ? "text-accent" : "text-muted-foreground"
                  }`}
                  data-testid={`link-mobile-nav-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/community">
                <Button
                  variant="outline"
                  className="border-accent text-accent hover:bg-accent hover:text-accent-foreground rounded-none uppercase tracking-widest text-xs w-full mt-2"
                >
                  Become a Shareholder
                </Button>
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content — 36px CA bar + 80px nav = 116px */}
      <main className="flex-1 flex flex-col mt-[116px]">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-card border-t-2 border-accent/40">
        <div className="max-w-[1200px] mx-auto px-6 py-16">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10 mb-12">
            <Link href="/" data-testid="link-footer-logo">
              <img
                src={logoFlat}
                alt="Blackpebble"
                className="w-[110px] h-auto opacity-70 hover:opacity-100 transition-opacity"
              />
            </Link>

            <div className="flex flex-wrap gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {[
                { Icon: SiX, label: "X" },
                { Icon: SiTelegram, label: "Telegram" },
                { Icon: Pill, label: "PumpFun" },
                { Icon: BarChart2, label: "DEX Screener" }
              ].map(({ Icon, label }, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label={label}
                  data-testid={`link-footer-social-${label.toLowerCase().replace(/\s/g, "-")}`}
                  className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition-colors duration-300"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-8 space-y-3">
            <p className="text-sm text-foreground">
              © 2025 Blackpebble. All rights reserved. Not financial advice.
            </p>
            <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
              Blackpebble is a satirical entity and is not affiliated with BlackRock, Inc. or any regulated financial institution. $BLK is a memecoin on the Solana blockchain. Nothing on this website constitutes financial advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
