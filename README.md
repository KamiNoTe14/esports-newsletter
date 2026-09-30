# Hartland Esports website

Live at **https://kaminote14.github.io/esports-newsletter/**

| Page | What it is |
|---|---|
| `/` (and `teams`, `schedule`, `newsletters`, `media`, `about`) | The public program website. Every page reads its content from `data/site.json` and `data/issues.json`. |
| `/admin/` | **Site Manager**: edit teams, rosters, standings, brackets, records, news, gallery, sponsors, links and program info; turn sections on or off; publish. |
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
- `newsletters/<school year>/week-NN-YYYY-MM-DD.html`: published issues
- `assets/uploads/…`: images uploaded through the Site Manager
- `assets/site.css`, `assets/site.js`: site design and rendering
