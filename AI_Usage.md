AI_USAGE.md

AI Tools Used

* ChatGPT (OpenAI)
* Claude (Anthropic)

AI was used for debugging, deployment support, anomaly detection design, database discussions, and React/Node.js development.

⸻

Key Prompts

Prompt 1

Design a CSV anomaly detection workflow for a Splitwise-style expense tracker that supports interactive user resolution.

Prompt 2

Help me model group membership history using joinedAt and leftAt dates so historical expenses remain accurate.

Prompt 3

Help me deploy a React frontend on Vercel and a Node.js + Prisma backend on Render.

⸻

Case 1 — Anomaly Resolution Did Not Create Expenses

AI Output

The anomaly was marked as resolved but no expense was created.

How I Caught It

After resolving anomalies, the Expenses page remained unchanged.

Fix

I modified the resolution workflow to re-import the original row before marking the anomaly as resolved.

⸻

Case 2 — Missing Group Filter

AI Output

The anomaly query returned unresolved anomalies from all groups.

How I Caught It

Different groups displayed the same anomaly list.

Fix

I added group-based filtering and stored groupId in each anomaly record.

⸻

Case 3 — Duplicate Detection Was Too Strict

AI Output

Duplicate detection relied on exact description matching.

How I Caught It

Similar descriptions such as “Dinner at Marina Bites” and “dinner - marina bites” were imported separately.

Fix

I improved description normalisation and added similarity-based matching.

⸻

Summary

AI accelerated development and debugging, but all generated solutions were manually tested and refined before being included in the final application.
