# AuthShield 360

AuthShield 360 is a campus portal for Student, Teacher, and Administrator accounts. The application uses Next.js App Router for both the React interface and same-origin API routes, Tailwind CSS for the UI, and the existing MongoDB-backed models and authentication services.

## Run locally

1. Install the root application dependencies:

   ```powershell
   npm install
   ```

2. Configure environment values in `AuthShield_360_ServerSide/.env` (copy `.env.example` in that folder). Set a private `MFA_ENCRYPTION_KEY`; local MongoDB defaults to `mongodb://127.0.0.1:27017/authshield360`.
3. Start the Next.js application:

   ```powershell
   npm run dev
   ```

   Open `http://localhost:3000`. Next.js serves the React application and its `/api/*` endpoints from the same server. The database is connected and development seed data is initialized on the first API request.

Use `npm run build` and `npm start` for a production build and server. Production requires `MONGO_URI` and `MFA_ENCRYPTION_KEY`; phase 3 and per-account email sign-in verification require `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.

## Architecture

- `src/app` contains the App Router pages and API Route Handlers.
- `src/components` contains the React authentication and portal screens.
- `src/context/auth-context.tsx` manages login state. Only the basic user profile is stored in localStorage; the session token remains in an HttpOnly cookie and is never written to browser storage.
- `src/lib/server/routes.ts` maps same-origin API methods and paths to controllers and role/MFA middleware. `legacy-controller-adapter.ts` adapts the existing controller response contract to Next.js responses.
- `AuthShield_360_ServerSide/src/models`, `services`, and `controllers` retain the domain models, reusable service logic, and modular controller actions used by the Next.js API.

## Authentication phases

`AUTH_PHASE` selects the authentication comparison scenario:

- `1`: bcrypt-backed password login.
- `2`: password plus authenticator TOTP; users without an authenticator must enroll before using the portal.
- `3`: verified email, password, authenticator TOTP, and a six-digit email OTP that expires after five minutes. In development the email code is shown in the sign-in flow; production requires SMTP.

Set `AUTH_PHASE` in the environment before starting Next.js. All phases hash passwords with bcrypt. Phase 1 is a controlled comparison scenario, not a recommended production policy.

In Security settings, each account can independently enable an authenticator app (TOTP), email sign-in verification, both, or neither (subject to the selected comparison phase). Enabling email verification requires the current password and a code sent to the account email; when TOTP is already enabled, its current code is also required. Email-only sign-in verifies password then email OTP. When both methods are enabled, sign-in requires password, TOTP, then email OTP. Email codes expire after five minutes and allow at most five attempts. Configure SMTP for production; in development, the email code is shown in the app and written to the server log.

## Mailtrap email testing

1. In Mailtrap, create an **Email Testing** inbox, then open its SMTP settings/integration instructions. Copy the SMTP host, port, username, and password shown for that inbox. Email Testing catches messages in the inbox; it does not deliver them to real recipients.
2. Set these values in `AuthShield_360_ServerSide/.env` (keep the SMTP password private):

   ```dotenv
   FRONTEND_URL=http://localhost:3000
   SMTP_HOST=sandbox.smtp.mailtrap.io
   SMTP_PORT=2525
   SMTP_SECURE=false
   SMTP_USER=your-mailtrap-smtp-username
   SMTP_PASS=your-mailtrap-smtp-password
   EMAIL_FROM=AuthShield 360 <no-reply@example.com>
   ```

   Use the exact host and credentials from the Mailtrap SMTP settings if they differ. Port `2525` with `SMTP_SECURE=false` uses SMTP STARTTLS via Nodemailer.
3. Restart Next.js after editing `.env`. In Mailtrap, confirm the test email appears in the inbox. Try registration email verification with `AUTH_PHASE=3`, or enable email sign-in verification from Security settings; sign-in codes are also sent through the configured SMTP transport.

For messages that must reach a real email address, use **Mailtrap Email Sending** and its sending-domain SMTP credentials instead of an Email Testing inbox. Verify the sending domain and sender address in Mailtrap first, then configure the sending SMTP host/credentials and an authorized `EMAIL_FROM`. Never commit `.env` or expose SMTP credentials in frontend code.

## Development demo accounts

The development seeder initializes these accounts and sample academic, attendance, and security-test records:

| Role | Username | Password |
| --- | --- | --- |
| Student | `student1` | `Student123!` |
| Student with TOTP | `student_mfa` | `Student123!` |
| Teacher | `teacher1` | `Teacher123!` |
| Teacher | `teacher2` | `Teacher123!` |
| Administrator | `admin1` | `Admin123!` |

The test TOTP secret exists only for the seeded development account. Never use demo credentials or secrets in production. Production skips demo account and sample-record seeding. Public registration always creates a Student; only an Administrator can assign another role.

## Data and security notes

- Development uses local MongoDB by default. Configure `DATABASE_MODE` and `MONGO_URI` to use another MongoDB deployment. Development can fall back to the local JSON store if MongoDB is unavailable; production refuses to start without persistent MongoDB.
- Use HTTPS in production. Session cookies are HttpOnly, Secure in production, and same-site. localStorage is only a client-side cache of non-secret profile details and is not used as proof of authentication.
- This project is not certified as compliant. Applicable privacy, retention, accessibility, incident-response, and student-record requirements must be determined for the institution and deployment jurisdiction before real student data is used.