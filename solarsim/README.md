# Solar System Simulator — hybrid verified build

A design-led, single-page heliocentric Solar System visualisation built with static HTML, CSS and JavaScript.

## Run it

Open `index.html` directly in a modern browser. No server, build process, API key or network connection is required.

For consistent local-file behaviour, the folder can also be served with:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Astronomical model

The simulator implements JPL Solar System Dynamics’ **Approximate Positions of the Planets** method:

1. evaluate six Keplerian elements and their secular rates at the requested ephemeris epoch;
2. add JPL’s required long-period anomaly terms for the outer planets in the long-range model;
3. solve Kepler’s equation by Newton iteration;
4. compute coordinates in the orbital plane;
5. rotate them into heliocentric J2000 ecliptic Cartesian coordinates;
6. derive longitude, latitude, distance and velocity.

The implementation uses both JPL parameter sets:

- **Table 1:** tighter 1800–2050 solution, used at full weight from 1810 through 2040.
- **Tables 2a/2b:** long-range solution valid from 3000 BCE through 3000 CE, including the periodic mean-anomaly terms for Jupiter, Saturn, Uranus and Neptune.
- **Smooth handover:** Cartesian vectors are blended over 1800–1810 and 2040–2050 with a quintic smootherstep. This removes position, apparent-velocity and apparent-acceleration discontinuities.

Earth is represented by JPL’s Earth–Moon barycentre rather than Earth’s geocentre.

## Time scale

JPL’s equations expect an ephemeris date, approximately JDTDB, rather than raw UTC.

- From 1972 through the end of 2026, the simulator uses the embedded leap-second history and computes `TT − UTC = (TAI − UTC) + 32.184 s`.
- Outside that interval, it uses the full Espenak–Meeus/NASA Delta-T polynomial family across the supported date range, treating the civil timestamp as a UT1 proxy.
- TT is used as a practical proxy for TDB. The omitted periodic TDB−TT term is negligible relative to the intrinsic error of this approximate ephemeris.

The date dialog uses the browser’s native calendar picker plus a separate **BCE/CE** selector. For example, choose `0500-08-01` in the calendar and select `BCE` for 1 August 500 BCE.

Historical dates use astronomical year numbering internally and a proleptic Gregorian civil calendar.

The main simulated-time display shows one selected civil time zone. The calendar dialog provides a dropdown for UTC, London, New York, Los Angeles, Dubai, Delhi, Tokyo and Sydney. IANA daylight-saving rules are used from 1900–2100, so London correctly displays **BST** when applicable; outside that interval the interface uses fixed standard offsets because ancient and far-future civil-time rules are undefined.

## Accuracy and interpretation

The supported interval is **3000 BCE–3000 CE**.

JPL publishes substantially smaller nominal errors for the 1800–2050 fit than for the complete long-range fit. The simulator therefore changes its small model-status label according to the active regime.

The result is appropriate for:

- realistic Solar System configurations;
- conjunction and alignment cycles;
- accelerated trajectory exploration;
- educational and design-led visualisation.

It is not intended for spacecraft navigation, occultation prediction or precision telescope pointing.

## High-speed rendering

The simulation timestamp is absolute. Planet positions are recalculated from the ephemeris for every displayed frame; orbital angles are never integrated incrementally.

Speeds range from real time to **100 years per second**. At very high speeds, enable the existing **Trails** control. The renderer adaptively samples the interval skipped between consecutive display frames and draws those samples using the original trail treatment. The default display remains unchanged while Trails is off.

## Validation

Open:

```text
index.html?debug=1
```

and inspect the browser console.

The packaged build performs **168 checks**, including:

- independent Swiss Ephemeris/Moshier vectors at modern and long-range epochs;
- all eight planets at years −1000 and 2500;
- Kepler-equation residuals;
- perihelion/aphelion radial bounds;
- finite Cartesian coordinates at 3000 BCE and 3000 CE;
- prograde motion and orbit closure;
- numerical-derivative versus displayed-speed consistency;
- model selection in long, blended and short regimes;
- continuity at 1800, 1810, 2040 and 2050;
- the 2026 `TT − UTC = 69.184 s` check.

All 168 checks pass in the packaged build. See `VERIFICATION.md` for the detailed audit and limitations.

## Display scales

- **True distance:** linear astronomical-unit radius.
- **Compressed:** `R = Rmax × log(1 + 2r) / log(1 + 2Rmax)`.

Compressed mode preserves angular direction while compressing radial distance. Planet marker sizes are symbolic.

## Controls

- Drag to pan.
- Wheel/trackpad or pinch to zoom.
- Double-click to reset.
- Select a planet for measurements and focus mode.
- Space: play/pause.
- Left/right arrows: reverse/forward.
- N: now.
- R: reset view.
- L: labels.
- O: orbits.

## Inspection API

```js
SolarSystemSimulator.getPosition('mars', new Date('2026-08-01T12:00:00Z'));
SolarSystemSimulator.getModelMode(new Date('2500-01-01T00:00:00Z'));
SolarSystemSimulator.julianEphemerisDate(new Date('2026-08-01T12:00:00Z'));
SolarSystemSimulator.ttMinusUtcSeconds(new Date('2026-08-01T12:00:00Z'));
SolarSystemSimulator.runDiagnostics();
```

## Files

- `index.html` — semantic UI and dialogs.
- `style.css` — visual system and responsive layout.
- `script.js` — hybrid ephemeris, time conversion, renderer, interaction and validation.
- `VERIFICATION.md` — detailed numerical audit.
