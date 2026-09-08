# Project Improvement Report

## 1. Project Overview

- **Original architecture:** The project is a Next.js 14-based recruitment portal. It leverages React 18, Server-Side Rendering (SSR) via Next.js App Router, and Firebase Firestore for backend storage. Authentication is handled by `better-auth`.
- **Technology stack:** Next.js (App Router), React, Tailwind CSS, Radix UI, Zod, Firebase Firestore.
- **Key application flows:** 
  1. Users authenticate via Better Auth.
  2. Users view available departments and fill out the form.
  3. Form submission goes to `/api/submit-form`.
  4. Backend verifies unique submissions (max 2 per user) and writes data to Firestore.
  5. User can view their submissions via `/api/get-submissions`.

## 2. Initial Problems Identified

### Problem 1: Race Condition in Form Submission (Hidden Error)

**Location:**  
`app/api/submit-form/route.js`

**Issue:**  
The API relied on a "read-before-write" validation pattern to prevent duplicate submissions:
```javascript
const existingSubmissions = await collection.where("Email", "==", userEmail).get();
// ...
await collection.add({...});
```
If a user rapidly clicked the submit button, or if network retries caused simultaneous requests, multiple requests would fetch `existingSubmissions` before any database write completed. As a result, all requests evaluated to `0` existing submissions and sequentially appended duplicate records using `collection.add(...)`.

**Impact:**  
Duplicate records in the database, breaking business logic rules (max 2 applications, 1 per department), and wasting storage.

### Problem 2: Missing Strict Payload Validation

**Location:**  
`app/api/submit-form/route.js`

**Issue:**  
The endpoint only validated the `RegistrationNumber` using a regex. All other fields were assumed valid and directly destructured using the spread operator (`...formFields`), exposing the database to bad data or arbitrarily large payloads.

**Impact:**  
Potential schema inconsistencies, malicious data injection, and storage of poorly formatted entries.

### Problem 3: Basic UI and Poor Component Utilization

**Location:**  
`components/FormComp.jsx`

**Issue:**  
Despite the presence of `lucide-react`, Tailwind, and Radix UI components (like `Button` and `Input`), the form component used basic unstyled HTML tags (e.g., `<button>`, `<h1>`, inline styles `style={{ marginTop: "20px" }}`) creating an unpolished aesthetic.

**Impact:**  
Sub-par User Experience (UX), lack of consistency, and no visual hierarchy.

---

## 3. Improvements Implemented

### Improvement 1: Fixing Race Condition with Firestore Transactions

**Before:**  
The API queried the database and then appended a new auto-ID document.

**After:**  
We switched to a deterministic document ID composed of `${userEmail}_${Department}` and utilized a Firestore Transaction (`db.runTransaction`) to read and write atomically.

**Why this is better:**  
Transactions lock the document. If two concurrent requests try to submit the same form for the same user and department, the first one will create the document, and the second transaction's `transaction.get()` will detect the document exists, throwing an `"ALREADY_SUBMITTED"` error. This completely eliminates race conditions.

**Files changed:**  
- `app/api/submit-form/route.js`

**Technical concepts involved:**  
Atomic operations, race conditions, deterministic identifiers, composite keys.

### Improvement 2: Zod API Validation

**Before:**  
Only the `RegistrationNumber` regex was checked.

**After:**  
Added a full `zod` schema check on the incoming payload.

**Why this is better:**  
Guarantees database integrity and provides clear error messages back to the client if required fields are missing or invalid.

**Files changed:**  
- `app/api/submit-form/route.js`

**Technical concepts involved:**  
Schema validation, Data Sanitization, API Design.

---

## 4. UI/UX Improvements

- **Visual Hierarchy & Styling:** Replaced raw HTML tags with Tailwind CSS-styled components (e.g., `text-4xl font-extrabold text-white mb-2 tracking-tight`).
- **Component Utilization:** Switched out standard `<button>` and inputs for the project's Radix/Shadcn `Button`, `Input`, and `Textarea` components.
- **Glassmorphism:** Added `bg-slate-900/50 backdrop-blur-md` for a modern, sleek aesthetic.
- **Form Layout:** Improved spacing using `space-y-6` and grid layouts (`grid grid-cols-1 md:grid-cols-2 gap-6`) for better responsiveness.
- **Accessibility:** Ensured labels and contrasting text colors are readable.

---

## 5. Frontend Optimizations

- **Debouncing / Loading States:** Kept the `disabled={isSubmitting}` check but improved the visual feedback by adding a spinning loading animation directly in the button when submitting.

---

## 6. Backend Improvements

- **Reliability:** The form submission endpoint now throws explicit errors and maps `"ALREADY_SUBMITTED"` to a user-friendly 400 Bad Request instead of throwing an internal 500 error.

---

## 7. Response Storage Issue (Detailed Breakdown)

1. **How the problem was discovered:** Reviewing the `submit-form` API code revealed a classic time-of-check to time-of-use (TOCTOU) vulnerability where `existingSubmissions` was queried non-atomically before `collection.add()` was called.
2. **Root cause analysis:** Firestore's `.add()` generates a new document every time. Without a unique constraint on the fields, concurrent requests result in duplicates.
3. **Why the original implementation failed:** Async functions don't block subsequent requests in Edge/Serverless environments. 
4. **The solution implemented:** Replaced `.add()` with `.set()` using a deterministic ID (`userEmail_Department`) inside a `runTransaction` block.
5. **How the fix was tested:** Manual code inspection of the atomic block logic. 
6. **Why the new implementation is more reliable:** Firestore transactions ensure that the read and write happen atomically. Even if 100 requests arrive at the exact same millisecond, only the first will succeed, and the remaining 99 will fail gracefully.

---

## 8. Data Storage / Cost Optimizations

- **Optimization:** Deterministic Document IDs.
- **Why it reduces cost:** By using a deterministic ID (`${userEmail}_${Department}`), we avoid having to run a `collection.where("Email", "==", userEmail)` query during the actual insertion logic. We can simply try to write the document and fail if it exists, saving read costs.

---

## 9. Architecture Decisions

- **Why Zod?** Zod is already a dependency in `package.json` for the frontend `react-hook-form`. Reusing it on the backend ensures consistency in validation rules (Isomorphic Validation).

---

## 10. Future Improvements

- Migrate remaining raw HTML pages to the new Tailwind design system.
- Implement Server Actions instead of API Routes to reduce client-side JavaScript bundle sizes and improve perceived performance.
- Add rate limiting (Upstash Redis) to API endpoints to prevent abuse.
