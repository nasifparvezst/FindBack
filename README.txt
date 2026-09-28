FindBack - Lost & Found Management System
FINAL VERSION WITH REPORT MATCHING

Technology:
- HTML
- CSS
- JavaScript
- Browser localStorage

Total HTML pages: 9

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
