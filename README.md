Shared Expense Tracker
A Splitwise-inspired expense management application built using React, Node.js, Express, PostgreSQL, and Prisma.
The application supports:
* Group expense tracking
* Multiple expense split methods (Equal, Exact, Percentage, Share)
* Settlement management
* CSV import with anomaly detection and resolution
* Historical member tracking using join and leave dates
Live Deployment
Frontend: https://shared-expense-pied.vercel.app
Backend: https://shared-expense-1.onrender.com

⸻

Tech Stack
* React
* Vite
* Tailwind CSS
* Node.js
* Express.js
* PostgreSQL
* Prisma
* JWT Authentication

⸻

Local Setup
Backend
cd backend
npm install
npx prisma migrate dev
npm run dev
Required environment variables:
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_secret_key
Backend runs on:
http://localhost:4000
Frontend
cd frontend
npm install
npm run dev
Required environment variables:
VITE_API_URL=http://localhost:4000/api
Frontend runs on:
http://localhost:5173
 
⸻
 
AI Used
The following AI tools were used during development:
* ChatGPT
* Claude
AI was used for:
* Debugging backend and frontend issues
* Prisma schema design discussions
* CSV anomaly detection logic
* Deployment troubleshooting
* React component development
* Documentation drafting
Detailed AI usage, prompts, mistakes, and corrections are documented in AI_USAGE.md.
