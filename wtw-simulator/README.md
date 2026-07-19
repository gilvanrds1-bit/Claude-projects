# Works Capacity Simulator

Shows what happens to a drinking water treatment works' output, in Ml/d, when
assets are taken out of service.

## Opening it

Double-click **`index.html`**. That is all — there is nothing to install, no
server to start and no login. It works offline.

To use it on a tablet, copy the whole `wtw-simulator` folder onto the tablet and
open `index.html` from there.

Everything you enter is saved in that browser on that device, so it survives
closing the tab or the tablet sleeping. Nothing is sent anywhere.

## The three screens

Across the top: **Region**, **This works**, **Setup**.

- **Region** — every site added up into one regional figure, plus what outages
  have cost. For a regional manager.
- **This works** — one site, with the in/out toggles. For the operator on shift.
- **Setup** — building and editing the plant model. For an administrator.

## Using it as an operator

| To do this | Do this |
| --- | --- |
| Take an asset out | Tap its green **In service** button, pick a reason, tap **Take out of service** |
| Put it back | Tap its red **Out of service** button |
| See why capacity is what it is | **Capacity breakdown** tab — the red stage is the one holding the works back |
| See past outages | **Outage history** tab |
| Get the history into Excel | **Outage history** tab → **Export all works to CSV** |
| Switch site | The works name at the top left is a dropdown |
| Start again | **Outage history** tab → **Reset to sample data** |

Before you confirm an outage the dialog shows what it will do — e.g.
`100 → 80 Ml/d` — so you can check the impact before committing to it.

## Using the Region screen

The gauge shows what the region can produce right now against what it could
produce with everything in service. Below it, every works is listed worst
affected first, with its bar scaled to its size — so a 100 Ml/d works looks
bigger than a 15 Ml/d one. Tap any works to jump straight into it.

**Production lost** is the historical part. The headline figure is lost volume
in megalitres:

```
lost volume (Ml) = capacity lost (Ml/d)  x  how long it was out (days)
```

A 20 Ml/d outage lasting half a day cost 10 Ml. This is more useful than
counting outages, because it weighs a long outage on a big works above a brief
one on a small one. Outages still ongoing are counted up to right now.

The planned/unplanned split is the number to watch: a high unplanned share
points at reliability problems rather than maintenance planning.

Pick a period with the buttons, then **Export regional summary to CSV** for the
current position and the roll-up in one file.

## Using Setup (the administrator screen)

Everything that used to mean editing `js/data.js` by hand can now be done on
screen.

| To do this | Do this |
| --- | --- |
| Add a site | **Add a works**, then add its stages and assets |
| Rename a site or change its baseline | Edit the fields under **Editing…**, then **Save works details** |
| Switch which site you are editing | **Edit** on any row, or the dropdown at the top |
| Add a treatment stage | **Add a stage** — list them in the order water flows |
| Reorder stages | The ↑ and ↓ buttons |
| Add or change an asset | **Add an asset**, or **Edit** on any asset row |
| Copy the setup to another tablet | **Save setup to a file**, then **Load setup from a file** on the other device |

**Checks** lists problems with the current setup — an asset left out of every
stage, a stage with nothing in it, an asset set to limit the works with no limit
entered, or a baseline the plant cannot actually reach. Worth glancing at after
any change.

Deleting a works keeps its past outage records, so regional reporting still
reflects what actually happened.

There is no password on Setup. Anyone holding the tablet can reach it.

## How capacity is worked out

Water passes through the works in stages, and can only get through as fast as
the tightest stage allows:

```
Works capacity = the capacity of the tightest stage,
                 and never more than the works' baseline capacity
```

A stage's capacity is the total of the assets in it that are in service. So the
filter stage with 5 filters at 20 Ml/d each is 100 Ml/d, and drops to 80 Ml/d
with one filter out.

**Standby cover needs no special setting.** If a stage has two pumps rated
100 Ml/d each, the stage totals 200 Ml/d. Take one out and it is still 100 Ml/d,
which is enough, so capacity does not move.

Each asset also carries an **outage rule** saying what its loss does:

