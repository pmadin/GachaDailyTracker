import type { Metadata } from 'next';
import { Geist, Plus_Jakarta_Sans, JetBrains_Mono, Noto_Sans_JP } from 'next/font/google';
import './globals.css';
import { AuthProvider } from './_context/AuthContext';
import { BadgeRevealProvider } from './_context/BadgeRevealContext';
import Navbar from './_components/Navbar';
import VerifyEmailBanner from './_components/VerifyEmailBanner';
import Footer from './_components/Footer';
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });
const notoSansJP = Noto_Sans_JP({ subsets: ['latin'], variable: '--font-noto-jp', display: 'optional' });

export const metadata: Metadata = {
  title: 'GachaDailyTracker',
  description: 'Track your daily resets across 330+ gacha games.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable} ${notoSansJP.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        <AuthProvider>
          <BadgeRevealProvider>
            <Navbar />
            <VerifyEmailBanner />
            <main className="flex-1">{children}</main>
            <Footer />
          </BadgeRevealProvider>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
