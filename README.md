# Govt Degree College for Girls & Boys — Campus Portal

A responsive college portal starter built with HTML, CSS, JavaScript and Firebase Authentication + Cloud Firestore.

## Included
- Responsive home page and mobile navigation
- Faculty directory with search
- Lecture timetable
- Public campus notifications
- Email/password student signup and sign-in
- Student complaint submission and admin status management
- Admin-only forms for faculty, timetable, notifications and attendance
- Light/dark theme toggle
- Firestore security rules

## 1. Create and configure Firebase
1. Open https://console.firebase.google.com/ and create a Firebase project.
2. Add a **Web App** in Project settings and copy its Firebase configuration.
3. Open `firebase-config.js` and replace every `PASTE_...` value with the values from your Firebase web app.
4. In **Build → Authentication → Sign-in method**, enable **Email/Password**.
5. In **Build → Firestore Database**, create a database.
6. Open Firestore **Rules**, replace the rules with the content of `firestore.rules`, then click **Publish**.
7. Run the website using VS Code Live Server, or deploy it to a static host.

## 2. Make an administrator account
1. Use the portal's **Create student account** tab to create your own account.
2. In Firebase Console → Firestore Database → `users`, open the document whose ID matches your account's Firebase Authentication UID.
3. Change its `role` field from `student` to `admin`. Keep the field as a string.
4. Sign out and sign in again. The Admin Dashboard should appear.
5. Never give admin access to an account unless it is trusted and authorized by the college.

Do not add a public admin-signup option. This project intentionally creates all new accounts as `student`; admin access must be assigned from the trusted Firebase Console.

## 3. Add sample content
Sign in as the admin account and use the Admin Dashboard forms to add faculty, lecture schedule, notices and attendance entries. These records will appear on the public page after publishing.

For attendance, enter the student's email exactly as used for their Firebase sign-in. Only an admin can create or change attendance records. Students can read attendance records matching their signed-in email.

## 4. Important notes before competition / real deployment
- Replace the generic college name with the institution's officially approved full name, logo, contact details and actual information.
- Test signup, sign-in, complaint submission, admin publishing and permissions with separate test accounts.
- Review the Firestore rules with the college's authorized IT administrator before using real student data.
- Do not put service-account keys or other private credentials in frontend code.
- For production, consider Firebase App Check, verified email, password reset UI, stronger audit logs, backups and a formal complaint privacy/retention policy.
- This is a working starter, not an officially hosted college system. Firebase must be configured in your own project before cloud features work.

## Files
- `index.html` — page structure
- `style.css` — design and responsive layout
- `app.js` — UI behaviour and Firebase features
- `firebase-config.js` — your Firebase web app configuration
- `firestore.rules` — Firestore access control rules