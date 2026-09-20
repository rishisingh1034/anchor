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

export const metadata: Metadata = {
  title: "Anchor — Serverless AWS Deployment Engine",
  description:
    "Deploy any GitHub repository directly to Amazon S3 & CloudFront Edge CDN with Amazon Bedrock framework detection and zero cloud configuration.",
  keywords: [
    "AWS",
    "Serverless",
    "Deployment Engine",
    "Amazon Bedrock",
    "CloudFront",
    "Amazon S3",
    "Next.js",
    "Vercel Alternative",
  ],
  authors: [{ name: "Anchor Team" }],
  openGraph: {
    title: "Anchor — Serverless AWS Deployment Engine",
    description:
      "Vercel simplicity, powered directly by AWS. Instant static web app deployment to S3 and CloudFront with Amazon Bedrock.",
    url: "https://main.dnnu4lkh82cpn.amplifyapp.com",
    siteName: "Anchor",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anchor — Serverless AWS Deployment Engine",
    description:
      "Vercel simplicity, powered directly by AWS. Instant static web app deployment to S3 and CloudFront.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
