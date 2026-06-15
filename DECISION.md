DECISIONS.md — Decision Log
D1 — Store 
amountInINR
Alongside Original Amount
Decision
Store both the original expense amount and a converted INR amount.
Options Considered
* Store only original amount and convert during calculations
* Store only INR amount
* Store both values
Why This Was Chosen
Balance calculations are performed frequently. Converting currencies during every calculation would add complexity and reduce consistency. Storing amountInINR at import time allows fast balance calculations while preserving the original amount for display purposes.
 
⸻
 
D2 — Interactive Anomaly Resolution Workflow
Decision
Present import anomalies to the user for review rather than automatically rejecting or fixing all problematic rows.
Options Considered
* Reject all problematic rows
* Automatically fix all anomalies
* Allow user review and resolution
Why This Was Chosen
CSV files often contain ambiguous data such as unclear dates, unknown members, or incorrect percentages. User review ensures data quality while avoiding incorrect automatic assumptions.
 
⸻
 
D3 — Persist Anomalies in the Database
Decision
Store anomalies in an ImportAnomaly table.
Options Considered
* Store anomalies only in frontend state
* Store anomalies in browser local storage
* Store anomalies in the database
Why This Was Chosen
Database persistence prevents data loss if the user refreshes the page or returns later. It also provides an audit trail of import decisions.
 
⸻
 
D4 — Duplicate Detection Based on Description, Date and Amount
Decision
Use description, date, and amount similarity to detect potential duplicates.
Options Considered
* Exact matching only
* Advanced fuzzy matching algorithms
* Lightweight similarity matching
Why This Was Chosen
Exact matching misses many real duplicates, while advanced fuzzy matching adds unnecessary complexity. A lightweight similarity check provides a practical balance between accuracy and performance.
 
⸻
 
D5 — Historical Membership Tracking
Decision
Store both joinedAt and leftAt dates for every group member.
Options Considered
* Store only active members
* Maintain complete membership history
Why This Was Chosen
Expense calculations depend on who was part of the group at the time an expense occurred. Membership history allows accurate historical expense allocation.
 
⸻
 
D6 — JWT-Based Authentication
Decision
Use JWT authentication with client-side token storage.
Options Considered
* Server-side sessions
* Cookie-based authentication
* JWT authentication
Why This Was Chosen
JWT authentication is simple to implement, works well with a React single-page application, and avoids maintaining server-side session state.
 
⸻
 
D7 — Single Currency Balance Calculation
Decision
Perform balance calculations using INR values stored in amountInINR.
Options Considered
* Maintain balances separately for each currency
* Convert all expenses into a single currency
Why This Was Chosen
A single-currency balance system simplifies settlement calculations and provides a clear amount owed between members.
 
⸻
 
D8 — React + Vite Frontend Architecture
Decision
Build the frontend using React and Vite.
Options Considered
* Create React App
* Next.js
* React + Vite
Why This Was Chosen
The application does not require server-side rendering. Vite provides a faster development experience, simpler configuration, and efficient production builds.
 
⸻
 
D9 — PostgreSQL with Prisma ORM
Decision
Use PostgreSQL as the database and Prisma as the ORM.
Options Considered
* MongoDB
* Raw SQL
* PostgreSQL with Prisma
Why This Was Chosen
The application contains strongly related entities such as users, groups, expenses, settlements, and anomalies. A relational database provides strong consistency and Prisma simplifies database access and migrations.
 
⸻
 
D10 — PapaParse for CSV Processing
Decision
Use PapaParse to process imported CSV files.
Options Considered
* Manual CSV parsing
* csv-parse
* PapaParse
Why This Was Chosen
PapaParse handles quoted values, embedded commas, inconsistent formatting, and empty rows reliably, reducing parsing errors during import.
