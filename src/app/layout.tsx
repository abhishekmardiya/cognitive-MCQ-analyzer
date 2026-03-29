import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function resolveMetadataBase(): URL {
  return new URL("https://cognitive-mcq-analyzer.vercel.app");
}

const description =
  "Upload or paste MCQ tests for Gemini-powered evaluation, detailed explanations, and a downloadable PDF report.";

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Cognitive MCQ Analyzer",
  description,
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Cognitive MCQ Analyzer",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cognitive MCQ Analyzer",
    description,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full antialiased`}
    >
      <body className="flex min-h-full min-w-0 w-full flex-col">
        {children}
      </body>
    </html>
  );
}
