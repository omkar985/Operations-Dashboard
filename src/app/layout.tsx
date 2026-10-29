import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Operations Dashboard | Command Centre",
    template: "%s | Operations Dashboard",
  },
  description: "High-precision full-stack operations management and workflow telemetry platform.",
  robots: { index: false, follow: false },
};

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('od-theme');
    var cookie = document.cookie.match(/(?:^|; )od-theme=([^;]*)/);
    var theme = stored || (cookie ? cookie[1] : null);
    if (!theme || theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
