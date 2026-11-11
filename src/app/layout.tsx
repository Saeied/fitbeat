import type { Metadata } from "next";
import { Anton, Vazirmatn } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const anton = Anton({
  weight: "400",
  variable: "--font-anton",
  subsets: ["latin"],
  display: "swap",
});

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const matcha = localFont({
  src: "../../public/fonts/Matcha World.ttf",
  variable: "--font-score-hit",
  display: "swap",
});

const mikhakBold = localFont({
  src: "../../public/fonts/Mikhak-Bold.ttf",
  variable: "--font-mikhak-bold",
  display: "swap",
});

export const metadata: Metadata = {
  title: "اتاق رقص",
  description: "رقص هم‌زمان روی وب و موبایل",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${anton.variable} ${vazirmatn.variable} ${matcha.variable} ${mikhakBold.variable} h-full antialiased`}
    >
      <body className="h-full min-h-full font-sans">{children}</body>
    </html>
  );
}
