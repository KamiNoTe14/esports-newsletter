# Hartland Esports website

Live at **https://kaminote14.github.io/esports-newsletter/**

| Page | What it is |
|---|---|
| `/` (and `teams`, `schedule`, `newsletters`, `media`, `about`) | The public program website. Every page reads its content from `data/site.json` and `data/issues.json`. |
| `/admin/` | **Site Manager**: edit teams, rosters, standings, brackets, records, news, gallery, sponsors, links and program info; turn sections on or off; publish. |
| `/admin/scores/` | **Scorekeeper**: phone-first live score entry (coaches sign in with Google). Scores are stored in Firebase Firestore (`hartland-esports`) and read live by the site. Add `?mock=1` to test without touching real data. |
| `/portal/` | **Coach's Portal**: build the weekly newsletter. **Publish for web** posts it to the site's Newsletters page. |

## One-time setup for each coach

1. Open the **Site Manager** (`/admin/`) and follow the **Connect** steps to create a GitHub access key and paste it in. The portal uses the same key automatically.
   - **Cameron:** a fine-grained key limited to this repository, with **Contents: Read and write**.
   - **Coach Watkins:** add him under **Settings → Collaborators**. After he accepts, he makes a classic token with only `public_repo` checked. GitHub's fine-grained keys can't be used on someone else's personal repository.
2. In the **portal**, connect the shared Google Drive newsletter folder under **Library → Choose folder** (Chrome or Edge).

## Everyday use

- **Newsletter:** build it in the portal, email it like before, then click **Publish for web**. The issue page, the Newsletters archive, the home page's "Latest report" and "Coming up" all update within about a minute.
- **Everything else:** change it in the Site Manager and click **Publish changes**.
- **Student privacy:** rosters have a **Gamertag only** box per player. The portal's Eagle of the Week has **Gamertag only on the website**.

## Files

- `data/site.json`: all site content (edited through the Site Manager)
- `data/issues.json`: the newsletter list (written by the portal)
- `data/matches/<season>.json`: backup of finished matches (written by the scorekeeper)
- `assets/matches.js`: the match data model and Firestore access, shared by the scorekeeper, site and future overlay
- `firestore.rules`: who can change scores. Paste into Firebase console → Firestore → Rules after any change
- `newsletters/<school year>/week-NN-YYYY-MM-DD.html`: published issues
- `assets/uploads/…`: images uploaded through the Site Manager
- `assets/site.css`, `assets/site.js`: site design and rendering
