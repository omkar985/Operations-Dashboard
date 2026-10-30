import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { HeadphoneZoneLogo } from "@/components/ui/headphone-zone-logo";

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
        <HeadphoneZoneLogo className="w-3.5 h-3.5 text-[#1588C9] dark:text-[#38BDF8]" />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        <span className="tracking-wide">Operations Command Centre &bull; Headphone Zone</span>
      </footer>
    </div>
  );
}
