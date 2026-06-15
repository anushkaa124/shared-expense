SCOPE.md — Anomaly Log & Database Schema
Overview
This project is a Splitwise-inspired expense management system that supports:
* User authentication
* Group creation and management
* Expense tracking and settlements
* Historical member participation using join/leave dates
* CSV import with anomaly detection
* Interactive anomaly resolution workflow
The application stores all imported anomalies for user review instead of silently modifying data.
 
⸻
 
Database Schema
User
Stores registered users. Passwords are hashed before storage.
User
├── id           Int (PK)
├── name         String
├── email        String (unique)
├── password     String
└── createdAt    DateTime
 
⸻
 
Group
Represents a shared-expense group.
Group
├── id        Int (PK)
├── name      String
└── createdAt DateTime
 
⸻
 
GroupMember
Tracks membership history within a group.
The joinedAt and leftAt fields are used when calculating historical expense splits.
GroupMember
├── id       Int (PK)
├── groupId  Int (FK → Group)
├── userId   Int (FK → User)
├── joinedAt DateTime
└── leftAt   DateTime? (null = currently active)
 
⸻
 
Expense
Represents a shared expense.
All calculations are performed using amountInINR for consistency.
Expense
├── id           Int (PK)
├── groupId      Int (FK → Group)
├── description  String
├── amount       Float
├── currency     String
├── amountInINR  Float
├── date         DateTime
├── paidById     Int (FK → User)
├── splitType    String
├── isSettlement Boolean
├── importFlag   String?
└── createdAt    DateTime
 
⸻
 
ExpenseSplit
Stores each participant’s share of an expense.
ExpenseSplit
├── id        Int (PK)
├── expenseId Int (FK → Expense)
├── userId    Int (FK → User)
└── amount    Float
 
⸻
 
Settlement
Represents a payment made to settle balances between members.
Settlement
├── id         Int (PK)
├── groupId    Int (FK → Group)
├── payerId    Int (FK → User)
├── receiverId Int (FK → User)
├── amount     Float
├── date       DateTime
└── note       String?
 
⸻
 
ImportAnomaly
Stores all CSV import issues for later review.
ImportAnomaly
├── id          Int (PK)
├── importBatch String
├── groupId     Int?
├── rowNumber   Int
├── rawData     String
├── issue       String
├── action      String
├── resolved    Boolean
├── resolvedBy  Int?
└── createdAt   DateTime
 
⸻
 
Anomaly Detection Scope
The importer detects 19 categories of anomalies.
Some anomalies are automatically corrected, while others require explicit user decisions.
 
⸻
 
A1 — Missing Description
Problem
Expense description is empty.
Detection
!row.description || !row.description.trim()
Action
SKIPPED
The row is ignored because the expense cannot be identified.
 
⸻
 
A2 — Settlement Recorded as Expense
Problem
The description suggests a repayment rather than a shared expense.
Detection
Keyword matching against terms such as:
* paid back
* settlement
* transfer
* returned
Action
PENDING_REVIEW
User chooses whether to convert the row into a settlement or discard it.
 
⸻
 
A3 — Invalid Amount
Problem
Amount cannot be parsed as a number.
Detection
parseAmount() === null
Action
SKIPPED
 
⸻
 
A4 — Amount Contains Formatting Characters
Problem
Amount contains commas or currency symbols.
Example:
1,200
₹4,500
Detection
String preprocessing.
Action
AUTO_FIXED
Formatting characters are removed before parsing.
 
⸻
 
A5 — Zero Amount
Problem
Expense amount equals zero.
Detection
amount === 0
Action
PENDING_REVIEW
User decides whether to keep or discard the record.
 
⸻
 
A6 — Negative Amount
Problem
Expense amount is negative.
Detection
amount < 0
Action
PENDING_REVIEW
User decides whether to treat the row as a refund or discard it.
 
⸻
 
A7 — Missing Currency
Problem
Currency information is unavailable.
Detection
Currency cannot be inferred from either:
* amount field
* currency column
Action
PENDING_REVIEW
User selects the correct currency.
 
⸻
 
A8 — USD Currency Conversion
Problem
Expense is recorded in USD.
Detection
currency === "USD"
Action
AUTO_FIXED
Amount is converted into INR using the configured exchange rate.
 
⸻
 
A9 — Ambiguous Date Format
Problem
A date such as:
10/03/2026
may represent:
* 10 March 2026
* 3 October 2026
Detection
Day value ≤ 12 and format matches DD/MM/YYYY.
Action
PENDING_REVIEW
User chooses the intended interpretation.
 
⸻
 
A10 — Missing Year
Problem
Date contains month and day but no year.
Example:
Mar 14
Detection
Month-day pattern without year.
Action
PENDING_REVIEW
User selects the correct year.
 
⸻
 
A11 — Invalid Date
Problem
Date is missing or cannot be parsed.
Detection
parseDate() fails
Action
SKIPPED
 
⸻
 
A12 — Missing Paid By
Problem
The payer is not specified.
Detection
paid_by missing
Action
PENDING_REVIEW
User selects the payer.
 
⸻
 
A13 — Unknown Member
Problem
The payer does not exist in the group.
Detection
Member lookup fails.
Action
PENDING_REVIEW
User may:
* create a new member
* ignore the row
 
⸻
 
A14 — Post-Departure Expense
Problem
Expense occurs after the payer left the group.
Detection
expenseDate > leftAt
Action
PENDING_REVIEW
User decides whether to override or discard.
 
⸻
 
A15 — Unknown Members in Split
Problem
One or more participants in split_with are not group members.
Detection
Split participant lookup fails.
Action
PENDING_REVIEW
User creates missing members or skips the row.
 
⸻
 
A16 — Invalid Split Type
Problem
Split type is not recognised.
Examples:
PERCENTAGE
SHARES
UNEQUAL
Detection
Value not in:
* EQUAL
* EXACT
* PERCENT
* SHARE
Action
AUTO_FIXED
Known aliases are mapped to supported split types.
 
⸻
 
A17 — Percentages Do Not Sum to 100%
Problem
Percentage allocations total more or less than 100%.
Detection
sum(percentages) !== 100
Action
PENDING_REVIEW
User may:
* normalize percentages
* edit manually
* skip the row
 
⸻
 
A18 — Possible Duplicate Expense
Problem
A similar expense already exists.
Detection
Matching based on:
* description
* date
* amount
Action
PENDING_REVIEW
User chooses whether to keep or discard the duplicate.
 
⸻
 
A19 — No Active Members Available
Problem
No group members were active on the expense date.
Detection
Active-member lookup returns an empty set.
Action
SKIPPED
The expense cannot be allocated.
 
⸻
 
Design Assumptions
3. All balance calculations are performed using INR values stored in amountInINR.
4. Historical expenses are split only among members active on the expense date.
5. Settlement transactions are stored separately from expenses.
6. CSV imports are non-destructive; anomalies are preserved for review.
7. User decisions take precedence over automatic anomaly corrections.
8. Membership history is preserved using joinedAt and leftAt rather than deleting records.
