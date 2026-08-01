# Verification report

## Conclusion

The simulator’s underlying celestial mechanics are sound for a design-led heliocentric visualisation. It is not a full numerical N-body ephemeris, but it reproduces realistic planetary configurations using JPL’s tighter modern fit around the present and its published long-range fit across 3000 BCE–3000 CE.

The model blends the two independently fitted JPL solutions smoothly, preserving the tighter present-day result without a discontinuous handover.

## 1. Source-data transcription

All 96 numerical coefficients in JPL Table 1 were checked: six base elements and six secular rates for each of eight planets/planetary systems. They match the published values used by NASA/JPL Solar System Dynamics.

The “Earth” row is correctly understood as the Earth–Moon barycentre (EMB), not Earth’s geocentre.

## 2. Equation audit

The code follows the JPL procedure in the correct order:

- `T = (JDE − 2451545.0) / 36525`;
- each element is evaluated as base value plus secular rate times `T`;
- `ω = ϖ − Ω`;
- `M = L − ϖ` for the 1800–2050 table;
- Kepler’s equation `M = E − e sin(E)` is solved by Newton iteration;
- orbital-plane coordinates are
  - `x′ = a(cos E − e)`;
  - `y′ = a sqrt(1 − e²) sin E`;
- the rotation into J2000 ecliptic Cartesian coordinates matches JPL’s matrix term by term.

### Numerical invariants

Across the built-in epochs and all eight planets:

- Kepler residuals are below `1 × 10⁻¹¹ rad`;
- the 3-D rotation preserves orbital radius to floating-point precision;
- every calculated radius remains between perihelion and aphelion;
- every sampled orbit closes to approximately `10⁻¹⁵ AU`;
- all planets move prograde in heliocentric longitude;
- no angle-wrap discontinuity appears at 0°/360°.

## 3. Time-scale audit

JPL specifies a Julian ephemeris date, effectively JDTDB. Raw JavaScript timestamps are UTC.

The verified implementation computes an approximate ephemeris date as follows:

- 1972–2026: embedded leap-second history, using `TT − UTC = TAI − UTC + 32.184 s`;
- before 1972 and after the verified leap-second interval: NASA/Espenak–Meeus ΔT polynomials, with the civil timestamp treated as a UT1 proxy;
- TT is used as a proxy for TDB; the periodic TT/TDB difference is about 1.7 ms in amplitude and is negligible relative to this model’s intrinsic positional errors.

For 1 August 2026 the code uses `TT − UTC = 69.184 s`.

## 4. Fit-boundary audit

The hybrid build blends Cartesian vectors with a quintic smootherstep over 1800–1810 and 2040–2050.

## 5. Independent ephemeris comparison

The implementation was compared with Swiss Ephemeris’ built-in Moshier planetary theory using:

- heliocentric origin;
- true geometric positions, without light-time;
- J2000 reference frame;
- ecliptic Cartesian coordinates;
- identical TT epochs.

Moshier is a semi-analytical approximation to JPL DE404 and is independent of the simulator’s simple secular-element implementation.

### 1 August 2026, 12:00 UTC

| Object | Angular separation | Radial difference |
|---|---:|---:|
| Mercury | 9.6 arcsec | 701 km |
| Venus | 7.8 arcsec | 910 km |
| Earth/EMB* | 2.5 arcsec | 10,778 km |
| Mars | 46.0 arcsec | 15,136 km |
| Jupiter | 60.5 arcsec | 370,662 km |
| Saturn | 266.2 arcsec | 57,534 km |
| Uranus | 3.8 arcsec | 861,334 km |
| Neptune | 32.7 arcsec | 156,566 km |

`*` The reference uses Earth’s centre while the JPL approximate table uses the Earth–Moon barycentre, so the Earth radial difference includes that intentional convention mismatch.

The largest current angular discrepancy is Saturn at 266 arcseconds, or 4.44 arcminutes. In an 800-pixel-high default overview, that corresponds to substantially less than one screen pixel tangentially.

### Nine-epoch sweep, 1800–2050

The audit sampled 1800, 1850, 1900, 1950, 2000, 2018, 2026, 2035 and 2050.

| Object | Maximum angular separation | Epoch | Angular RMS | Maximum radial difference |
|---|---:|---:|---:|---:|
| Mercury | 11.7 arcsec | 1950 | 7.2 arcsec | 1,217 km |
| Venus | 18.4 arcsec | 1850 | 11.6 arcsec | 3,876 km |
| Earth/EMB | 14.6 arcsec | 2035 | 6.5 arcsec | 10,778 km |
| Mars | 58.7 arcsec | 2050 | 29.5 arcsec | 19,123 km |
| Jupiter | 309.3 arcsec | 2000 | 182.6 arcsec | 548,824 km |
| Saturn | 610.0 arcsec | 1850 | 405.4 arcsec | 2,606,585 km |
| Uranus | 81.4 arcsec | 2018 | 53.2 arcsec | 1,339,390 km |
| Neptune | 55.7 arcsec | 2018 | 33.1 arcsec | 909,758 km |

