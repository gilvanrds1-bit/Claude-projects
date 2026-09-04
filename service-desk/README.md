# Service Desk — ticket logging & intelligence

A single-page platform for logging service desk tickets and seeing, at a glance, **which
systems keep breaking and which parts of the business keep paying for it**.

Every ticket captures the five things you asked for:

| Field | Range | Notes |
|---|---|---|
| **System number** | 1–22 | numbered list, fixed |
| **System name** | 22 names | travels with the number |
| **System id** | varies by system | each system has its own id shape, checked against a per-system pattern |
| **Business units impacted** | 1–10 | a ticket can hit several at once |
| **Answer code** | 4 digits | the resolution code, with a meaning attached |

Tickets are entered by hand **or by photograph** — point a phone at the paper ticket and the
fields are read off the picture and put straight onto the dashboard.

Open `index.html` in a browser. There is nothing to install, no build step and no server.

---

## The five tabs

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
The manual form. The system id field knows the shape each system uses and warns (never
blocks) when what you type does not match. Business units are tick boxes, answer codes are
grouped by category.

### Photo capture
Take a photo, choose image files, drag them in, or paste from the clipboard — several at a
time, each photo becoming one ticket. What happens next:

1. the image is upscaled, turned to greyscale and contrast-stretched
2. Tesseract reads the text, entirely inside your browser
3. the text is parsed into fields
4. anything read cleanly is added to the dashboard automatically; anything doubtful waits
   in a review card showing what was found, where each value came from, and the photo itself

The reader picks up these labels, with or without a colon: **System No**, **System Name**,
**System ID**, **Business Units**, **Answer Code**, **Priority**, **Status**, **Reported by**,
**Issue**, **Date**. Failing a label it falls back to matching your system names, spotting an
id that fits a system's pattern, and finding a four digit code it recognises.

It will not invent a value. A field it cannot read is flagged, and the ticket stops for a human.

`docs/ticket-form.html` prints a blank ticket laid out the way the reader expects — worth
using if you want the highest hit rate.

### Reference data
Your 22 systems, 10 business units and the answer code list, all editable in place. **Replace
the placeholder names with your own** — see the note below.

### Data
CSV export of whatever the dashboard is currently showing, a full JSON backup (tickets plus
reference data), import, sample data for a look around, and the delete buttons.

---

## Before you use it for real

The 22 system names, the 10 business unit names and the answer codes that ship with the app
are **placeholders** — you had not given me yours. Two ways to replace them:

- **Quickest:** the *Reference data* tab, then *Save reference data*. Stored in your browser.
- **For everyone:** edit `assets/js/config.js` and commit it. That changes the defaults every
  new browser sees.

The system id patterns are regular expressions. `^FS-?\d{5,6}$` means "FS, an optional
hyphen, then five or six digits". A ticket whose id does not match is flagged with a `?`, never
rejected — the desk keeps moving.

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
assets/js/config.js            systems, business units, answer codes  ← edit this
assets/js/store.js             persistence, ticket CRUD, aggregations
assets/js/charts.js            dependency-free SVG bar, line and heatmap charts
assets/js/ocr.js               photo pre-processing, recognition, field parsing
assets/js/dashboard.js         tiles, charts, filters, table
assets/js/app.js               tabs, forms, capture queue, import/export
vendor/tesseract/              the recognition engine, committed so it works offline
docs/ticket-form.html          printable blank ticket
test/parser.test.js            tests for the photo parser
```

## Tests

```sh
node test/parser.test.js
```

29 assertions over ten realistic tickets: clean printed forms, phone-photo noise where `O`
becomes `0` and `l` becomes `1`, unlabelled scrawl, missing fields, a year that must not be
mistaken for an answer code, and an id that disagrees with the system number written beside it.

## Browser support

Any current browser. Text recognition needs WebAssembly; a SIMD and a non-SIMD build are both
committed, so older browsers still work, just more slowly. The first photo of a session takes
a few seconds to warm the engine up, and subsequent ones are quick.
