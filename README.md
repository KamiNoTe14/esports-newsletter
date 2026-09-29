# Hartland Eagles Esports: Coach's Portal

The weekly newsletter builder for *The Esports Report*. It's a single web page (`index.html`) with nothing to install and no server.

## Put it online (GitHub Pages, one time)

1. On GitHub, create a new repository (for example `esports-newsletter`). Public is fine; the page contains no student data until someone types it in, and everything you type is stored on your own computer and in your Drive folder, not on GitHub.
2. Upload `index.html`, `README.md` and `.nojekyll` (drag them onto the repository page, then **Commit changes**).
3. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then **Save**.
4. After a minute the portal is live at `https://<your-username>.github.io/esports-newsletter/`. Bookmark it on both computers.

To update the portal later, upload a new `index.html` over the old one.

## Set up the shared library (each coach, one time)

1. Install **Google Drive for desktop** and sign in with your school account.
2. Make one folder you both can edit, for example **Shared drives › Esports › Newsletters** (or a folder in one person's My Drive shared with the other).
3. Open the portal in **Chrome or Edge**, click **Library → Choose folder**, and pick that folder in the Google Drive section of the file picker. Allow the browser to edit files when it asks.

Chrome remembers the folder. After restarting the browser you may see **Library: click to reconnect**. One click restores it.

## How the library works

- Each issue is saved as a file: `Newsletters/2026-27/Week 03 - 2026-09-25.json`. The school-year folder is picked from the issue date (July starts a new school year) or from the **School year folder** box.
- Once an issue is in the library, changes save automatically a second or two after you stop typing. The status pill in the top bar shows when it last saved.
- **Start next week** saves the current week to the library first, then starts the new week, with last week's schedule carried into results.
- **Library** lists every issue by school year. Search it, filter by tag, **Open** an issue to read or edit it, or **Copy** one to start a new issue from it.
- **Publish for web** saves a self-contained web page of the issue (into `2026-27/Web pages/` and your Downloads) and copies it, ready to paste into Google Sites with **Insert → Embed → Embed code**.

### Taking turns

Both of you can open the same issue. If one of you saves while the other has it open, the second person sees a yellow bar ("changed on another computer") and autosave pauses until they choose **Load their version** or **Keep mine**. Drive for desktop can take a few seconds to sync a change between computers, so let it finish before you switch.

### Other browsers

Firefox and Safari can't connect to a folder. The Library there offers **Save issue file** and **Open issue file** instead.
