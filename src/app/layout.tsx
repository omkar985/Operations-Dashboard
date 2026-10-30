import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Operations Dashboard Headphone Zone",
    template: "%s | Operations Dashboard Headphone Zone",
  },
  description: "Operations Dashboard — High-precision operational telemetry and workflow platform for Headphone Zone.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/apple-icon",
  },
};

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('od-theme');
    var cookie = document.cookie.match(/(?:^|; )od-theme=([^;]*)/);
    var theme = stored || (cookie ? cookie[1] : null);
    if (!theme || theme === 'system') {
      theme = 'dark';
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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
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
