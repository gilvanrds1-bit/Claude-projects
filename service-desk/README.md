# Service Desk — ticket logging & intelligence

A single-page platform for logging service desk tickets and seeing, at a glance, **which
systems keep breaking and which parts of the business keep paying for it**.

Every ticket captures the five things you asked for:

| Field | Range | Notes |
|---|---|---|
| **System number** | 1–22 | numbered list, fixed |
| **System name** | 22 names | travels with the number |
| **Configuration item code** | one per system | belongs to the system, so the form fills it in — `CA-1` for Castor, `SH-1` for Sham |
| **Business units impacted** | 1–4 | a ticket can hit several at once |
| **Answer code** | 4 digits | the resolution code, with a meaning attached |

Tickets are entered by hand **or by photograph** — point a phone at the paper ticket and the
fields are read off the picture and put straight onto the dashboard.

Open `index.html` in a browser. There is nothing to install, no build step and no server.

There is also a **portable single-file build** at
[`dist/service-desk-standalone.html`](dist/service-desk-standalone.html) — the whole app folded
into one file you can email to a colleague or drop on a share. It seeds sample tickets on a
first visit so the dashboard opens with something to look at. The one thing it cannot carry is
the recognition engine (a worker plus about 10 MB of WebAssembly and language data, which the
browser has to fetch as separate files), so that copy pulls it from a CDN and needs to be
online for photo capture. Use the folder version if you want recognition with no network at
all. Rebuild it after changing anything under `assets/`:

```sh
node build.js
```

---

## The six tabs

### Dashboard
Six headline tiles, then the charts:

- **Tickets by system** — which of the 22 is costing you most
- **Tickets logged per day** — the trend, with a crosshair readout
- **Priority mix** — P1 to P4 in fixed order
- **Business units impacted** — a ticket counts against every unit it hits
- **Answer codes** — the top ten, so you can see *what kind* of work this really is
- **System against business unit** — a heat matrix: the same system hurts different parts of
  the business, and this is where you see it
- **The ticket log** — sortable, searchable, click a row to edit it

Every bar and every cell is clickable and sets the filter, so "GIS Network Mapping" →
"Finance" is two clicks away.

### Log a ticket
The manual form. Choosing a system fills in its configuration item code, so that field is
normally a glance rather than a keystroke; override it and the app warns (never blocks) that
it differs from the code on record. Business units are tick boxes, answer codes are grouped
by category.

### Photo capture
Take a photo, choose image files, drag them in, or paste from the clipboard — several at a
time, each photo becoming one ticket. What happens next:

1. the image is upscaled, turned to greyscale and contrast-stretched
2. Tesseract reads the text, entirely inside your browser
3. the text is parsed into fields
4. anything read cleanly is added to the dashboard automatically; anything doubtful waits
   in a review card showing what was found, where each value came from, and the photo itself

The reader picks up these labels, with or without a colon: **System No**, **System Name**,
**System ID** (also **Configuration Item**, **Item Code**, **CI**), **Business Units**,
**Answer Code**, **Priority**, **Status**, **Reported by**, **Issue**, **Date**. Failing a
label it falls back to matching your system names, finding a configuration item code it
recognises, and finding a four digit answer code it recognises.

Because the item code identifies the system, reading `RD-1` off a photo is enough to know the
ticket is against Rastaban — and knowing the system supplies the code when the photo lost it.
Look-alike characters are allowed for (`lZ-l` reads as `IZ-1`) but only within the pairs a
camera actually confuses, and only when one code matches: `NN-1` (Nunki) and `NN-2` (Nash) can
never be mistaken for each other, and `PO-1` (Polaris) and `PD-1` (Phad) stay distinct.

It will not invent a value. A field it cannot read is flagged, and the ticket stops for a human.

`docs/ticket-form.html` prints a blank ticket laid out the way the reader expects — worth
using if you want the highest hit rate.

### Knowledge base
A separate store from the tickets. Each entry records **an application, the business units it
impacts, a question number and the answer** — answers are free text, so letters, digits and
symbols like `A#7/2` or `§9/AB-*` are kept exactly as typed and never reformatted.

Look one up by choosing the application and ticking the impacted units. Results are ranked, and
each says why it matched:

| | |
|---|---|
| **exactly these units** | the impacted units are precisely the ones recorded |
| **applies whenever its units are hit** | everything the entry needs is impacted, and more besides |
| **recorded against a wider set** | the entry covers these units and others |
| **shares some units** | partial overlap, shown last |

