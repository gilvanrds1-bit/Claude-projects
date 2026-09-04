# Claude projects

Projects built with Claude Code.

## [service-desk](service-desk/)

**Service desk ticket logging & intelligence.** Logs tickets against 22 systems and
10 business units, and shows which systems generate the most tickets and which parts of
the business absorb them.

- Every ticket carries system number, system name, system id, impacted business units and a four digit answer code
- Dashboard of clickable charts: by system, by business unit, by answer code, priority mix, daily trend, and a system-against-business-unit heat matrix
- **Photograph a ticket and the fields are read off the picture** and added to the dashboard — recognition runs in the browser, so no photo ever leaves the device
- Systems, business units and answer codes are all editable in the app

**Live:** https://gilvanrds1-bit.github.io/Claude-projects/service-desk/

See [the project README](service-desk/README.md).

## [wtw-simulator](wtw-simulator/)

**Water Treatment Works Capacity Simulator.** Models UK drinking water
treatment works and shows how taking assets out of service affects production
capacity in megalitres per day.

- Operator screen with in/out toggles and fast outage logging
- Regional overview totalling every site, plus lost production reporting
- Setup screen for configuring sites, treatment stages and assets
- Configurable capacity rules — no plant behaviour is hardcoded

**Live:** https://gilvanrds1-bit.github.io/Claude-projects/wtw-simulator/

Zero install — no server, no build step, no dependencies. Runs equally well from
the link above or by opening `wtw-simulator/index.html` directly. See
[the project README](wtw-simulator/README.md).
