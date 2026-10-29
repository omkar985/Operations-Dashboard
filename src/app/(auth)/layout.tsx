import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-mesh min-h-screen flex flex-col justify-between text-[var(--ink)] relative selection:bg-[var(--primary)] selection:text-white overflow-hidden">
      {/* Top right theme toggle with glassmorphism */}
      <div className="absolute top-6 right-6 z-20">
        <div className="p-1 rounded-xl glass shadow-md border border-[var(--line)]">
          <ThemeSwitcher />
        </div>
      </div>

      {/* Main card viewport */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 z-10">
        <div className="w-full max-w-[440px]">
          {children}
        </div>
      </main>

      {/* Subdued Telemetry Footer */}
      <footer className="py-5 text-center text-xs text-[var(--muted)] border-t border-[var(--line-subtle)] bg-[var(--card)]/40 backdrop-blur-md z-10 flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block shadow-[0_0_8px_#10B981]" />
        <span className="tracking-wide">Operations Command Centre &bull; High-Precision Operations Engine</span>
      </footer>
    </div>
  );
}
