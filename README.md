# Anchor

"Vercel for AWS" — connect a GitHub repo, get it analyzed and classified,
deploy it straight to AWS with a live URL.

## MVP scope (26-hour hackathon — do NOT expand beyond this)
- ONE deploy path: static frontend → S3 + CloudFront.
- Classification via Bedrock, reading only a small manifest summary of the repo.
- Deployment history + status in DynamoDB.
- Lambda + API Gateway backend path is a STRETCH GOAL ONLY — do not start it
  unless the static path is fully working and tested by hour 13.

## Hour-by-hour plan
- 0–5: Auth (GitHub OAuth) + repo manifest fetcher + Anchor itself deployed to AWS Amplify
- 5–13: Bedrock classifier + static deploy path working end-to-end on one repo
- 13–19: Harden static path on 2-3 repos. Stretch: Lambda path, ONLY if ahead
- 19–22: Dashboard polish + edge case fixes. No new features after this point
- 22–26: Record 3-min demo, write submission, submit with buffer

## Setup
1. Copy `.env.example` to `.env.local` and fill in credentials
2. `pnpm dev`
