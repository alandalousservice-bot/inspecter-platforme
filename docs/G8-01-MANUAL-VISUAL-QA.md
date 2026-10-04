# G8-01 Manual Visual QA

Use the existing synthetic LOCAL UAT environment only. Do not initialize or reset a database, run seed, or use personal/production accounts. The only approved database target is documented in [LOCAL_UAT_GUIDE.md](LOCAL_UAT_GUIDE.md).

## Start and open the application

Start the already-existing isolated PostgreSQL cluster if needed, following the guide; do not run `initdb` or delete its data directory. In PowerShell from the repository root, use two terminals:

```powershell
npm run build
npm run local:uat:api
```

```powershell
$env:API_PROXY_TARGET = 'http://127.0.0.1:3001'
npm run dev --workspace @inspector/web -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/login` and sign in with the existing synthetic LOCAL UAT Inspector. Do not paste its password into this document or chat.

## Routes and interaction setup

- `/app`: inspect the operational dashboard, cards, status badges, primary actions and neutral actions.
- `/app/institutions`: open **إضافة مؤسسة** to inspect the form dialog, input, select, labels, validation/error presentation, and dialog focus. Do not submit a record for this visual check.
- `/app/visits`: open an existing visit and its report editor. To inspect the danger button/dialog, make a temporary unsaved edit and navigate away; choose **البقاء في الصفحة** to avoid discarding work. Do not save or finalize a report for this check.
- `/public/d/<district-id>/register`: if a district-scoped public intake link is available, inspect Arabic and mixed Arabic/Latin input presentation without submitting the form.

Do not invent component variants or create data to expose a state. If a state is not naturally available from existing synthetic records, mark it unavailable in Notes.

## Browser zoom and viewport checks

Use the browser's actual zoom control/menu and set zoom to **200%** (do not emulate zoom with viewport resizing or page scaling). At 200%, verify the login screen and representative controls/dialogs. Also inspect at these browser viewport sizes at 100% zoom:

- Desktop: `1440×900`, `1280×800`
- Responsive: approximately `768px` wide and `390px` wide

At every size check RTL direction, focus visibility, readable Arabic, mixed Arabic/Latin content, long Arabic text, and absence of destructive horizontal clipping.

At actual 200% confirm all controls remain reachable, labels do not overlap, dialogs remain usable, focus is visible, and RTL/layout remain correct.

## Visual checklist

- **Buttons:** primary, secondary, danger if present; hover, keyboard focus, active where observable, disabled, and loading where naturally available.
- **Input:** normal, focused, disabled, error, Arabic, and mixed Arabic/Latin.
- **Select:** normal, focused, disabled, and invalid if supported by the existing form.
- **Textarea:** relevant existing states if present.
- **Card:** standard surface.
- **Dialog:** open state, initial focus, long Arabic content, constrained viewport, and 200% zoom.
- **Badges:** existing semantic success, warning, danger, and info states where available.

Do not submit public intake, create or edit business records, or finalize reports during this visual-only QA.

## Product Owner result

```text
MANUAL_ZOOM_200: PASS / FAIL
MANUAL_PRIMITIVE_VISUAL_QA: PASS / FAIL
NOTES:
```
