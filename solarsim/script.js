(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Astronomical model
  // ---------------------------------------------------------------------------
  // JPL Solar System Dynamics, "Approximate Positions of the Planets".
  // Each element is value at J2000.0 plus a secular rate per Julian century.
  // The simulator uses JPL Table 1 around the modern era (the tighter
  // 1800–2050 fit) and Table 2 elsewhere (valid 3000 BCE–3000 CE). The two
  // independently fitted solutions are blended in heliocentric Cartesian space
  // over 1800–1810 and 2040–2050 using a quintic smootherstep. This preserves
  // today's maximum accuracy while eliminating visible position, velocity, and
  // acceleration discontinuities at model handovers. Civil input is converted
  // toward ephemeris time; TT is used as a practical proxy for TDB.

  const AU_KM = 149_597_870.7;
  const MU_SUN = 1.32712440018e11; // km^3 s^-2
  const DAY_MS = 86_400_000;
  const MINUTE_MS = 60_000;
  const DEG = Math.PI / 180;
  const TWO_PI = Math.PI * 2;
  const J2000_JD = 2451545.0;
  const MODEL_MIN_ASTRONOMICAL_YEAR = -2999; // 3000 BCE (astronomical year numbering)
  const MODEL_MAX_ASTRONOMICAL_YEAR = 3000;

  function makeUtcTimestamp(year, month = 0, day = 1, hour = 0, minute = 0, second = 0) {
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    date.setUTCHours(hour, minute, second, 0);
    return date.getTime();
  }

  const MODEL_MIN_TIMESTAMP = makeUtcTimestamp(MODEL_MIN_ASTRONOMICAL_YEAR, 0, 1);
  const MODEL_MAX_TIMESTAMP = makeUtcTimestamp(MODEL_MAX_ASTRONOMICAL_YEAR, 11, 31, 23, 59, 59);
  const BLEND_EARLY_START = makeUtcTimestamp(1800, 0, 1);
  const BLEND_EARLY_END = makeUtcTimestamp(1810, 0, 1);
  const BLEND_LATE_START = makeUtcTimestamp(2040, 0, 1);
  const BLEND_LATE_END = makeUtcTimestamp(2050, 0, 1);

  const PLANETS = [
    { id: 'mercury', name: 'Mercury', color: '#aaa69e', size: 3.2 },
    { id: 'venus', name: 'Venus', color: '#d6c49b', size: 3.9 },
    { id: 'earth', name: 'Earth', color: '#73aeb1', size: 4.1 },
    { id: 'mars', name: 'Mars', color: '#b9654f', size: 3.6 },
    { id: 'jupiter', name: 'Jupiter', color: '#b99a70', size: 5.6 },
    { id: 'saturn', name: 'Saturn', color: '#c9b98d', size: 5.0 },
    { id: 'uranus', name: 'Uranus', color: '#78afb5', size: 4.4 },
    { id: 'neptune', name: 'Neptune', color: '#557aa8', size: 4.4 },
  ];

  // Values are [a, e, I, L, longPeri, longNode], then rates in same order.
  const ELEMENTS_1800_2050 = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  };


  // JPL Table 2a, valid 3000 BCE–3000 CE. Values and units match Table 1.
  const ELEMENTS_3000BC_3000AD = {
    mercury: [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819], [0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
    venus:   [[0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496], [-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174]],
    earth:   [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389], [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856]],
    mars:    [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984], [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
    jupiter: [[5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654], [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619]],
    saturn:  [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702], [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002]],
    uranus:  [[19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215], [-0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699]],
    neptune: [[30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853], [0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302]],
  };

  // JPL Table 2b. b is degrees/Cy²; c and s are degrees; f is degrees/Cy.
  const LONG_RANGE_ANOMALY_TERMS = {
    jupiter: [-0.00012452, 0.06064060, -0.35635438, 38.35125000],
    saturn:  [0.00025899, -0.13434469, 0.87320147, 38.35125000],
    uranus:  [0.00058331, -0.97731848, 0.17689245, 7.67025000],
    neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025000],
  };


  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smootherstep(t) {
    const u = clamp(t, 0, 1);
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  function normalizeRadians(angle) { return ((angle % TWO_PI) + TWO_PI) % TWO_PI; }
  function signedDegrees(angleRad) {
    let value = ((angleRad / DEG + 180) % 360 + 360) % 360 - 180;
    if (Object.is(value, -0)) value = 0;
    return value;
  }

  function julianDateFromTimestamp(timestamp) {
    return timestamp / DAY_MS + 2440587.5;
  }

  // UTC did not exist in its modern form before 1972. For pre-1972 dates the
  // date-picker value is treated as a UT1-like civil time and converted with
  // Delta T = TT - UT1. For dates with a known leap-second history, TT - UTC
  // is exact to the precision needed here: (TAI - UTC) + 32.184 seconds.
  const LEAP_SECONDS = [
    [Date.UTC(1972, 0, 1), 10], [Date.UTC(1972, 6, 1), 11],
    [Date.UTC(1973, 0, 1), 12], [Date.UTC(1974, 0, 1), 13],
    [Date.UTC(1975, 0, 1), 14], [Date.UTC(1976, 0, 1), 15],
    [Date.UTC(1977, 0, 1), 16], [Date.UTC(1978, 0, 1), 17],
    [Date.UTC(1979, 0, 1), 18], [Date.UTC(1980, 0, 1), 19],
    [Date.UTC(1981, 6, 1), 20], [Date.UTC(1982, 6, 1), 21],
    [Date.UTC(1983, 6, 1), 22], [Date.UTC(1985, 6, 1), 23],
    [Date.UTC(1988, 0, 1), 24], [Date.UTC(1990, 0, 1), 25],
    [Date.UTC(1991, 0, 1), 26], [Date.UTC(1992, 6, 1), 27],
    [Date.UTC(1993, 6, 1), 28], [Date.UTC(1994, 6, 1), 29],
    [Date.UTC(1996, 0, 1), 30], [Date.UTC(1997, 6, 1), 31],
    [Date.UTC(1999, 0, 1), 32], [Date.UTC(2006, 0, 1), 33],
    [Date.UTC(2009, 0, 1), 34], [Date.UTC(2012, 6, 1), 35],
    [Date.UTC(2015, 6, 1), 36], [Date.UTC(2017, 0, 1), 37],
  ];
  const LEAP_SECONDS_VERIFIED_THROUGH = Date.UTC(2026, 11, 31, 23, 59, 59);

  function decimalYearUtc(timestamp) {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const start = makeUtcTimestamp(year, 0, 1);
    const end = makeUtcTimestamp(year + 1, 0, 1);
    return year + (timestamp - start) / (end - start);
  }

  // Espenak & Meeus / NASA polynomial approximations for Delta T. The
  // piecewise form covers the complete long-range ephemeris interval. Result is
  // seconds; ancient and far-future values are necessarily approximate.
  function deltaTSeconds(timestamp) {
    const y = decimalYearUtc(timestamp);
    let t;
    let u;
    if (y < -500) {
      u = (y - 1820) / 100;
      return -20 + 32 * u ** 2;
    }
    if (y < 500) {
      u = y / 100;
      return 10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3
        - 0.1798452 * u ** 4 + 0.022174192 * u ** 5 + 0.0090316521 * u ** 6;
    }
    if (y < 1600) {
      u = (y - 1000) / 100;
      return 1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3
        - 0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6;
    }
    if (y < 1700) {
      t = y - 1600;
      return 120 - 0.9808 * t - 0.01532 * t ** 2 + t ** 3 / 7129;
    }
    if (y < 1800) {
      t = y - 1700;
      return 8.83 + 0.1603 * t - 0.0059285 * t ** 2 + 0.00013336 * t ** 3 - t ** 4 / 1174000;
    }
    if (y < 1860) {
      t = y - 1800;
      return 13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3
        - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5
        - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7;
    }
    if (y < 1900) {
      t = y - 1860;
      return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3
        - 0.0004473624 * t ** 4 + t ** 5 / 233174;
    }
    if (y < 1920) {
      t = y - 1900;
      return -2.79 + 1.494119 * t - 0.0598939 * t ** 2
        + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
    }
    if (y < 1941) {
      t = y - 1920;
      return 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3;
    }
    if (y < 1961) {
      t = y - 1950;
      return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
    }
    if (y < 1986) {
      t = y - 1975;
      return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
    }
    if (y < 2005) {
      t = y - 2000;
      return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
        + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
    }
    if (y < 2050) {
      t = y - 2000;
      return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
    }
    if (y < 2150) {
      return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
    }
    u = (y - 1820) / 100;
    return -20 + 32 * u ** 2;
  }

  function ttMinusUtcSeconds(timestamp) {
    if (timestamp >= LEAP_SECONDS[0][0] && timestamp <= LEAP_SECONDS_VERIFIED_THROUGH) {
      let taiMinusUtc = LEAP_SECONDS[0][1];
      for (const [effectiveTimestamp, offset] of LEAP_SECONDS) {
        if (timestamp < effectiveTimestamp) break;
        taiMinusUtc = offset;
      }
      return taiMinusUtc + 32.184;
    }
    // Outside the known leap-second interval, UTC is treated as a UT1 proxy.
    return deltaTSeconds(timestamp);
  }

  function julianEphemerisDateFromTimestamp(timestamp) {
    return julianDateFromTimestamp(timestamp) + ttMinusUtcSeconds(timestamp) / 86400;
  }

  function getElements(planetId, jd, model = 'short') {
    const source = model === 'long' ? ELEMENTS_3000BC_3000AD : ELEMENTS_1800_2050;
    const [base, rate] = source[planetId];
    const T = (jd - J2000_JD) / 36525;
    const values = base.map((value, index) => value + rate[index] * T);
    const [a, e, inclinationDeg, meanLongitudeDeg, longitudePeriDeg, longitudeNodeDeg] = values;
    let meanAnomalyDeg = meanLongitudeDeg - longitudePeriDeg;

    if (model === 'long' && LONG_RANGE_ANOMALY_TERMS[planetId]) {
      const [b, c, sineCoefficient, frequency] = LONG_RANGE_ANOMALY_TERMS[planetId];
      const phase = frequency * T * DEG;
      meanAnomalyDeg += b * T * T + c * Math.cos(phase) + sineCoefficient * Math.sin(phase);
    }

    return {
      a,
      e,
      inclination: inclinationDeg * DEG,
      meanLongitude: meanLongitudeDeg * DEG,
      longitudePeri: longitudePeriDeg * DEG,
      longitudeNode: longitudeNodeDeg * DEG,
      argumentPeri: (longitudePeriDeg - longitudeNodeDeg) * DEG,
      meanAnomaly: normalizeRadians(meanAnomalyDeg * DEG),
      model: model === 'long' ? 'jpl-3000bc-3000ad' : 'jpl-1800-2050',
    };
  }

  function solveKeplersEquation(meanAnomaly, eccentricity) {
    let E = meanAnomaly + eccentricity * Math.sin(meanAnomaly);
    for (let iteration = 0; iteration < 15; iteration += 1) {
      const delta = (meanAnomaly - (E - eccentricity * Math.sin(E))) / (1 - eccentricity * Math.cos(E));
      E += delta;
      if (Math.abs(delta) < 1e-12) return E;
    }
    return E;
  }

  function orbitalPlaneToEcliptic(xPrime, yPrime, elements) {
    const { argumentPeri: w, longitudeNode: O, inclination: I } = elements;
    const cw = Math.cos(w), sw = Math.sin(w);
    const cO = Math.cos(O), sO = Math.sin(O);
    const cI = Math.cos(I), sI = Math.sin(I);

    return {
      x: (cw * cO - sw * sO * cI) * xPrime + (-sw * cO - cw * sO * cI) * yPrime,
      y: (cw * sO + sw * cO * cI) * xPrime + (-sw * sO + cw * cO * cI) * yPrime,
      z: (sw * sI) * xPrime + (cw * sI) * yPrime,
    };
  }

  function positionFromElements(elements) {
    const E = solveKeplersEquation(elements.meanAnomaly, elements.e);
    const xPrime = elements.a * (Math.cos(E) - elements.e);
    const yPrime = elements.a * Math.sqrt(1 - elements.e * elements.e) * Math.sin(E);
    return orbitalPlaneToEcliptic(xPrime, yPrime, elements);
  }

  function modelPosition(planetId, timestamp, model) {
    const jd = julianEphemerisDateFromTimestamp(timestamp);
    const elements = getElements(planetId, jd, model);
    return { vector: positionFromElements(elements), elements };
  }

  function hybridModelWeights(timestamp) {
    if (timestamp < BLEND_EARLY_START) return { short: 0, mode: 'long' };
    if (timestamp < BLEND_EARLY_END) {
      const short = smootherstep((timestamp - BLEND_EARLY_START) / (BLEND_EARLY_END - BLEND_EARLY_START));
      return { short, mode: 'blend' };
    }
    if (timestamp < BLEND_LATE_START) return { short: 1, mode: 'short' };
    if (timestamp < BLEND_LATE_END) {
      const long = smootherstep((timestamp - BLEND_LATE_START) / (BLEND_LATE_END - BLEND_LATE_START));
      return { short: 1 - long, mode: 'blend' };
    }
    return { short: 0, mode: 'long' };
  }

  function hybridVector(planetId, timestamp) {
    const weights = hybridModelWeights(timestamp);
    if (weights.mode === 'short') {
      const result = modelPosition(planetId, timestamp, 'short');
      return { ...result, mode: 'short', shortWeight: 1 };
    }
    if (weights.mode === 'long') {
      const result = modelPosition(planetId, timestamp, 'long');
      return { ...result, mode: 'long', shortWeight: 0 };
    }

    const shortResult = modelPosition(planetId, timestamp, 'short');
    const longResult = modelPosition(planetId, timestamp, 'long');
    const w = weights.short;
    return {
      vector: {
        x: lerp(longResult.vector.x, shortResult.vector.x, w),
        y: lerp(longResult.vector.y, shortResult.vector.y, w),
        z: lerp(longResult.vector.z, shortResult.vector.z, w),
      },
      elements: w >= 0.5 ? shortResult.elements : longResult.elements,
      shortElements: shortResult.elements,
      longElements: longResult.elements,
      mode: 'blend',
      shortWeight: w,
    };
  }

  function getHeliocentricPosition(planetId, timestamp) {
    const result = hybridVector(planetId, timestamp);
    const vector = result.vector;
    const distance = Math.hypot(vector.x, vector.y, vector.z);
    const longitude = normalizeRadians(Math.atan2(vector.y, vector.x));
    const latitude = Math.atan2(vector.z, Math.hypot(vector.x, vector.y));
    const semimajorAxis = result.mode === 'blend'
      ? lerp(result.longElements.a, result.shortElements.a, result.shortWeight)
      : result.elements.a;
    const periodDays = 365.2568983 * Math.pow(semimajorAxis, 1.5);

    let velocity;
    if (result.mode === 'blend') {
      // Different fitted ellipses are being blended, so vis-viva is not exactly
      // applicable to the displayed trajectory. Differentiate that trajectory.
      const h = 0.02 * DAY_MS;
      const minus = hybridVector(planetId, timestamp - h).vector;
      const plus = hybridVector(planetId, timestamp + h).vector;
      velocity = Math.hypot(plus.x - minus.x, plus.y - minus.y, plus.z - minus.z) * AU_KM / (2 * h / 1000);
    } else {
      velocity = Math.sqrt(MU_SUN * (2 / (distance * AU_KM) - 1 / (semimajorAxis * AU_KM)));
    }

    return {
      ...vector,
      distance,
      longitude,
      latitude,
      velocity,
      periodDays,
      elements: result.elements,
      modelMode: result.mode,
      shortWeight: result.shortWeight,
    };
  }

  function sampleOrbit(planetId, timestamp, segments = 240) {
    const weights = hybridModelWeights(timestamp);
    const jd = julianEphemerisDateFromTimestamp(timestamp);
    const shortElements = weights.short > 0 ? getElements(planetId, jd, 'short') : null;
    const longElements = weights.short < 1 ? getElements(planetId, jd, 'long') : null;
    const points = [];

    for (let index = 0; index <= segments; index += 1) {
      const E = (index / segments) * TWO_PI;
      const pointFor = (elements) => {
        const xPrime = elements.a * (Math.cos(E) - elements.e);
        const yPrime = elements.a * Math.sqrt(1 - elements.e * elements.e) * Math.sin(E);
        return orbitalPlaneToEcliptic(xPrime, yPrime, elements);
      };

      if (weights.mode === 'short') points.push(pointFor(shortElements));
      else if (weights.mode === 'long') points.push(pointFor(longElements));
      else {
        const longPoint = pointFor(longElements);
        const shortPoint = pointFor(shortElements);
        points.push({
          x: lerp(longPoint.x, shortPoint.x, weights.short),
          y: lerp(longPoint.y, shortPoint.y, weights.short),
          z: lerp(longPoint.z, shortPoint.z, weights.short),
        });
      }
    }
    return points;
  }

  // ---------------------------------------------------------------------------
  // State and DOM
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById('space');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = Object.fromEntries([
    'dateMain', 'dateButton', 'modelText', 'aboutButton', 'labelsToggle', 'orbitsToggle', 'trailsToggle',
    'scaleButton', 'resetViewButton', 'reverseButton', 'playButton', 'forwardButton',
    'speedSelect', 'nowButton', 'planetCard', 'closePlanetCard', 'planetSwatch', 'planetName',
    'planetDistance', 'earthDistance', 'planetVelocity', 'planetLongitude', 'planetLatitude',
    'planetPeriod', 'focusButton', 'clearFocusButton', 'dateDialog', 'dateForm', 'dateInput',
    'eraInput', 'timeInput', 'timeZoneInput', 'dialogNowButton', 'dateDialogClose', 'dateWarning', 'aboutDialog', 'toast'
  ].map((id) => [id, document.getElementById(id)]));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobileViewport = () => window.matchMedia('(max-width: 760px)').matches || window.innerWidth <= 760;
  const state = {
    timestamp: Date.now(),
    displayTimeZoneKey: 'utc',
    dialogTimeZoneKey: 'utc',
    paused: reducedMotion && !isMobileViewport(),
    direction: 1,
    speedDaysPerSecond: 30,
    scaleMode: 'compressed',
    labels: true,
    orbits: true,
    trails: true,
    selected: null,
    hovered: null,
    focus: null,
    positions: new Map(),
    screenPositions: new Map(),
    orbitCache: new Map(),
    orbitCacheTimestamp: 0,
    trailCache: new Map(),
    trailCacheTimestamp: 0,
    frameMotionPaths: new Map(),
    camera: { x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 },
    dpr: 1,
    width: 0,
    height: 0,
    lastFrame: performance.now(),
    lastUiUpdate: 0,
    stars: [],
    pointers: new Map(),
    dragging: false,
    pinch: null,
  };

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function buildStars() {
    const random = seededRandom(143221);
    const count = Math.round(clamp((state.width * state.height) / 11000, 55, 210));
    state.stars = Array.from({ length: count }, () => ({
      x: random(), y: random(), alpha: 0.08 + random() * 0.21, radius: 0.25 + random() * 0.7,
    }));
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    state.dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    buildStars();
  }

  function maxDisplayRadius() { return 31.2; }

  function compressRadius(radius) {
    const maxRadius = maxDisplayRadius();
    return maxRadius * Math.log1p(radius * 2.0) / Math.log1p(maxRadius * 2.0);
  }

  function displayPoint(vector) {
    if (state.scaleMode === 'true') return { x: vector.x, y: vector.y, z: vector.z };
    const radius = Math.hypot(vector.x, vector.y, vector.z);
    if (radius === 0) return { x: 0, y: 0, z: 0 };
    const transformed = compressRadius(radius);
    const factor = transformed / radius;
    return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
  }

  function basePixelsPerAU() {
    const minimum = Math.min(state.width, state.height);
    return (minimum * 0.405) / maxDisplayRadius();
  }

  function pixelsPerAU() { return basePixelsPerAU() * state.camera.zoom; }

  function worldToScreen(point) {
    const scale = pixelsPerAU();
    return {
      x: state.width / 2 + (point.x - state.camera.x) * scale,
      y: state.height / 2 - (point.y - state.camera.y) * scale,
    };
  }

  function screenToWorld(x, y) {
    const scale = pixelsPerAU();
    return {
      x: state.camera.x + (x - state.width / 2) / scale,
      y: state.camera.y - (y - state.height / 2) / scale,
    };
  }

  function resetView(animate = true) {
    state.focus = null;
    state.camera.targetX = 0;
    state.camera.targetY = 0;
    state.camera.targetZoom = 1;
    if (!animate || reducedMotion) {
      state.camera.x = 0;
      state.camera.y = 0;
      state.camera.zoom = 1;
    }
    updateFocusButtons();
  }

  function updatePositions() {
    state.positions.clear();
    for (const planet of PLANETS) {
      state.positions.set(planet.id, getHeliocentricPosition(planet.id, state.timestamp));
    }
  }

  function updateOrbitCache() {
    if (Math.abs(state.timestamp - state.orbitCacheTimestamp) < 180 * DAY_MS && state.orbitCache.size) return;
    state.orbitCache.clear();
    for (const planet of PLANETS) state.orbitCache.set(planet.id, sampleOrbit(planet.id, state.timestamp));
    state.orbitCacheTimestamp = state.timestamp;
  }

  function updateTrailCache(force = false) {
    if (!state.trails) return;
    if (!force && Math.abs(state.timestamp - state.trailCacheTimestamp) < 0.15 * DAY_MS && state.trailCache.size) return;
    state.trailCache.clear();
    for (const planet of PLANETS) {
      const current = state.positions.get(planet.id);
      const spanDays = clamp(current.periodDays * 0.13, 25, 1300);
      const points = [];
      for (let i = 34; i >= 0; i -= 1) {
        const t = state.timestamp - spanDays * DAY_MS * (i / 34);
        points.push(getHeliocentricPosition(planet.id, t));
      }
      state.trailCache.set(planet.id, points);
    }
    state.trailCacheTimestamp = state.timestamp;
  }

  // At very high time multipliers a planet can move through a substantial arc
  // between display frames. When the existing Trails option is enabled, sample
  // that skipped interval adaptively so the trajectory remains continuous. This
  // reuses the original trail visual treatment and does not alter the default
  // display graphics.
  function updateFrameMotionPaths(previousTimestamp) {
    state.frameMotionPaths.clear();
    if (!state.trails || previousTimestamp === state.timestamp) return;
    const deltaDays = Math.abs(state.timestamp - previousTimestamp) / DAY_MS;
    if (deltaDays < 0.02) return;

    for (const planet of PLANETS) {
      const current = state.positions.get(planet.id);
      const revolutions = deltaDays / current.periodDays;
      const samples = clamp(Math.ceil(revolutions * 96), 2, 180);
      if (samples <= 2 && deltaDays < current.periodDays / 180) continue;
      const points = [];
      for (let i = 0; i <= samples; i += 1) {
        const t = lerp(previousTimestamp, state.timestamp, i / samples);
        points.push(getHeliocentricPosition(planet.id, t));
      }
      state.frameMotionPaths.set(planet.id, points);
    }
  }

  function drawBackground() {
    ctx.fillStyle = '#080b10';
    ctx.fillRect(0, 0, state.width, state.height);

    const gradient = ctx.createRadialGradient(state.width * 0.5, state.height * 0.48, 0, state.width * 0.5, state.height * 0.48, Math.max(state.width, state.height) * 0.72);
    gradient.addColorStop(0, 'rgba(24, 31, 42, 0.28)');
    gradient.addColorStop(0.48, 'rgba(10, 14, 20, 0.12)');
    gradient.addColorStop(1, 'rgba(3, 5, 8, 0.38)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    for (const star of state.stars) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(211, 220, 232, ${star.alpha})`;
      ctx.arc(star.x * state.width, star.y * state.height, star.radius, 0, TWO_PI);
      ctx.fill();
    }
  }

  function drawReferenceAxis() {
    if (state.camera.zoom < 2.4) return;
    const origin = worldToScreen({ x: 0, y: 0 });
    const end = worldToScreen({ x: maxDisplayRadius(), y: 0 });
    ctx.save();
    ctx.strokeStyle = 'rgba(188, 199, 211, 0.035)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrbits() {
    if (!state.orbits) return;
    ctx.save();
    ctx.lineWidth = 0.75;
    for (const planet of PLANETS) {
      const selected = planet.id === state.selected || planet.id === state.hovered;
      const points = state.orbitCache.get(planet.id);
      ctx.beginPath();
      points.forEach((point, index) => {
        const screen = worldToScreen(displayPoint(point));
        if (index === 0) ctx.moveTo(screen.x, screen.y); else ctx.lineTo(screen.x, screen.y);
      });
      ctx.strokeStyle = selected ? hexToRgba(planet.color, 0.32) : 'rgba(195, 205, 217, 0.085)';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrails() {
    if (!state.trails) return;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (const planet of PLANETS) {
      const points = state.trailCache.get(planet.id);
      if (!points) continue;
      for (let index = 1; index < points.length; index += 1) {
        const a = worldToScreen(displayPoint(points[index - 1]));
        const b = worldToScreen(displayPoint(points[index]));
        const alpha = 0.015 + 0.13 * (index / points.length) ** 2;
        ctx.strokeStyle = hexToRgba(planet.color, alpha);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const motionPoints = state.frameMotionPaths.get(planet.id);
      if (motionPoints && motionPoints.length > 1) {
        for (let index = 1; index < motionPoints.length; index += 1) {
          const a = worldToScreen(displayPoint(motionPoints[index - 1]));
          const b = worldToScreen(displayPoint(motionPoints[index]));
          const alpha = 0.035 + 0.095 * (index / motionPoints.length);
          ctx.strokeStyle = hexToRgba(planet.color, alpha);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawSun() {
    const screen = worldToScreen({ x: 0, y: 0 });
    const halo = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, 25);
    halo.addColorStop(0, 'rgba(250, 224, 169, 0.36)');
    halo.addColorStop(0.23, 'rgba(238, 196, 122, 0.11)');
    halo.addColorStop(1, 'rgba(238, 196, 122, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 25, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = '#f0d39b';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 4.2, 0, TWO_PI);
    ctx.fill();
  }

  function drawSaturnRing(screen, size) {
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(-0.28);
    ctx.strokeStyle = 'rgba(215, 204, 169, 0.62)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 2.0, size * 0.72, 0, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanets() {
    state.screenPositions.clear();
    for (const planet of PLANETS) {
      const position = state.positions.get(planet.id);
      const screen = worldToScreen(displayPoint(position));
      state.screenPositions.set(planet.id, screen);
      const selected = planet.id === state.selected;
      const hovered = planet.id === state.hovered;
      const size = planet.size + (selected ? 1.8 : hovered ? 0.9 : 0);

      if (screen.x < -30 || screen.x > state.width + 30 || screen.y < -30 || screen.y > state.height + 30) continue;

      const glow = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, size * 4.2);
      glow.addColorStop(0, hexToRgba(planet.color, selected ? 0.42 : 0.26));
      glow.addColorStop(1, hexToRgba(planet.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size * 4.2, 0, TWO_PI);
      ctx.fill();

      if (selected) {
        ctx.strokeStyle = hexToRgba(planet.color, 0.64);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, size + 5.5, 0, TWO_PI);
        ctx.stroke();
      }

      if (planet.id === 'saturn') drawSaturnRing(screen, size);

      ctx.fillStyle = planet.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size, 0, TWO_PI);
      ctx.fill();
    }
  }

  function drawLabels() {
    if (!state.labels) return;
    const used = [];
    ctx.save();
    ctx.font = '600 9px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // Place outer planets first, then selected/hovered receives priority.
    const ordered = [...PLANETS].sort((a, b) => {
      const priorityA = (a.id === state.selected || a.id === state.hovered) ? 100 : state.positions.get(a.id).distance;
      const priorityB = (b.id === state.selected || b.id === state.hovered) ? 100 : state.positions.get(b.id).distance;
      return priorityB - priorityA;
    });

    for (const planet of ordered) {
      const screen = state.screenPositions.get(planet.id);
      if (!screen || screen.x < 0 || screen.x > state.width || screen.y < 0 || screen.y > state.height) continue;
      const allowExtraLabelsOnMobile = isMobileViewport() && state.width < 620;
      if (state.width < 620 && !allowExtraLabelsOnMobile && !['earth', 'mars', 'jupiter', 'saturn'].includes(planet.id) && planet.id !== state.selected && planet.id !== state.hovered) continue;

      const textWidth = ctx.measureText(planet.name).width;
      const candidates = [
        { x: screen.x + 10, y: screen.y - 10 },
        { x: screen.x + 10, y: screen.y + 11 },
        { x: screen.x - textWidth - 10, y: screen.y - 10 },
        { x: screen.x - textWidth - 10, y: screen.y + 11 },
      ];
      let chosen = candidates[0];
      for (const candidate of candidates) {
        const rect = { x: candidate.x - 3, y: candidate.y - 7, w: textWidth + 6, h: 14 };
        if (!used.some((item) => intersects(rect, item)) && rect.x > 6 && rect.x + rect.w < state.width - 6 && rect.y > 6 && rect.y + rect.h < state.height - 6) {
          chosen = candidate;
          used.push(rect);
          break;
        }
      }
      ctx.fillStyle = planet.id === state.selected || planet.id === state.hovered ? 'rgba(235, 239, 244, 0.92)' : 'rgba(171, 181, 193, 0.62)';
      ctx.fillText(planet.name, chosen.x, chosen.y);
    }
    ctx.restore();
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function render() {
    drawBackground();
    drawReferenceAxis();
    drawOrbits();
    drawTrails();
    drawSun();
    drawPlanets();
    drawLabels();
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const number = Number.parseInt(clean, 16);
    const r = (number >> 16) & 255;
    const g = (number >> 8) & 255;
    const b = number & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function updateCamera(dt) {
    if (state.focus && state.positions.has(state.focus)) {
      const point = displayPoint(state.positions.get(state.focus));
      state.camera.targetX = point.x;
      state.camera.targetY = point.y;
    }
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-dt * 7.5);
    state.camera.x = lerp(state.camera.x, state.camera.targetX, smoothing);
    state.camera.y = lerp(state.camera.y, state.camera.targetY, smoothing);
    state.camera.zoom = lerp(state.camera.zoom, state.camera.targetZoom, smoothing);
  }

  function animate(now) {
    const elapsedSeconds = clamp((now - state.lastFrame) / 1000, 0, 0.1);
    state.lastFrame = now;
    const previousTimestamp = state.timestamp;

    if (!state.paused) {
      state.timestamp += elapsedSeconds * state.speedDaysPerSecond * state.direction * DAY_MS;
      const min = MODEL_MIN_TIMESTAMP;
      const max = MODEL_MAX_TIMESTAMP;
      if (state.timestamp < min || state.timestamp > max) {
        state.timestamp = clamp(state.timestamp, min, max);
        state.paused = true;
        showToast('Date limit reached');
      }
    }

    updatePositions();
    updateOrbitCache();
    updateTrailCache();
    updateFrameMotionPaths(previousTimestamp);
    updateCamera(elapsedSeconds);
    render();

    if (now - state.lastUiUpdate > 150) {
      updateUi();
      state.lastUiUpdate = now;
    }
    requestAnimationFrame(animate);
  }

  const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const WORLD_TIME_ZONES = [
    { key: 'utc', label: 'UTC', timeZone: 'UTC', locale: 'en-GB', abbreviation: 'UTC', standardAbbreviation: 'UTC', standardOffsetMinutes: 0 },
    { key: 'london', label: 'London', timeZone: 'Europe/London', locale: 'en-GB', standardAbbreviation: 'GMT', daylightAbbreviation: 'BST', standardOffsetMinutes: 0 },
    { key: 'new-york', label: 'New York', timeZone: 'America/New_York', locale: 'en-US', standardAbbreviation: 'EST', daylightAbbreviation: 'EDT', standardOffsetMinutes: -300 },
    { key: 'los-angeles', label: 'Los Angeles', timeZone: 'America/Los_Angeles', locale: 'en-US', standardAbbreviation: 'PST', daylightAbbreviation: 'PDT', standardOffsetMinutes: -480 },
    { key: 'dubai', label: 'Dubai', timeZone: 'Asia/Dubai', locale: 'en-GB', abbreviation: 'GST', standardAbbreviation: 'GST', standardOffsetMinutes: 240 },
    { key: 'delhi', label: 'Delhi', timeZone: 'Asia/Kolkata', locale: 'en-GB', abbreviation: 'IST', standardAbbreviation: 'IST', standardOffsetMinutes: 330 },
    { key: 'tokyo', label: 'Tokyo', timeZone: 'Asia/Tokyo', locale: 'en-GB', abbreviation: 'JST', standardAbbreviation: 'JST', standardOffsetMinutes: 540 },
    { key: 'sydney', label: 'Sydney', timeZone: 'Australia/Sydney', locale: 'en-AU', standardAbbreviation: 'AEST', daylightAbbreviation: 'AEDT', standardOffsetMinutes: 600 },
  ];

  const worldTimeFormatters = new Map();

  function timeZoneForKey(key) {
    return WORLD_TIME_ZONES.find((zone) => zone.key === key) || WORLD_TIME_ZONES[0];
  }

  function displayYear(astronomicalYear) {
    if (astronomicalYear <= 0) return `${String(1 - astronomicalYear).padStart(4, '0')} BCE`;
    return String(astronomicalYear).padStart(4, '0');
  }

  function formatterForZone(zone) {
    if (!worldTimeFormatters.has(zone.key)) {
      worldTimeFormatters.set(zone.key, new Intl.DateTimeFormat(zone.locale, {
        timeZone: zone.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        era: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'short',
      }));
    }
    return worldTimeFormatters.get(zone.key);
  }

  function formattedPart(parts, type, fallback = '') {
    return parts.find((part) => part.type === type)?.value || fallback;
  }

  function fixedZoneDateTime(timestamp, zone) {
    const shifted = new Date(timestamp + zone.standardOffsetMinutes * MINUTE_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      offsetMinutes: zone.standardOffsetMinutes,
      abbreviation: zone.standardAbbreviation,
    };
  }

  function zoneDateTime(timestamp, zone) {
    const utcYear = new Date(timestamp).getUTCFullYear();
    if (utcYear < 1900 || utcYear > 2100) return fixedZoneDateTime(timestamp, zone);
    try {
      const parts = formatterForZone(zone).formatToParts(new Date(timestamp));
      const year = Number(formattedPart(parts, 'year', '1'));
      const month = Number(formattedPart(parts, 'month', '1'));
      const day = Number(formattedPart(parts, 'day', '1'));
      const hour = Number(formattedPart(parts, 'hour', '0'));
      const minute = Number(formattedPart(parts, 'minute', '0'));
      const second = Number(formattedPart(parts, 'second', '0'));
      const era = formattedPart(parts, 'era', 'CE').toUpperCase();
      const astronomicalYear = era.includes('BC') ? 1 - year : year;
      const localAsUtc = makeUtcTimestamp(astronomicalYear, month - 1, day, hour, minute, second);
      const offsetMinutes = Math.round((localAsUtc - timestamp) / MINUTE_MS);
      const reportedAbbreviation = formattedPart(parts, 'timeZoneName', zone.standardAbbreviation);
      const abbreviation = zone.abbreviation
        || (zone.daylightAbbreviation && offsetMinutes !== zone.standardOffsetMinutes
          ? zone.daylightAbbreviation
          : zone.standardAbbreviation)
        || reportedAbbreviation;
      return {
        year: astronomicalYear,
        month,
        day,
        hour,
        minute,
        second,
        offsetMinutes,
        abbreviation,
      };
    } catch (error) {
      return fixedZoneDateTime(timestamp, zone);
    }
  }

  function formatDate(timestamp) {
    const zone = timeZoneForKey(state.displayTimeZoneKey);
    const local = zoneDateTime(timestamp, zone);
    const day = String(local.day).padStart(2, '0');
    const month = MONTH_NAMES[local.month - 1];
    const year = displayYear(local.year);
    const hours = String(local.hour).padStart(2, '0');
    const minutes = String(local.minute).padStart(2, '0');
    return `${day} ${month} ${year} · ${hours}:${minutes} ${local.abbreviation}`;
  }

  function formatDateInput(timestamp, zone = timeZoneForKey(state.displayTimeZoneKey)) {
    const local = zoneDateTime(timestamp, zone);
    const year = local.year <= 0 ? 1 - local.year : local.year;
    return `${String(year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  }

  function eraForTimestamp(timestamp, zone = timeZoneForKey(state.displayTimeZoneKey)) {
    return zoneDateTime(timestamp, zone).year <= 0 ? 'BCE' : 'CE';
  }

  function formatTimeInput(timestamp, zone) {
    const local = zoneDateTime(timestamp, zone);
    return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:${String(local.second).padStart(2, '0')}`;
  }

  function civilTimestampInZone(astronomicalYear, month, day, hour, minute, second, zone) {
    const localAsUtc = makeUtcTimestamp(astronomicalYear, month - 1, day, hour, minute, second);
    if (astronomicalYear < 1900 || astronomicalYear > 2100 || zone.key === 'utc') {
      return localAsUtc - zone.standardOffsetMinutes * MINUTE_MS;
    }

    const possibleOffsets = new Set([zone.standardOffsetMinutes]);
    if (zone.daylightAbbreviation) possibleOffsets.add(zone.standardOffsetMinutes + 60);
    for (const days of [-2, -1, 0, 1, 2]) {
      possibleOffsets.add(zoneDateTime(localAsUtc + days * DAY_MS, zone).offsetMinutes);
    }

    for (const offsetMinutes of possibleOffsets) {
      const candidate = localAsUtc - offsetMinutes * MINUTE_MS;
      const local = zoneDateTime(candidate, zone);
      if (
        local.year === astronomicalYear
        && local.month === month
        && local.day === day
        && local.hour === hour
        && local.minute === minute
        && local.second === second
      ) return candidate;
    }
    return null;
  }

  function updateUi() {
    ui.dateMain.textContent = formatDate(state.timestamp);
    const modelMode = hybridModelWeights(state.timestamp).mode;
    ui.modelText.textContent = modelMode === 'short'
      ? 'JPL approximate ephemeris · 1800–2050'
      : modelMode === 'blend'
        ? 'JPL hybrid ephemeris · smooth transition'
        : 'JPL long-range ephemeris · 3000 BCE–3000 CE';
    ui.playButton.textContent = state.paused ? '▶' : 'Ⅱ';
    ui.playButton.setAttribute('aria-label', state.paused ? 'Play simulation' : 'Pause simulation');
    ui.reverseButton.classList.toggle('active', state.direction < 0 && !state.paused);
    ui.forwardButton.classList.toggle('active', state.direction > 0 && !state.paused);
    if (state.selected) updatePlanetCard();
  }

  function selectPlanet(planetId) {
    state.selected = planetId;
    ui.planetCard.hidden = false;
    updatePlanetCard();
  }

  function closePlanetCard() {
    state.selected = null;
    ui.planetCard.hidden = true;
    if (state.focus) resetView();
  }

  function updatePlanetCard() {
    const planet = PLANETS.find((item) => item.id === state.selected);
    const position = state.positions.get(state.selected);
    const earth = state.positions.get('earth');
    if (!planet || !position || !earth) return;
    const earthDistanceAu = Math.hypot(position.x - earth.x, position.y - earth.y, position.z - earth.z);

    ui.planetName.textContent = planet.name;
    ui.planetSwatch.style.background = planet.color;
    ui.planetSwatch.style.color = planet.color;
    ui.planetDistance.textContent = `${position.distance.toFixed(position.distance < 2 ? 3 : 2)} AU`;
    ui.earthDistance.textContent = planet.id === 'earth' ? '—' : `${earthDistanceAu.toFixed(2)} AU`;
    ui.planetVelocity.textContent = `${position.velocity.toFixed(1)} km/s`;
    ui.planetLongitude.textContent = `${(position.longitude / DEG).toFixed(2)}°`;
    ui.planetLatitude.textContent = `${signedDegrees(position.latitude).toFixed(2)}°`;
    ui.planetPeriod.textContent = formatPeriod(position.periodDays);
    updateFocusButtons();
  }

  function formatPeriod(days) {
    if (days < 730) return `${days.toFixed(1)} days`;
    return `${(days / 365.256).toFixed(2)} years`;
  }

  function updateFocusButtons() {
    const focused = Boolean(state.focus);
    ui.focusButton.hidden = focused;
    ui.clearFocusButton.hidden = !focused;
  }

  function focusSelected() {
    if (!state.selected) return;
    state.focus = state.selected;
    const position = state.positions.get(state.selected);
    const distance = compressRadius(position.distance);
    state.camera.targetZoom = clamp(8.5 / Math.max(0.7, distance / 4), 2.3, 8);
    updateFocusButtons();
  }

  function setNow() {
    state.timestamp = Date.now();
    state.direction = 1;
    state.speedDaysPerSecond = Number(ui.speedSelect.options[0].value);
    ui.speedSelect.selectedIndex = 0;
    state.orbitCacheTimestamp = 0;
    state.trailCacheTimestamp = 0;
    updateUi();
    showToast('Returned to current time');
  }

  function populateDateInputs(timestamp, zoneKey) {
    const zone = timeZoneForKey(zoneKey);
    ui.dateInput.value = formatDateInput(timestamp, zone);
    ui.eraInput.value = eraForTimestamp(timestamp, zone);
    ui.timeInput.value = formatTimeInput(timestamp, zone);
  }

  function showDateDialog() {
    state.dialogTimeZoneKey = state.displayTimeZoneKey;
    ui.timeZoneInput.value = state.dialogTimeZoneKey;
    populateDateInputs(state.timestamp, state.dialogTimeZoneKey);
    ui.dateWarning.hidden = true;
    ui.dateDialog.showModal();
  }

  function parseDateInputs(zoneKey = ui.timeZoneInput.value) {
    if (!ui.dateInput.value || !ui.timeInput.value) return null;
    const match = ui.dateInput.value.match(/^(\d{4,})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const statedYear = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const era = ui.eraInput.value;
    if (statedYear < 1 || statedYear > 3000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const astronomicalYear = era === 'BCE' ? 1 - statedYear : statedYear;
    const time = ui.timeInput.value.split(':').map(Number);
    const hour = time[0] || 0;
    const minute = time[1] || 0;
    const second = time[2] || 0;
    const validation = new Date(makeUtcTimestamp(astronomicalYear, month - 1, day, hour, minute, second));
    if (validation.getUTCFullYear() !== astronomicalYear || validation.getUTCMonth() !== month - 1 || validation.getUTCDate() !== day) return null;
    return civilTimestampInZone(astronomicalYear, month, day, hour, minute, second, timeZoneForKey(zoneKey));
  }

  function changeDialogTimeZone() {
    const previousTimestamp = parseDateInputs(state.dialogTimeZoneKey);
    state.dialogTimeZoneKey = ui.timeZoneInput.value;
    if (Number.isFinite(previousTimestamp)) populateDateInputs(previousTimestamp, state.dialogTimeZoneKey);
    ui.dateWarning.hidden = true;
  }

  function applyDate(event) {
    event.preventDefault();
    const timestamp = parseDateInputs();
    if (!Number.isFinite(timestamp)) {
      ui.dateWarning.textContent = 'Choose a valid calendar date, time, BCE/CE era, and time zone.';
      ui.dateWarning.hidden = false;
      return;
    }
    if (timestamp < MODEL_MIN_TIMESTAMP || timestamp > MODEL_MAX_TIMESTAMP) {
      ui.dateWarning.textContent = 'Choose a date from 3000 BCE to 3000 CE.';
      ui.dateWarning.hidden = false;
      return;
    }
    state.timestamp = timestamp;
    state.displayTimeZoneKey = ui.timeZoneInput.value;
    state.dialogTimeZoneKey = state.displayTimeZoneKey;
    state.orbitCacheTimestamp = 0;
    state.trailCacheTimestamp = 0;
    updateUi();
    ui.dateDialog.close();
  }

  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { ui.toast.hidden = true; }, 2200);
  }

  function nearestPlanet(x, y, threshold = 15) {
    let best = null;
    let bestDistance = threshold;
    for (const planet of PLANETS) {
      const screen = state.screenPositions.get(planet.id);
      if (!screen) continue;
      const distance = Math.hypot(x - screen.x, y - screen.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = planet.id;
      }
    }
    return best;
  }

  function zoomAt(x, y, factor) {
    const before = screenToWorld(x, y);
    state.camera.targetZoom = clamp(state.camera.targetZoom * factor, 0.62, 28);
    state.camera.zoom = state.camera.targetZoom;
    const after = screenToWorld(x, y);
    state.camera.x += before.x - after.x;
    state.camera.y += before.y - after.y;
    state.camera.targetX = state.camera.x;
    state.camera.targetY = state.camera.y;
    state.focus = null;
    updateFocusButtons();
  }

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0012);
    zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
  }, { passive: false });

  canvas.addEventListener('dblclick', () => resetView());

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      state.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.camera.targetZoom };
    } else {
      state.dragging = true;
      canvas.classList.add('dragging');
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (!state.pointers.has(event.pointerId)) {
      state.hovered = nearestPlanet(localX, localY);
      canvas.style.cursor = state.hovered ? 'pointer' : 'grab';
      return;
    }

    const pointer = state.pointers.get(event.pointerId);
    const previousX = pointer.x;
    const previousY = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midpointX = (a.x + b.x) / 2 - rect.left;
      const midpointY = (a.y + b.y) / 2 - rect.top;
      if (state.pinch && state.pinch.distance > 0) {
        const factor = distance / state.pinch.distance;
        const desired = clamp(state.pinch.zoom * factor, 0.62, 28);
        zoomAt(midpointX, midpointY, desired / state.camera.targetZoom);
      }
      return;
    }

    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    const scale = pixelsPerAU();
    state.camera.x -= dx / scale;
    state.camera.y += dy / scale;
    state.camera.targetX = state.camera.x;
    state.camera.targetY = state.camera.y;
    state.focus = null;
    updateFocusButtons();
  });

  function endPointer(event) {
    const pointer = state.pointers.get(event.pointerId);
    if (pointer && state.pointers.size === 1) {
      const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
      if (moved < 6) {
        const rect = canvas.getBoundingClientRect();
        const planet = nearestPlanet(event.clientX - rect.left, event.clientY - rect.top, 18);
        if (planet) selectPlanet(planet);
      }
    }
    state.pointers.delete(event.pointerId);
    state.pinch = null;
    if (state.pointers.size === 0) {
      state.dragging = false;
      canvas.classList.remove('dragging');
    }
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (!state.dragging) state.hovered = null; });

  ui.labelsToggle.addEventListener('change', () => { state.labels = ui.labelsToggle.checked; });
  ui.orbitsToggle.addEventListener('change', () => { state.orbits = ui.orbitsToggle.checked; });
  ui.trailsToggle.addEventListener('change', () => { state.trails = ui.trailsToggle.checked; updateTrailCache(true); });
  ui.scaleButton.addEventListener('click', () => {
    state.scaleMode = state.scaleMode === 'compressed' ? 'true' : 'compressed';
    ui.scaleButton.textContent = state.scaleMode === 'compressed' ? 'Compressed' : 'True distance';
    resetView();
    showToast(state.scaleMode === 'compressed' ? 'Logarithmic radial compression' : 'Linear astronomical-unit scale');
  });
  ui.resetViewButton.addEventListener('click', () => resetView());
  ui.reverseButton.addEventListener('click', () => { state.direction = -1; state.paused = false; });
  ui.forwardButton.addEventListener('click', () => { state.direction = 1; state.paused = false; });
  ui.playButton.addEventListener('click', () => { state.paused = !state.paused; });
  ui.speedSelect.addEventListener('change', () => { state.speedDaysPerSecond = Number(ui.speedSelect.value); });
  ui.nowButton.addEventListener('click', setNow);
  ui.dateButton.addEventListener('click', showDateDialog);
  ui.aboutButton.addEventListener('click', () => ui.aboutDialog.showModal());
  ui.closePlanetCard.addEventListener('click', closePlanetCard);
  ui.focusButton.addEventListener('click', focusSelected);
  ui.clearFocusButton.addEventListener('click', () => resetView());
  ui.dateForm.addEventListener('submit', applyDate);
  ui.dateDialogClose.addEventListener('click', () => ui.dateDialog.close());
  ui.dialogNowButton.addEventListener('click', () => {
    populateDateInputs(Date.now(), ui.timeZoneInput.value);
    ui.dateWarning.hidden = true;
  });
  ui.timeZoneInput.addEventListener('change', changeDialogTimeZone);
  ui.dateInput.addEventListener('input', () => { ui.dateWarning.hidden = true; });
  ui.eraInput.addEventListener('change', () => { ui.dateWarning.hidden = true; });
  ui.timeInput.addEventListener('input', () => { ui.dateWarning.hidden = true; });

  window.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (event.code === 'Space') { event.preventDefault(); state.paused = !state.paused; }
    else if (event.key.toLowerCase() === 'n') setNow();
    else if (event.key.toLowerCase() === 'r') resetView();
    else if (event.key.toLowerCase() === 'l') { state.labels = !state.labels; ui.labelsToggle.checked = state.labels; }
    else if (event.key.toLowerCase() === 'o') { state.orbits = !state.orbits; ui.orbitsToggle.checked = state.orbits; }
    else if (event.key === 'ArrowLeft') { state.direction = -1; state.paused = false; }
    else if (event.key === 'ArrowRight') { state.direction = 1; state.paused = false; }
    else if (event.key === 'Escape' && state.selected) closePlanetCard();
  });

  window.addEventListener('resize', resizeCanvas);

  // ---------------------------------------------------------------------------
  // Development validation (?debug=1)
  // ---------------------------------------------------------------------------

  // Independent reference vectors generated with Swiss Ephemeris/Moshier
  // (heliocentric, geometric, J2000 ecliptic Cartesian coordinates). Moshier is
  // independent of this Kepler-element implementation and closely follows JPL
  // DE404. These frozen values are diagnostics, not inputs to the simulation.
  const REFERENCE_EPHEMERIS = [
    {
      iso: '2000-01-01T12:00:00Z',
      vectors: {
        mercury: [-0.130077763738, -0.447292371560, -0.024600216361],
        venus: [-0.718301589784, -0.032669676450, 0.041013907078],
        earth: [-0.177147928063, 0.967239302642, -0.000003986633],
        mars: [1.390716158468, -0.013404464624, -0.034467579938],
        jupiter: [4.001181251074, 2.938579527064, -0.101784135269],
        saturn: [6.406407706092, 6.569989889211, -0.369071110931],
        uranus: [14.431866315285, -13.734308152879, -0.238144860649],
        neptune: [16.812050494472, -24.991793947430, 0.127216501252],
      },
    },
    {
      iso: '2026-08-01T12:00:00Z',
      vectors: {
        mercury: [0.349354951023, 0.020416441265, -0.030373194682],
        venus: [-0.154780656939, -0.709517010024, -0.000817416981],
        earth: [0.637305961306, -0.789854533774, 0.000042742486],
        mars: [0.879119858518, 1.190994720681, 0.003402610287],
        jupiter: [-3.128704978945, 4.261443559746, 0.052300673238],
        saturn: [9.335167850909, 1.434944734686, -0.396583208533],
        uranus: [9.143549480747, 17.169189383094, -0.054788281076],
        neptune: [29.847378865562, 1.189379251322, -0.712281618133],
      },
    },
    {
      iso: '2035-01-01T00:00:00Z',
      vectors: {
        mercury: [0.358489753742, -0.108082457664, -0.041705928538],
        venus: [-0.572462757350, 0.432529747617, 0.038981499924],
        earth: [-0.168918473129, 0.968717897160, -0.000078643814],
        mars: [-1.446068986064, -0.701945594811, 0.020720760042],
        jupiter: [4.741154561110, 1.428263860290, -0.112003970674],
        saturn: [-4.624116567014, 7.805519259325, 0.048515174028],
        uranus: [-2.649136875771, 18.701762637287, 0.103631174455],
        neptune: [27.856006538938, 10.658967030860, -0.861404524721],
      },
    },
  ];

  // Additional independent Moshier vectors in the long-range regime. The
  // looser limits reflect JPL's published nominal errors for Table 2 and the
  // Earth-centre versus Earth–Moon-barycentre convention difference.
  const LONG_RANGE_REFERENCE_EPHEMERIS = [
    {
      year: -1000,
      vectors: {
        mercury: [0.240139417092, -0.345860396056, -0.050679045952],
        venus: [0.527179752458, 0.493920127735, -0.028510396415],
        earth: [-0.792335214640, 0.590776911149, 0.004314394429],
        mars: [1.410542604471, 0.125751572152, -0.040853002209],
        jupiter: [1.420402702984, 4.897739318844, -0.046846970234],
        saturn: [-3.172179995217, 8.441301048596, -0.068715342610],
        uranus: [10.986683232597, 16.207018436757, -0.079576092150],
        neptune: [-19.732948822327, -23.047201030506, 0.926145550760],
      },
    },
    {
      year: 2500,
      vectors: {
        mercury: [-0.183410441124, -0.426207225453, -0.018495413606],
        venus: [0.063755048935, 0.717213168232, 0.007135843000],
        earth: [-0.060729156765, 0.981967043574, -0.001102228022],
        mars: [0.418971806700, -1.362737102257, -0.038590785246],
        jupiter: [-0.376063100008, 5.127905635709, -0.014465105718],
        saturn: [7.599603811882, 5.319861802540, -0.395471971893],
        uranus: [10.017325127078, -16.990519623801, -0.190008251264],
        neptune: [21.602194638007, -20.907442702056, -0.067526776256],
      },
    },
  ];

  const LONG_RANGE_ANGULAR_LIMIT_ARCSEC = {
    mercury: 60, venus: 120, earth: 120, mars: 400,
    jupiter: 1200, saturn: 1800, uranus: 3000, neptune: 900,
  };
  const LONG_RANGE_RADIAL_LIMIT_KM = {
    mercury: 5000, venus: 20000, earth: 30000, mars: 100000,
    jupiter: 2_000_000, saturn: 6_000_000, uranus: 12_000_000, neptune: 6_000_000,
  };

  const REFERENCE_ANGULAR_LIMIT_ARCSEC = {
    mercury: 60, venus: 60, earth: 60, mars: 150,
    jupiter: 900, saturn: 1300, uranus: 300, neptune: 100,
  };
  const REFERENCE_RADIAL_LIMIT_KM = {
    mercury: 3000, venus: 10000, earth: 20000, mars: 60000,
    jupiter: 1500000, saturn: 3500000, uranus: 2500000, neptune: 1500000,
  };

  function angularSeparationArcsec(a, b) {
    const ra = Math.hypot(a.x, a.y, a.z);
    const rb = Math.hypot(b.x, b.y, b.z);
    const cosine = clamp((a.x * b.x + a.y * b.y + a.z * b.z) / (ra * rb), -1, 1);
    return Math.acos(cosine) / DEG * 3600;
  }

  function runDiagnostics() {
    const checks = [];
    const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

    for (const reference of REFERENCE_EPHEMERIS) {
      const timestamp = Date.parse(reference.iso);
      const positions = Object.fromEntries(PLANETS.map((planet) => [planet.id, getHeliocentricPosition(planet.id, timestamp)]));
      const year = new Date(timestamp).getUTCFullYear();

      add(`Mercury inside Venus (${year})`, positions.mercury.distance < positions.venus.distance);
      add(`Neptune outside Uranus (${year})`, positions.neptune.distance > positions.uranus.distance);
      add(`EM barycentre near 1 AU (${year})`, positions.earth.distance > 0.97 && positions.earth.distance < 1.03, `${positions.earth.distance.toFixed(6)} AU`);
      add(`Finite vectors (${year})`, PLANETS.every((p) => ['x', 'y', 'z'].every((key) => Number.isFinite(positions[p.id][key]))));

      for (const planet of PLANETS) {
        const position = positions[planet.id];
        const refArray = reference.vectors[planet.id];
        const ref = { x: refArray[0], y: refArray[1], z: refArray[2] };
        const angle = angularSeparationArcsec(position, ref);
        const radialKm = Math.abs(position.distance - Math.hypot(ref.x, ref.y, ref.z)) * AU_KM;
        add(
          `${planet.name} independent vector (${year})`,
          angle <= REFERENCE_ANGULAR_LIMIT_ARCSEC[planet.id] && radialKm <= REFERENCE_RADIAL_LIMIT_KM[planet.id],
          `${angle.toFixed(1)} arcsec; ${Math.round(radialKm).toLocaleString('en-GB')} km radial`,
        );

        const elements = position.elements;
        const E = solveKeplersEquation(elements.meanAnomaly, elements.e);
        const residual = Math.abs(E - elements.e * Math.sin(E) - elements.meanAnomaly);
        add(`${planet.name} Kepler residual (${year})`, residual < 1e-11, residual.toExponential(2));
        const perihelion = elements.a * (1 - elements.e);
        const aphelion = elements.a * (1 + elements.e);
        add(`${planet.name} radial bounds (${year})`, position.distance >= perihelion - 1e-12 && position.distance <= aphelion + 1e-12);
      }
    }

    for (const reference of LONG_RANGE_REFERENCE_EPHEMERIS) {
      const timestamp = makeUtcTimestamp(reference.year, 0, 1);
      for (const planet of PLANETS) {
        const position = getHeliocentricPosition(planet.id, timestamp);
        const refArray = reference.vectors[planet.id];
        const ref = { x: refArray[0], y: refArray[1], z: refArray[2] };
        const angle = angularSeparationArcsec(position, ref);
        const radialKm = Math.abs(position.distance - Math.hypot(ref.x, ref.y, ref.z)) * AU_KM;
        add(
          `${planet.name} long-range vector (${displayYear(reference.year)})`,
          angle <= LONG_RANGE_ANGULAR_LIMIT_ARCSEC[planet.id] && radialKm <= LONG_RANGE_RADIAL_LIMIT_KM[planet.id],
          `${angle.toFixed(1)} arcsec; ${Math.round(radialKm).toLocaleString('en-GB')} km radial`,
        );
      }
    }

    const motionTimestamp = Date.parse('2026-08-01T12:00:00Z');
    for (const planet of PLANETS) {
      const before = getHeliocentricPosition(planet.id, motionTimestamp);
      const after = getHeliocentricPosition(planet.id, motionTimestamp + DAY_MS);
      const deltaLongitude = normalizeRadians(after.longitude - before.longitude);
      add(`${planet.name} prograde motion`, deltaLongitude > 0 && deltaLongitude < Math.PI, `${(deltaLongitude / DEG).toFixed(6)}°/day`);

      const h = 60_000;
      const minus = getHeliocentricPosition(planet.id, motionTimestamp - h);
      const plus = getHeliocentricPosition(planet.id, motionTimestamp + h);
      const numericalSpeed = Math.hypot(plus.x - minus.x, plus.y - minus.y, plus.z - minus.z) * AU_KM / (2 * h / 1000);
      const relativeSpeedError = Math.abs(before.velocity / numericalSpeed - 1);
      add(`${planet.name} speed consistency`, relativeSpeedError < 0.001, `${(relativeSpeedError * 1e6).toFixed(0)} ppm`);

      const orbit = sampleOrbit(planet.id, motionTimestamp, 360);
      const closureAu = Math.hypot(
        orbit[0].x - orbit.at(-1).x,
        orbit[0].y - orbit.at(-1).y,
        orbit[0].z - orbit.at(-1).z,
      );
      add(`${planet.name} orbit closes`, closureAu < 1e-12, closureAu.toExponential(2));
    }

    const mars = getElements('mars', julianEphemerisDateFromTimestamp(motionTimestamp));
    const rPeri = mars.a * (1 - mars.e);
    const rApo = mars.a * (1 + mars.e);
    const vPeri = Math.sqrt(MU_SUN * (2 / (rPeri * AU_KM) - 1 / (mars.a * AU_KM)));
    const vApo = Math.sqrt(MU_SUN * (2 / (rApo * AU_KM) - 1 / (mars.a * AU_KM)));
    add('Mars faster at perihelion', vPeri > vApo, `${vPeri.toFixed(2)} vs ${vApo.toFixed(2)} km/s`);
    add('2026 TT−UTC offset', Math.abs(ttMinusUtcSeconds(motionTimestamp) - 69.184) < 1e-9, `${ttMinusUtcSeconds(motionTimestamp).toFixed(3)} s`);

    const continuityBoundaries = [BLEND_EARLY_START, BLEND_EARLY_END, BLEND_LATE_START, BLEND_LATE_END];
    for (const boundary of continuityBoundaries) {
      const label = formatDate(boundary).split(' · ')[0];
      for (const planet of PLANETS) {
        const before = getHeliocentricPosition(planet.id, boundary - 1000);
        const after = getHeliocentricPosition(planet.id, boundary + 1000);
        const jumpKm = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) * AU_KM;
        add(`${planet.name} continuous at ${label}`, jumpKm < 150, `${jumpKm.toFixed(3)} km across 2 s`);
      }
    }

    for (const [iso, expectedMode] of [
      ['-002999-01-01T00:00:00Z', 'long'],
      ['1805-01-01T00:00:00Z', 'blend'],
      ['2026-08-01T12:00:00Z', 'short'],
      ['2045-01-01T00:00:00Z', 'blend'],
      ['3000-01-01T00:00:00Z', 'long'],
    ]) {
      const timestamp = Date.parse(iso);
      if (!Number.isFinite(timestamp)) continue;
      add(`Model selection ${iso}`, hybridModelWeights(timestamp).mode === expectedMode, hybridModelWeights(timestamp).mode);
      add(`Finite long-range vectors ${iso}`, PLANETS.every((planet) => {
        const p = getHeliocentricPosition(planet.id, timestamp);
        return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
      }));
    }

    console.group('Solar System diagnostics — hybrid verified build');
    console.table(checks);
    const failed = checks.filter((check) => !check.pass);
    if (failed.length) console.error(`${failed.length} diagnostic check(s) failed.`, failed);
    else console.info(`All ${checks.length} checks passed. Independent vectors: Swiss Ephemeris/Moshier, geometric heliocentric J2000 ecliptic.`);
    console.groupEnd();
    return { pass: failed.length === 0, checks };
  }

  // Expose a compact read-only API for inspection and testing.
  window.SolarSystemSimulator = Object.freeze({
    getPosition: (planetId, date = new Date()) => getHeliocentricPosition(planetId, date.getTime()),
    getModelMode: (date = new Date()) => hybridModelWeights(date.getTime()).mode,
    julianDateFromUTC: (date) => julianDateFromTimestamp(date.getTime()),
    julianEphemerisDate: (date) => julianEphemerisDateFromTimestamp(date.getTime()),
    ttMinusUtcSeconds: (date) => ttMinusUtcSeconds(date.getTime()),
    runDiagnostics,
  });

  resizeCanvas();
  updatePositions();
  updateOrbitCache();
  updateUi();
  if (new URLSearchParams(location.search).has('debug')) runDiagnostics();
  requestAnimationFrame(animate);
})();