These differences are consistent with the intended class of approximation: tens of arcseconds for terrestrial planets and potentially several arcminutes for Jupiter and Saturn. JPL describes its published error values as nominal rather than strict upper bounds.

## 6. Velocity audit

The UI speed is obtained from the vis-viva equation:

`v = sqrt(μ☉ (2/r − 1/a))`.

It is therefore the two-body speed of the fitted instantaneous ellipse. It is not a velocity from a full N-body integration.

A central finite difference of the actual displayed Cartesian trajectory was compared with the vis-viva result. Relative discrepancies at the 2026 test epoch were:

- inner planets: 2–23 parts per million;
- Jupiter through Neptune: 112–637 parts per million;
- all planets: below 0.1%.

The label **Kepler speed** is used to avoid overstating what is being shown.

## 7. Projection and display audit

- The simulation frame is the mean ecliptic and equinox of J2000.
- The viewer looks from the north ecliptic pole.
- Canvas Y is inverted only at the final screen transform, so physical +Y remains upward and prograde motion appears counter-clockwise.
- True-distance mode is linear in AU.
- Compressed mode applies a scalar radial transform to the full 3-D heliocentric radius, preserving each vector’s angular direction exactly.
- Planet marker sizes are symbolic.
- The 180-day orbit-path cache can lag the slowly varying secular elements by only a few arcseconds; this is sub-pixel even at the maximum normal zoom. Planet positions themselves are recalculated every animation frame and are not taken from the cached path.

## 8. Built-in regression suite

Open `index.html?debug=1` and inspect the console.

The packaged hybrid build runs 168 checks and currently reports:

```text
All 168 checks passed.
```

The suite includes frozen independent vectors for 2000, 2026 and 2035, plus equation residuals, radius bounds, motion direction, speed consistency, orbit closure and time-scale checks.

## 9. Remaining limitations

The simulator should not be described as a precision ephemeris or used for navigation, occultation timing, spacecraft operations or telescope pointing that requires arcsecond-level guarantees.

It omits:

- a full N-body numerical integration;
- short-period perturbation terms beyond those absorbed into JPL’s fitted elements;
- Earth-centre correction from the EMB;
- light-time, aberration and apparent-position effects;
- relativistic state-vector corrections;
- lunar and planetary satellite motion;
- predictive future leap-second knowledge.

For a visual Solar System simulator, these omissions do not make the displayed configuration misleading. For scientific-grade coordinates, use JPL Horizons or a modern DE ephemeris directly.


---

## Hybrid long-range implementation update

The simulator implements the JPL Table 1 calculation around the present and JPL Tables 2a/2b for long-range exploration. The Table 2b correction

`b T² + c cos(f T) + s sin(f T)`

is applied to the mean anomaly of Jupiter, Saturn, Uranus and Neptune with the published degree-based units.

### Blend mechanics

The short- and long-range solutions are independently evaluated in heliocentric J2000 ecliptic Cartesian coordinates. During 1800–1810 and 2040–2050, the displayed vector is

`r = (1 − w) r_long + w r_short`

(or the reverse at the later transition), where `w = 6u⁵ − 15u⁴ + 10u³`. This makes position, apparent velocity and apparent acceleration continuous at the transition endpoints. The selected-planet velocity readout is numerically differentiated from the blended trajectory during these windows rather than incorrectly applying vis-viva to a non-Keplerian interpolation.

### Extended time conversion

The Delta-T implementation includes the full Espenak–Meeus/NASA piecewise polynomial family needed across 3000 BCE–3000 CE. Known leap seconds are used around the modern epoch, preserving the 69.184-second TT−UTC offset in 2026.

### Regression results

The built-in `?debug=1` suite performs **152 checks**. All pass. Added checks cover:

- model selection in the long, short and blended regimes;
- finite coordinates at 3000 BCE and 3000 CE;
- two-second continuity tests at 1800, 1810, 2040 and 2050 for every planet;
- the original independent modern-epoch reference vectors and mechanics tests.

Independent Swiss Ephemeris/Moshier comparisons were also sampled at years −2500, −1000, 1, 1000, 2500 and 2999. Differences remain in the expected arcsecond-to-arcminute and published radial-error class of JPL’s approximate long-range formulation.
