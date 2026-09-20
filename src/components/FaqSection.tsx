"use client";

import { useState } from "react";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "How does Amazon Bedrock analyze and classify repositories?",
      answer:
        "Anchor extracts key package manifests (such as package.json, vite.config.ts, svelte.config.js, or index.html) via the GitHub API and prompts Amazon Bedrock (Claude 3.5 Sonnet / Nova Lite) to detect the exact build pipeline, framework type, required output directory (e.g. dist, build, public), and production build commands with deterministic schema validation.",
    },
    {
      question: "Is deployed infrastructure private and secure from S3 data leaks?",
      answer:
        "Yes, 100%. Anchor enforces AWS security best practices: all created S3 buckets have Public Access Block enabled. S3 bucket policies restrict access solely to the provisioned Amazon CloudFront distribution using Origin Access Control (OAC) with AWS SigV4 signed headers. No direct public HTTP access to S3 is ever allowed.",
    },
    {
      question: "How is the AWS monthly cost calculated per deployment?",
      answer:
        "Costs are calculated deterministically using AWS us-east-1 standard pricing constants based on the exact byte count of the uploaded build output. This includes S3 Standard storage ($0.023/GB-month), S3 PUT upload requests ($0.005/1,000 reqs), CloudFront regional data transfer out ($0.085/GB), and CloudFront HTTPS request fees ($0.0075/10,000 reqs) for a baseline traffic scenario.",
    },
    {
      question: "Why is there a DNS warming state for newly created sites?",
      answer:
        "Newly created Amazon CloudFront distributions require approximately 30 to 60 seconds for global DNS root and edge resolvers to populate the new *.cloudfront.net hostname across 600+ edge locations worldwide. Anchor automatically probes DNS resolution in real-time via dual server and client health-checks to prevent browser NXDOMAIN errors.",
    },
    {
      question: "What frameworks and static formats are supported?",
      answer:
        "Anchor supports modern JavaScript/TypeScript SPAs (Vite, React, Vue, Svelte, Preact, Solid), static site generators (Astro, 11ty, Hexo), classic HTML5/CSS canvas games and interactive simulations, and static export builds.",
    },
  ];

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            Knowledge Base
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Technical architecture, security boundaries, and AWS integration details.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className={`rounded-2xl border transition-all ${
                  isOpen
                    ? "border-indigo-500/50 bg-zinc-900/60 shadow-lg shadow-indigo-500/5"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/30"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="w-full flex items-center justify-between p-5 text-left text-sm font-semibold text-white gap-4"
                >
                  <span>{faq.question}</span>
                  <span className={`text-base transition-transform duration-200 text-indigo-400 ${isOpen ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/60 mt-1">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