Anything with no unit in common is not returned at all. Leave the application on *Every
application* to search across all of them, or tick no units to list everything recorded against
one. Click any result to edit it.

The trio of **application + impacted units + question number** is the key: recording the same
trio twice offers to replace the existing answer rather than quietly creating a second one.

The same lookup runs quietly on the **Log a ticket** tab — pick a system, tick the units, and any
answer that applies appears beside the form, which is the point of keeping the database at all.

### Reference data
Your 22 systems and their codes, the 4 business units and the answer code list, all editable
in place. Systems and business units are real; the answer codes are still a starter list — see
the note below.

### Data
CSV export of whatever the dashboard is currently showing, a full JSON backup (tickets,
knowledge base and reference data together), import, sample data for a look around, and the
delete buttons. The knowledge base has its own CSV export on its own tab.

---

## Before you use it for real

The 22 systems and their configuration item codes are the real ones, taken from the
configuration item sheet. Systems 15–22 (Acubens, Acamar, Cheleb, Capella, Mars, Neptune,
Pluto and P2132-5) have **no code recorded yet** — the app handles that: it does not ask for
one, and it will not invent one. Add them when you have them.

The four business units are named as they appear on the sheet — `1`, `2`, `3`, `4`. Give them
words on the Reference data tab and every chart, filter and export follows. Until then the
parser identifies them by number alone: a unit whose name is just a digit is never matched
against prose, so a stray "3" in an issue description cannot tick a box.

The **answer codes are still placeholders** — a starter list with plausible meanings, there so
the code list is not empty. Replace it with yours. Two ways to change any of this:

- **Quickest:** the *Reference data* tab, then *Save reference data*. Stored in your browser.
- **For everyone:** edit `assets/js/config.js` and commit it. That changes the defaults every
  new browser sees.

Codes are compared with case and punctuation ignored, so `ca-1`, `CA 1` and `CA1` all count as
Castor. Two systems cannot share a code — saving is refused if you try, because that would make
a photographed code ambiguous. A ticket whose code differs from the one on record is flagged
with a `?`, never rejected: the desk keeps moving.

---

## Where the data lives

In the browser's local storage, on the machine that logged the ticket. Nothing is sent
anywhere; there is no backend and no account. That makes it trivial to run and trivially
private — photographs in particular never leave the device.

The trade-off is that the log is per-browser. To share one, export the JSON backup and import
it on the other machine. If you later want a shared, multi-user log, the place to change is
`assets/js/store.js` — every read and write goes through it, so swapping local storage for an
API is a contained job.

---

## Layout

```
index.html                     the whole app
assets/css/app.css             one stylesheet, light and dark
assets/js/config.js            systems and codes, business units, answer codes  ← edit this
assets/js/store.js             persistence, ticket CRUD, aggregations
assets/js/charts.js            dependency-free SVG bar, line and heatmap charts
assets/js/ocr.js               photo pre-processing, recognition, field parsing
assets/js/dashboard.js         tiles, charts, filters, table
assets/js/app.js               tabs, forms, capture queue, import/export
vendor/tesseract/              the recognition engine, committed so it works offline
docs/ticket-form.html          printable blank ticket
build.js                       folds the app into one portable file
dist/                          that single-file build
test/parser.test.js            tests for the photo parser
test/knowledge.test.js         tests for the knowledge base lookup
```

## Tests

```sh
node test/parser.test.js
node test/knowledge.test.js
```

44 assertions over fourteen realistic tickets: clean printed forms, phone-photo noise where `O`
becomes `0` and `l` becomes `1`, unlabelled scrawl, a code standing in for the whole system,
`NN-1` against `NN-2`, a system with no code recorded, missing fields, a year that must not be
mistaken for an answer code, and a code that disagrees with the system number written beside it.

The knowledge base tests cover the lookup: exact combinations first, the ranking below them,
a query narrower than the entry, partial overlap, scoping to one application against searching
them all, question numbers sorting as numbers so 2 comes before 11, symbols surviving a round
trip, and the duplicate key.

## Browser support

Any current browser. Text recognition needs WebAssembly; a SIMD and a non-SIMD build are both
committed, so older browsers still work, just more slowly. The first photo of a session takes
a few seconds to warm the engine up, and subsequent ones are quick.
