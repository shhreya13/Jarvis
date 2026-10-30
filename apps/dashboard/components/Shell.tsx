"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { checkHealth } from "@/lib/api";
import { gatewayHost } from "@/lib/pairing";
import { useWs } from "@/lib/ws";
import { usePairing } from "./PairingGate";

const HEALTH_POLL_MS = 15_000;

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/chat", label: "Chat" },
  { href: "/approvals", label: "Approvals" },
  { href: "/memory", label: "Memory" },
  { href: "/audit", label: "Audit" },
  { href: "/jobs", label: "Jobs" },
  { href: "/skills", label: "Skills" },
  { href: "/settings", label: "Settings" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { pairing, disconnect } = usePairing();
  const { pendingCount } = useWs();
  const pathname = usePathname();
  const [healthy, setHealthy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      checkHealth(pairing.gatewayUrl).then((ok) => {
        if (!cancelled) setHealthy(ok);
      });
    };
    poll();
    const timer = setInterval(poll, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pairing.gatewayUrl]);

  const navLinks = NAV_ITEMS.map((item) => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return { ...item, active };
  });

  return (
    <div className="min-h-screen">
      {/* Small screens: sticky top bar with horizontally scrollable nav. */}
      <header className="sticky top-0 z-10 border-b border-line bg-paper md:hidden">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <span className="font-mono text-[14px] font-medium tracking-[0.22em]">JARVIS</span>
          <span
            className={`led ${healthy ? "led-ok" : "led-err"}`}
            role="status"
            aria-label={healthy ? "Gateway online" : "Gateway unreachable"}
          />
        </div>
        <nav aria-label="Main navigation" className="overflow-x-auto">
          <ul className="flex gap-1 px-3 pb-2">
            {navLinks.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-[13px] whitespace-nowrap ${
                    item.active ? "bg-paper-2 font-medium text-ink" : "text-ink-60"
                  }`}
                >
                  {item.label}
                  {item.href === "/approvals" && pendingCount > 0 ? (
                    <span className="rounded-[2px] bg-signal px-1 font-mono text-[10px] font-medium leading-[16px] text-paper">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-[220px] flex-col border-r border-line bg-paper md:flex">
        <div className="flex items-center gap-2 px-5 pb-6 pt-7">
          <span className="font-mono text-[15px] font-medium tracking-[0.22em]">
            JARVIS
          </span>
          <span
            className={`led ${healthy ? "led-ok" : "led-err"}`}
            role="status"
            aria-label={healthy ? "Gateway online" : "Gateway unreachable"}
            title={healthy ? "Gateway online" : "Gateway unreachable"}
          />
        </div>

        <nav aria-label="Main navigation" className="flex-1 px-3">
          <ul className="space-y-0.5">
            {navLinks.map((item) => {
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-[2px] px-2.5 py-1.5 text-[13.5px] transition-colors ${
                      item.active
                        ? "bg-paper-2 font-medium text-ink"
                        : "text-ink-60 hover:bg-paper-2 hover:text-ink"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.href === "/approvals" && pendingCount > 0 ? (
                      <span className="rounded-[2px] bg-signal px-1.5 font-mono text-[11px] font-medium leading-[18px] text-paper">
                        {pendingCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <footer className="border-t border-line px-5 py-4">
          <p className="micro-label">Gateway</p>
          <p
            className="mt-0.5 truncate font-mono text-[12px]"
            title={pairing.gatewayUrl}
          >
            {gatewayHost(pairing)}
          </p>
          <button
            type="button"
            onClick={disconnect}
            className="btn btn-secondary mt-3 w-full justify-center text-[12px]"
          >
            Disconnect
          </button>
        </footer>
      </aside>

      <main className="md:ml-[220px]">
        <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