| Rule | What it does | Typical use |
| --- | --- | --- |
| `share_of_stage` | Its capacity comes off its stage | Filters, clarifiers, pumps, GAC vessels |
| `limit_works` | Holds the whole works at `limit_ML_per_day` | UV out → run at 96 Ml/d |
| `stop_works` | Production stops completely | Chlorine or coagulant dosing |

When several assets are out at once all the rules apply together: the stage
totals are worked out, then any ceilings are applied, then if any critical asset
is out the works reads zero.

## Changing it for your own works

Day to day, use the **Setup** screen — you should not need to touch the code.

The files still matter for two things:

**`js/rules.js`** — the capacity maths itself, in one commented function called
`calculateCapacity()`. Edit this if the *logic* needs to change rather than the
plant. Adding a brand new kind of outage rule is a two-step job and both steps
are marked with comments.

**`js/report.js`** — the regional maths, in `calculateRegion()` and
`summariseHistory()`. Edit this to change how sites are added up or how lost
production is measured.

`js/data.js` is now only the *starting* sample data, used the first time the app
runs and whenever **Reset to sample data** is pressed. The quick-pick outage
reasons and the asset type suggestions live at the bottom of it.

## Files

```
index.html      the three screens
styles.css      appearance; sized for tablet touch targets
js/rules.js     THE CAPACITY MATHS — start here
js/report.js    THE REGIONAL MATHS — totals and lost production
js/data.js      the starting sample data, reasons and asset types
js/store.js     saving, loading, outage records, admin edits, CSV export
js/admin.js     the Setup screen
js/ui.js        the Region and operator screens, and handling taps
```

## Sample data

Five works, 240 Ml/d regional baseline.

**Example WTW**, 100 Ml/d baseline, 17 assets — this is the worked example:

- 1 duty + 1 standby raw water pump (100 Ml/d each)
- Coagulant dosing plant — critical, stops production
- 2 clarifiers at 50 Ml/d
- 5 rapid gravity filters at 20 Ml/d — **one out drops the works to 80 Ml/d**
- 3 GAC vessels at 50 Ml/d, so one is effectively spare
- UV disinfection — **out drops the works to 96 Ml/d**
- Chlorine dosing plant — critical, stops production
- 1 duty + 1 standby final water pump

Plus four more sites so the regional view has something to add up:

- **Moorland WTW**, 60 Ml/d — upland surface water, 4 slow sand filters, and a
  UV unit that holds the works at 45 Ml/d when it is out
- **Riverside WTW**, 40 Ml/d — membrane plant, 4 racks
- **Estuary WTW**, 25 Ml/d — membrane plant on a tidal river
- **Hilltop WTW**, 15 Ml/d — small borehole works, no clarification

## Checked behaviour

These combinations were run against the engine and all give the expected answer:

| Out of service | Capacity |
| --- | --- |
| Nothing | 100 Ml/d |
| 1 RGF | 80 Ml/d |
| 2 RGFs | 60 Ml/d |
| All 5 RGFs | 0 Ml/d |
| UV unit | 96 Ml/d |
| UV + 1 RGF | 80 Ml/d (the filter stage is tighter than the UV ceiling) |
| Chlorine dosing | 0 Ml/d |
| 1 standby raw pump | 100 Ml/d (no impact) |
| Both raw pumps | 0 Ml/d |
| 1 GAC vessel | 100 Ml/d (spare covers it) |
| 2 GAC vessels | 50 Ml/d |
| 1 clarifier | 50 Ml/d |

## Known limits of this prototype

- **Data lives in one browser on one device.** Two operators on two tablets will
  not see each other's entries, and the Region screen only adds up what is on
  *that* device. This is the big one — real regional reporting needs a shared
  backend, which would mean changing `js/store.js` only. **Save setup to a file**
  in Setup is the stopgap.
- There is no password on Setup, so anyone with the tablet can change the plant
  model.
- There is no edit or delete for a logged outage — the log is append-only, which
  suits audit but means a mistake has to be corrected by resetting.
- Lost volume assumes an outage's capacity impact stayed constant for its whole
  duration. If a second asset went out midway, the overlap is not modelled.
