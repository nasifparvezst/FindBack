FindBack - Lost & Found Management System
VERSION 4: AUTH, IMAGES, NOTIFICATIONS, ADMIN, ADVANCED SEARCH

Technology:
- HTML
- CSS
- JavaScript
- Browser localStorage

Total HTML pages: 13 (added login, register, notifications, admin)

Pages:
1. index.html
2. report-lost.html
3. report-found.html
4. browse.html
5. matches.html
6. details.html
7. my-reports.html
8. edit-report.html
9. about.html

Main functionality:
- Submit Lost item reports
- Submit Found item reports
- Form validation
- Bangladesh mobile number validation
- Prevent future lost/found dates
- Browse all reports
- Search reports
- Filter by report type, category and status
- View item details
- Edit own reports
- Delete own reports with confirmation
- Suggest possible Lost/Found matches
- Match one Lost report with one Found report
- Matching updates Lost -> Matched and Found -> Claimed
- Connected report IDs are displayed
- Undo an active match
- Mark a connected pair Returned with one action
- Both connected reports become Returned together
- Home statistics
- Browser localStorage persistence
- Responsive layout

Matching Workflow:
Lost Report + Found Report
        |
        v
Possible Matches page
        |
        v
User clicks "Match These Reports"
        |
        +--> Lost status = Matched
        +--> Found status = Claimed
        +--> Both reports store each other's report ID
        |
        v
Item is physically returned to the owner
        |
        v
Click "Mark Both Returned"
        |
        +--> Lost status = Returned
        +--> Found status = Returned

Important frontend-only limitation:
This academic project has no backend/database. Reports must exist in the same browser storage to be matched. A real multi-user production system would require a shared backend and database.

Recommended way to run:
Use VS Code Live Server and open index.html. This gives all pages the same local web origin and makes localStorage behavior reliable.


NEW IN VERSION 4
- Login/Register: only @seu.edu.bd emails are accepted. All pages except login/register require login.
- Ownership: every report stores ownerId. Only the owner (or admin) can edit/delete/match/return a report.
- Image upload: optional photo on Lost/Found reports, resized to max 800px JPEG and stored in localStorage.
- Notifications: owners of opposite-type reports are notified when a new report is a possible match (score >= 6),
  and when a pair is matched, unmatched, returned or removed by admin. Unread count shows in the navbar.
- Admin panel (admin.html): statistics, all reports with delete, and user list.
- Advanced search: multi-keyword search, date range, sort options, result count, clear filters.

Admin account (demo): admin@seu.edu.bd / Admin@123

Security note: passwords are only hashed with a simple client-side function and everything lives in localStorage.
This is for academic demonstration; real authentication needs a backend.
Storage key changed to findback_final_v4, so old v3 data is not shown.

RETURN RULES (updated)
- Matched pair: only the owner of the Lost report (or an admin) can press "Mark Both Returned". The Found owner is notified.
- Unmatched report: its owner can press "I Got My Item Back" (Lost) or "I Handed It Over" (Found) to mark it Returned directly,
  with an optional note. Use this when the item was returned by phone/in person without a matching report.
- Returns are not verified by the system (no backend); this is a stated limitation.
