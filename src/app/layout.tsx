import type { Metadata } from "next";
import { Instrument_Sans, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ConfirmationProvider } from "@/components/ui/confirmation-provider";
import "./globals.css";

// Kel: self-hosted UI and body fonts, shared by the portable CSS tokens.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PL Staff Dashboard",
    template: "%s · PL Staff",
  },
  description: "Pitcher List internal content management and workflow hub.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ConfirmationProvider>{children}</ConfirmationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
