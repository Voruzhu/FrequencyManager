/**
 * @fileoverview Wuthering Waves echo-name -> sonata-set lookup, used by the
 * OCR scanner to resolve an echo's set from its (reliably OCR-readable)
 * display name when the set itself isn't readable (the in-game Echo
 * Management screen shows the set only as an icon, no text — see
 * `ocrMapping.ts`).
 *
 * Sourced from `api.encore.moe/en/echo` (2026-07-12) — every echo entity in
 * the live game data, cross-referenced against its `FetterGroups` (the
 * sonata set(s) that entity can carry). Deliberately only includes echoes
 * that resolve to EXACTLY ONE of the sets this app's catalog actually models
 * (`WW_GEAR_CATALOG.sets`, the 16-set roster in
 * `adapters/game-definitions/wuthering-waves/definition.ts`'s
 * `SET_BONUSES`/`uiOptions.setNames`) — most common "fodder" echoes (world
 * mobs) can legitimately carry 2-5 DIFFERENT sonata sets depending on which
 * one the player configured, so their name alone can't identify the set;
 * those are correctly left out rather than guessed. What's left is exactly
 * the boss/unique/character echoes (each intrinsically tied to one set) plus
 * the "Frosty Resolve" 4★-character-echo roster, which is what real scan
 * screenshots overwhelmingly are anyway.
 *
 * "Phantom: X" / "Nightmare: X" prefix variants in the source data were
 * folded into their base name when the underlying entity is the same real
 * in-game echo (confirmed against real screenshots this session, e.g. a
 * scanned "Capitaneus" — no prefix shown on the actual Echo Management
 * screen); a few ARE distinct in-game echoes from their base form (e.g.
 * "Nightmare: Impermanence Heron" carries a different set than plain
 * "Impermanence Heron") and are kept as separate keys.
 *
 * UPDATED 2026-07-12 (later same day): the 18 previously-unmodeled sets
 * referenced above are now in the catalog too (see `SET_BONUSES`), so their
 * echoes are included below. GI artifact pieces have an equivalent per-piece
 * naming convention in-game but aren't covered here — no sourced mapping
 * built yet.
 */
export const WW_ECHO_NAME_TO_SET: Record<string, string> = {
    'Thundering Mephis': 'Void Thunder',
    'Nightmare: Thundering Mephis': 'Void Thunder',
    'Inferno Rider': 'Molten Rift',
    'Nightmare: Inferno Rider': 'Molten Rift',
    'Lampylumen Myriad': 'Freezing Frost',
    'Crownless': 'Havoc Eclipse',
    'Nightmare: Crownless': 'Havoc Eclipse',
    'Mourning Aix': 'Celestial Light',
    'Nightmare: Mourning Aix': 'Eternal Radiance',
    'Impermanence Heron': 'Moonlit Clouds',
    'Nightmare: Impermanence Heron': 'Midnight Veil',
    'Nightmare: Feilian Beringal': 'Sierra Gale',
    'Hecate': 'Empyrean Anthem',
    'Dragon of Dirge': 'Tidebreaking Courage',
    // Moved here 2026-07-16 from the ambiguous-sets table — re-audit found
    // both are actually single-set (encore.moe API + game8.co agree),
    // not genuinely ambiguous.
    'Dreamless': 'Havoc Eclipse',
    'Feilian Beringal': 'Sierra Gale',
    'Fallacy of No Return': 'Rejuvenating Glow',
    'Mech Abomination': 'Lingering Tunes',
    'Lorelei': 'Midnight Veil',
    // The "Frosty Resolve" 4★ character-echo roster — every playable
    // character's own echo, one fixed set each.
    'Jinhsi': 'Frosty Resolve',
    'Changli': 'Frosty Resolve',
    'Calcharo': 'Frosty Resolve',
    'Shorekeeper': 'Frosty Resolve',
    'Camellya': 'Frosty Resolve',
    'Carlotta': 'Frosty Resolve',
    'Roccia': 'Frosty Resolve',
    'Brant': 'Frosty Resolve',
    'Cantarella': 'Frosty Resolve',
    'Zani': 'Frosty Resolve',
    'Cartethyia': 'Frosty Resolve',
    'Phoebe': 'Frosty Resolve',

    // Newer-content echoes (the 18 sets added 2026-07-12) — same source/
    // methodology as above.
    'Lioness of Glory': 'Flaming Clawprint',
    'Sigillum': 'Trailblazing Star',
    'Voidwing Moth': 'Reel of Spliced Memories',
    'Smiter': 'Song of Feathered Trace',
    'Smolder': 'Song of Feathered Trace',
    'Porcelain Picket': 'Lamp of Nether Road',
    'Stone Picket': 'Lamp of Nether Road',
    "Aureate Picket": "Heart of Evil's Purge",
    'The False Sovereign': 'Crown of Valor',
    'Lady of the Sea': 'Crown of Valor',
    'Nightmare: Hecate': 'Dream of the Lost',
    'Nightmare: Havoc Warrior': 'Dream of the Lost',
    'Nightmare: Glacio Predator': 'Dream of the Lost',
    'Nightmare: Tambourinist': 'Dream of the Lost',
    'Nightmare: Violet-Feathered Heron': 'Crown of Valor',
    'Nightmare: Cyan-Feathered Heron': 'Law of Harmony',
    'Nightmare: Electro Predator': 'Crown of Valor',
    'Nightmare: Aero Predator': 'Crown of Valor',
    'Nightmare: Gulpuff': 'Law of Harmony',
    'Nightmare: Chirpuff': 'Law of Harmony',
    'Nightmare: Viridblaze Saurian': "Flamewing's Shadow",
    'Nightmare: Baby Viridblaze Saurian': "Flamewing's Shadow",
    'Nightmare: Baby Roseshroom': "Flamewing's Shadow",
    'Nightmare: Tick Tack': 'Thread of Severed Fate',
    'Nightmare: Dwarf Cassowary': 'Thread of Severed Fate',
    'Nightmare: Roseshroom': 'Thread of Severed Fate',

    // Found in a 2026-07-12 completeness pass (previously missed — not a set
    // this app didn't model, just an oversight in earlier review rounds).
    'Thousand-Puppet Pavilion': 'Song of Feathered Trace',

    // "Main: Sub" compound-name boss/elite drops — confirmed via game8.co's
    // own echo pages (spot-checked "Chop Chop: Headless" and "Twin Nova:
    // Collapsar Blade" against a 2nd source; both matched encore.moe's
    // set/cost data exactly) that the colon is real in-game display text,
    // not wiki-only punctuation. Only reachable by OCR after the
    // `namePattern` fix that added compound-name support — see that file's
    // comment. Single-set (unambiguous) ones only; multi-set ones are below.
    'Fog Lionarch: Body': 'Song of Feathered Trace',
    'Fog Lionarch: Head': 'Song of Feathered Trace',
    'Kernel Puppet: Fright': 'Lamp of Nether Road',
    'Kernel Puppet: Grief': 'Lamp of Nether Road',
    'Kernel Puppet: Joy': 'Song of Feathered Trace',
    "Kernel Puppet: Anger": "Heart of Evil's Purge",
    "Kernel Puppet: Reflection": "Heart of Evil's Purge",
    "Kernel Puppet: Worry": "Heart of Evil's Purge",

    // "Reminiscence: X" is a real, distinct echo identity (confirmed via
    // game8.co/Fandom — "Reminiscence: Denia" etc. are the actual in-game
    // names, not a cosmetic prefix like "Phantom: "), same treatment as
    // "Nightmare: X". Single-set entries only; multi-set ones are below.
    'Reminiscence: Denia': 'Chromatic Foam',
    'Reminiscence: Threnodian - Voidborne Construct': 'Wishes of Quiet Snowfall',

    // Confirmed via game8.co's own "Jué" echo page (Celestial Light, Cost 4)
    // — the raw source data also has a SECOND, unrelated 1-cost "Jué" entry
    // (ambiguous Tidebreaking Courage/Empyrean Anthem) with no corroboration
    // anywhere else; treated as a data-entry error in that source (a
    // mislabeled fodder mob), not a real second echo sharing this name.
    'Jué': 'Celestial Light',

    // Confirmed real by the user (2026-07-13) — a 2-level compound name in
    // the reverse order from "Reminiscence: Threnodian - X" (hyphen before
    // colon), which prompted generalizing `COMPOUND_SEP` to allow either
    // separator at each level instead of hardcoding one specific order.
    'Reminiscence - Nightmare: Adam Smasher': 'Shadow of Shattered Dreams',
};

/**
 * Echoes that can legitimately carry MORE THAN ONE sonata set — most
 * "fodder"/world-mob echoes fall here (see the header comment above): this
 * specific copy's set depends on how the player configured it, so the name
 * genuinely can't identify a single answer. Rather than leave these as a
 * generic "couldn't be determined" (`ocrMapping.ts`), the OCR confirm flow
 * uses this to show the REAL short list of sets this exact echo could be,
 * so picking the right one manually is a quick choice instead of a blind
 * search through the whole catalog.
 *
 * Same source/date/methodology as `WW_ECHO_NAME_TO_SET` above — every entry
 * here is a real `FetterGroups` list from `api.encore.moe/en/echo`, filtered
 * to only the sets this app's catalog actually models (an echo ambiguous
 * between a cataloged and an uncataloged set would silently show only the
 * cataloged one as an option; that's a real gap, not a bug — see
 * [[ww-second-source-recheck]] for the newer-set coverage this catalog is
 * still missing). Entries whose real name can't be fully captured by
 * `namePattern` yet (compound colon/hyphen-separated names like "Chop Chop:
 * Headless" or "Twin Nova: Collapsar Blade") are deliberately left out —
 * see [[ww-echo-ambiguous-sets]] for the full skip list.
 */
export const WW_ECHO_AMBIGUOUS_SETS: Record<string, string[]> = {
    'Abyssal Gladius': ['Tidebreaking Courage', 'Midnight Veil', 'Thread of Severed Fate'],
    'Abyssal Mercator': ['Frosty Resolve', 'Eternal Radiance'],
    'Abyssal Patricius': ['Empyrean Anthem', 'Frosty Resolve'],
    'Aero Drake': ['Gusts of Welkin', 'Tidebreaking Courage', 'Flaming Clawprint'],
    'Aero Predator': ['Void Thunder', 'Sierra Gale'],
    'Aero Prism': ['Eternal Radiance', 'Tidebreaking Courage'],
    'Autopuppet Scout': ['Celestial Light', 'Freezing Frost'],
    'Baby Roseshroom': ['Sierra Gale', 'Havoc Eclipse'],
    'Baby Viridblaze Saurian': ['Lingering Tunes', 'Void Thunder', 'Molten Rift'],
    'Bell-Borne Geochelone': ['Moonlit Clouds', 'Rejuvenating Glow'],
    'Calcified Junrock': ['Tidebreaking Courage', 'Empyrean Anthem', 'Crown of Valor'],
    'Capitaneus': ['Gusts of Welkin', 'Eternal Radiance', 'Windward Pilgrimage'],
    'Carapace': ['Moonlit Clouds', 'Sierra Gale'],
    'Chasm Guardian': ['Lingering Tunes', 'Rejuvenating Glow'],
    'Chest Mimic': ['Midnight Veil', 'Empyrean Anthem', 'Frosty Resolve'],
    'Chirpuff': ['Havoc Eclipse', 'Sierra Gale'],
    'Chop Chop': ['Tidebreaking Courage', 'Empyrean Anthem', 'Dream of the Lost'],
    'Clang Bang': ['Celestial Light', 'Freezing Frost'],
    'Corrosaurus': ['Flaming Clawprint', "Flamewing's Shadow"],
    'Cruisewing': ['Rejuvenating Glow', 'Moonlit Clouds', 'Celestial Light'],
    'Cuddle Wuddle': ['Molten Rift', 'Void Thunder', 'Midnight Veil', 'Frosty Resolve'],
    'Cyan-Feathered Heron': ['Sierra Gale', 'Celestial Light'],
    "Devotee's Flesh": ['Gusts of Welkin', 'Windward Pilgrimage', 'Flaming Clawprint'],
    'Diamondclaw': ['Moonlit Clouds', 'Lingering Tunes'],
    'Diggy Duggy': ['Eternal Radiance', 'Tidebreaking Courage'],
    'Diurnus Knight': ['Eternal Radiance', 'Tidebreaking Courage'],
    'Dwarf Cassowary': ['Sierra Gale', 'Rejuvenating Glow'],
    'Electro Drake': ['Gusts of Welkin', 'Midnight Veil', 'Flaming Clawprint'],
    'Electro Predator': ['Molten Rift', 'Void Thunder'],
    'Excarat': ['Freezing Frost', 'Havoc Eclipse'],
    'Fae Ignis': ['Midnight Veil', 'Eternal Radiance', 'Dream of the Lost'],
    'Fission Junrock': ['Moonlit Clouds', 'Void Thunder', 'Rejuvenating Glow'],
    'Flautist': ['Lingering Tunes', 'Void Thunder'],
    'Flora Drone': ['Pact of Neonlight Leap', 'Rite of Gilded Revelation', 'Sound of True Name', 'Reel of Spliced Memories'],
    'Flora Reindeer': ['Rite of Gilded Revelation', 'Reel of Spliced Memories'],
    'Fog Lionarch': ['Song of Feathered Trace', "Heart of Evil's Purge", 'Lamp of Nether Road'],
    'Forbidden Bastion': ['Song of Feathered Trace', "Heart of Evil's Purge", 'Lamp of Nether Road'],
    'Frostbite Coleoid': ['Halo of Starry Radiance', 'Wishes of Quiet Snowfall'],
    'Frostscourge Stalker': ['Midnight Veil', 'Eternal Radiance'],
    'Fusion Drake': ['Flaming Clawprint', 'Windward Pilgrimage'],
    'Fusion Dreadmane': ['Rejuvenating Glow', 'Molten Rift'],
    'Fusion Prism': ['Freezing Frost', 'Lingering Tunes', 'Molten Rift'],
    'Fusion Warrior': ['Sierra Gale', 'Void Thunder', 'Molten Rift'],
    'Galescourge Stalker': ['Frosty Resolve', 'Empyrean Anthem'],
    'Glacio Drake': ['Gusts of Welkin', 'Windward Pilgrimage'],
    'Glacio Dreadmane': ['Moonlit Clouds', 'Freezing Frost'],
    'Glacio Predator': ['Celestial Light', 'Freezing Frost'],
    'Glacio Prism': ['Havoc Eclipse', 'Moonlit Clouds', 'Freezing Frost'],
    'Glommoth': ['Trailblazing Star', 'Wishes of Quiet Snowfall'],
    'Golden Junrock': ['Eternal Radiance', 'Frosty Resolve', 'Law of Harmony'],
    'Gulpuff': ['Celestial Light', 'Freezing Frost'],
    'Havoc Drake': ['Flaming Clawprint', 'Windward Pilgrimage', 'Thread of Severed Fate'],
    'Havoc Dreadmane': ['Molten Rift', 'Havoc Eclipse'],
    'Havoc Prism': ['Void Thunder', 'Celestial Light', 'Havoc Eclipse'],
    'Havoc Warrior': ['Celestial Light', 'Havoc Eclipse'],
    'Hoartoise': ['Celestial Light', 'Freezing Frost', 'Frosty Resolve', 'Empyrean Anthem'],
    'Hocus Pocus': ['Frosty Resolve', 'Empyrean Anthem'],
    'Hoochief': ['Rejuvenating Glow', 'Sierra Gale'],
    'Hooscamp': ['Lingering Tunes', 'Sierra Gale'],
    'Hurriclaw': ['Tidebreaking Courage', 'Gusts of Welkin', 'Crown of Valor'],
    'Hyvatia': ['Pact of Neonlight Leap', 'Rite of Gilded Revelation'],
    'Iceglint Dancer': ['Trailblazing Star', 'Wishes of Quiet Snowfall', 'Reel of Spliced Memories'],
    'Ironhoof': ['Pact of Neonlight Leap', 'Wishes of Quiet Snowfall', 'Reel of Spliced Memories'],
    'Kerasaur': ['Windward Pilgrimage', 'Flaming Clawprint', "Flamewing's Shadow"],
    'Kronablight': ['Trailblazing Star', 'Chromatic Foam'],
    'La Guardia': ['Gusts of Welkin', 'Midnight Veil', 'Flaming Clawprint'],
    'Lava Larva': ['Lingering Tunes', 'Molten Rift'],
    'Lightcrusher': ['Celestial Light', 'Havoc Eclipse'],
    'Lottie Lost': ['Moonlit Clouds', 'Lingering Tunes', 'Celestial Light'],
    'Lumiscale Construct': ['Void Thunder', 'Freezing Frost'],
    'Mining Drone': ['Halo of Starry Radiance', 'Rite of Gilded Revelation', 'Sound of True Name', 'Reel of Spliced Memories'],
    'Mining Reindeer': ['Pact of Neonlight Leap', 'Reel of Spliced Memories'],
    'Nameless Explorer': ['Sound of True Name', 'Reel of Spliced Memories'],
    'Nimbus Wraith': ['Empyrean Anthem', 'Midnight Veil', "Flamewing's Shadow"],
    'Nocturnus Knight': ['Midnight Veil', 'Empyrean Anthem'],
    "Pilgrim's Shell": ['Windward Pilgrimage', 'Flaming Clawprint'],
    'Questless Knight': ['Frosty Resolve', 'Midnight Veil', 'Molten Rift', 'Void Thunder'],
    'Reactor Husk': ['Halo of Starry Radiance', 'Chromatic Foam'],
    'Rocksteady Guardian': ['Rejuvenating Glow', 'Celestial Light', 'Frosty Resolve'],
    'Roseshroom': ['Freezing Frost', 'Havoc Eclipse'],
    'Sabercat Prowler': ['Pact of Neonlight Leap', 'Halo of Starry Radiance', 'Sound of True Name'],
    'Sabercat Reaver': ['Pact of Neonlight Leap', 'Halo of Starry Radiance', 'Sound of True Name'],
    'Sabyr Boar': ['Moonlit Clouds', 'Sierra Gale', 'Freezing Frost'],
    'Sacerdos': ['Gusts of Welkin', 'Windward Pilgrimage'],
    'Sagittario': ['Gusts of Welkin', 'Eternal Radiance', 'Flaming Clawprint'],
    'Sentry Construct': ['Frosty Resolve', 'Void Thunder'],
    'Shadow Stepper': ['Trailblazing Star', 'Chromatic Foam', 'Wishes of Quiet Snowfall'],
    'Snip Snap': ['Lingering Tunes', 'Rejuvenating Glow', 'Molten Rift'],
    'Spacetrek Explorer': ['Halo of Starry Radiance', 'Chromatic Foam', 'Sound of True Name'],
    'Spearback': ['Lingering Tunes', 'Moonlit Clouds'],
    'Spectro Drake': ['Flaming Clawprint', 'Windward Pilgrimage'],
    'Spectro Prism': ['Molten Rift', 'Void Thunder', 'Celestial Light'],
    'Stonewall Bracer': ['Rejuvenating Glow', 'Moonlit Clouds'],
    'Tambourinist': ['Freezing Frost', 'Havoc Eclipse'],
    'Tempest Mephis': ['Void Thunder', 'Empyrean Anthem'],
    'Nightmare: Tempest Mephis': ['Void Thunder', 'Empyrean Anthem'],
    'Tick Tack': ['Lingering Tunes', 'Rejuvenating Glow', 'Havoc Eclipse', 'Celestial Light', 'Freezing Frost'],
    'Traffic Illuminator': ['Void Thunder', 'Sierra Gale', 'Molten Rift'],
    'Tremor Warrior': ['Halo of Starry Radiance', 'Chromatic Foam', 'Wishes of Quiet Snowfall'],
    'Vanguard Junrock': ['Rejuvenating Glow', 'Void Thunder', 'Lingering Tunes'],
    'Violet-Feathered Heron': ['Molten Rift', 'Void Thunder'],
    'Viridblaze Saurian': ['Moonlit Clouds', 'Molten Rift'],
    'Vitreum Dancer': ['Empyrean Anthem', 'Eternal Radiance', 'Molten Rift', 'Void Thunder'],
    'Voltscourge Stalker': ['Empyrean Anthem', 'Midnight Veil'],
    'Whiff Whaff': ['Rejuvenating Glow', 'Moonlit Clouds', 'Sierra Gale'],
    'Windlash Coleoid': ['Rite of Gilded Revelation', 'Wishes of Quiet Snowfall'],
    'Zig Zag': ['Moonlit Clouds', 'Lingering Tunes', 'Celestial Light', 'Midnight Veil', 'Empyrean Anthem', 'Frosty Resolve'],
    'Zip Zap': ['Pact of Neonlight Leap', 'Rite of Gilded Revelation', 'Chromatic Foam', 'Sound of True Name'],

    // Found in a 2026-07-12 completeness pass (previously missed — not a set
    // this app didn't model, just an oversight in earlier review rounds).
    'Rage Against the Statue': ['Eternal Radiance', 'Gusts of Welkin', 'Law of Harmony'],
    'Nightmare: Kelpie': ['Gusts of Welkin', 'Windward Pilgrimage'],
    'Nightmare: Lampylumen Myriad': ['Frosty Resolve', 'Empyrean Anthem'],

    // "Main: Sub" compound-name multi-set drops — same sourcing/verification
    // as the unambiguous compound entries above.
    'Chop Chop: Headless': ['Eternal Radiance', 'Tidebreaking Courage'],
    'Chop Chop: Leftless': ['Frosty Resolve', 'Tidebreaking Courage'],
    'Chop Chop: Rightless': ['Tidebreaking Courage', 'Frosty Resolve'],
    'Myriad Snare: Rustfire Chassis': ["Heart of Evil's Purge", 'Lamp of Nether Road'],
    'Twin Nova: Collapsar Blade': ['Rite of Gilded Revelation', 'Trailblazing Star', 'Sound of True Name'],
    'Twin Nova: Nebulous Cannon': ['Rite of Gilded Revelation', 'Chromatic Foam'],
    'Reminiscence: Fenrico': ['Dream of the Lost', 'Law of Harmony'],
    'Reminiscence: Fleurdelys': ['Gusts of Welkin', 'Windward Pilgrimage'],
    'Reminiscence: Kronaclaw': ['Trailblazing Star', 'Chromatic Foam'],
    'Reminiscence: Threnodian - Leviathan': ["Flamewing's Shadow", 'Thread of Severed Fate'],

    // Confirmed real (not a debug/unreleased placeholder) via game8.co's own
    // echo page, matching encore.moe's set/cost data exactly. Included here
    // for the manual Add Echo picker even though real OCR still can't reach
    // it — "S4" has no lowercase letter after its capital, which `NAME_WORD`
    // requires; a digit-tolerant name word is a bigger, riskier regex change
    // for the sake of this one name, not worth it yet.
    'Geospider S4': ['Pact of Neonlight Leap', 'Halo of Starry Radiance', 'Trailblazing Star'],
};

/**
 * Echo COST (1/3/4), keyed the same way as the two maps above. Sourced from
 * `api.encore.moe/en/echo`'s `Rarity` field (0-3 internal scale, NOT the
 * in-game star rating), which maps to real in-game cost as
 * `{0: 1, 1: 3, 2: 4, 3: 4}` — verified against `game8.co`'s "Elite"
 * (cost 3) / "Overlord"+"Calamity" (cost 4) echo listings, which agreed on
 * every name checked (Thundering Mephis, Tempest Mephis, Crownless, Mourning
 * Aix, Impermanence Heron, Dreamless, Hecate, Jué, Diurnus Knight, Capitaneus
 * all matched exactly). Cost is also directly OCR-readable from the actual
 * screenshot (see `costPattern` in `OcrRules`) — this map exists for the
 * MANUAL add flow, where there's no screenshot to read it from.
 *
 * A cost value is an array because a small number of names are, in the raw
 * source data, genuinely reused across two DIFFERENT real entities with
 * different cost tiers (same phenomenon as the multi-set ambiguity above,
 * just on the cost axis instead): 'Flautist' and 'Gulpuff' each have two
 * distinct raw entries at different `Rarity` values. Everything else here
 * has exactly one array element. (An earlier pass kept no-colon
 * 'Nightmare Inferno Rider'/'Nightmare Crownless' fallback keys alongside
 * their real colon'd counterparts, as an OCR-safety net for a regex that
 * couldn't yet capture past a colon — once that regex was fixed to capture
 * "Main: Sub" names in full, the no-colon keys became pure duplicates of the
 * same real entity and were removed, since they also showed up as literal
 * duplicate entries in the manual Add Echo picker. An earlier pass also
 * inferred a bare 'Kronaclaw' entry this same way — since corrected: once
 * the OCR regex could capture "Main: Sub" compound names in full, it became
 * clear the real, unprefixed in-game name IS "Reminiscence: Kronaclaw" — see
 * that entry below, not a bare "Kronaclaw".)
 */
export const WW_ECHO_COSTS: Record<string, number[]> = {
    'Thundering Mephis': [4],
    'Nightmare: Thundering Mephis': [4],
    'Inferno Rider': [4],
    'Nightmare: Inferno Rider': [4],
    'Lampylumen Myriad': [4],
    'Crownless': [4],
    'Nightmare: Crownless': [4],
    'Mourning Aix': [4],
    'Nightmare: Mourning Aix': [4],
    'Impermanence Heron': [4],
    'Nightmare: Impermanence Heron': [4],
    'Nightmare: Feilian Beringal': [4],
    'Hecate': [4],
    'Dragon of Dirge': [4],
    'Fallacy of No Return': [4],
    'Mech Abomination': [4],
    'Lorelei': [4],
    'Jinhsi': [4],
    'Changli': [4],
    'Calcharo': [4],
    'Shorekeeper': [4],
    'Camellya': [4],
    'Carlotta': [4],
    'Roccia': [4],
    'Brant': [4],
    'Cantarella': [4],
    'Zani': [4],
    'Cartethyia': [4],
    'Phoebe': [4],
    'Lioness of Glory': [4],
    'Sigillum': [4],
    'Voidwing Moth': [3],
    'Smiter': [1],
    'Smolder': [1],
    'Porcelain Picket': [1],
    'Stone Picket': [1],
    'Aureate Picket': [1],
    'The False Sovereign': [4],
    'Lady of the Sea': [4],
    'Nightmare: Hecate': [4],
    'Nightmare: Havoc Warrior': [1],
    'Nightmare: Glacio Predator': [1],
    'Nightmare: Tambourinist': [3],
    'Nightmare: Violet-Feathered Heron': [3],
    'Nightmare: Cyan-Feathered Heron': [3],
    'Nightmare: Electro Predator': [1],
    'Nightmare: Aero Predator': [1],
    'Nightmare: Gulpuff': [1],
    'Nightmare: Chirpuff': [1],
    'Nightmare: Viridblaze Saurian': [3],
    'Nightmare: Baby Viridblaze Saurian': [1],
    'Nightmare: Baby Roseshroom': [1],
    'Nightmare: Tick Tack': [1],
    'Nightmare: Dwarf Cassowary': [1],
    'Nightmare: Roseshroom': [3],
    'Thousand-Puppet Pavilion': [4],
    'Nightmare: Kelpie': [4],
    'Nightmare: Lampylumen Myriad': [4],
    'Nightmare: Tempest Mephis': [4],
    'Fog Lionarch: Body': [1],
    'Fog Lionarch: Head': [1],
    'Kernel Puppet: Fright': [1],
    'Kernel Puppet: Grief': [1],
    'Kernel Puppet: Joy': [1],
    'Kernel Puppet: Anger': [1],
    'Kernel Puppet: Reflection': [1],
    'Kernel Puppet: Worry': [1],
    'Chop Chop: Headless': [1],
    'Chop Chop: Leftless': [1],
    'Chop Chop: Rightless': [1],
    'Myriad Snare: Rustfire Chassis': [4],
    'Twin Nova: Collapsar Blade': [3],
    'Twin Nova: Nebulous Cannon': [3],
    'Reminiscence: Denia': [4],
    'Reminiscence: Threnodian - Voidborne Construct': [4],
    'Reminiscence: Fenrico': [4],
    'Reminiscence: Fleurdelys': [4],
    'Reminiscence: Kronaclaw': [3],
    'Reminiscence: Threnodian - Leviathan': [4],
    'Jué': [4],
    'Geospider S4': [1],
    'Reminiscence - Nightmare: Adam Smasher': [4],

    'Abyssal Gladius': [3],
    'Abyssal Mercator': [3],
    'Abyssal Patricius': [3],
    'Aero Drake': [1],
    'Aero Predator': [1],
    'Aero Prism': [1],
    'Autopuppet Scout': [3],
    'Baby Roseshroom': [1],
    'Baby Viridblaze Saurian': [1],
    'Bell-Borne Geochelone': [4],
    'Calcified Junrock': [1],
    'Capitaneus': [3],
    'Carapace': [3],
    'Chasm Guardian': [3],
    'Chest Mimic': [1],
    'Chirpuff': [1],
    'Chop Chop': [3],
    'Clang Bang': [1],
    'Corrosaurus': [3],
    'Cruisewing': [1],
    'Cuddle Wuddle': [3],
    'Cyan-Feathered Heron': [3],
    "Devotee's Flesh": [1],
    'Diamondclaw': [1],
    'Diggy Duggy': [1],
    'Diurnus Knight': [3],
    'Dreamless': [4],
    'Dwarf Cassowary': [1],
    'Electro Drake': [1],
    'Electro Predator': [1],
    'Excarat': [1],
    'Fae Ignis': [1],
    'Feilian Beringal': [4],
    'Fission Junrock': [1],
    'Flautist': [1, 3],
    'Flora Drone': [1],
    'Flora Reindeer': [3],
    'Fog Lionarch': [3],
    'Forbidden Bastion': [3],
    'Frostbite Coleoid': [3],
    'Frostscourge Stalker': [1],
    'Fusion Drake': [1],
    'Fusion Dreadmane': [1],
    'Fusion Prism': [1],
    'Fusion Warrior': [1],
    'Galescourge Stalker': [1],
    'Glacio Drake': [1],
    'Glacio Dreadmane': [3],
    'Glacio Predator': [1],
    'Glacio Prism': [1],
    'Glommoth': [3],
    'Golden Junrock': [1],
    'Gulpuff': [1, 4],
    'Havoc Drake': [1],
    'Havoc Dreadmane': [3],
    'Havoc Prism': [1],
    'Havoc Warrior': [1],
    'Hoartoise': [1],
    'Hocus Pocus': [1],
    'Hoochief': [3],
    'Hooscamp': [1],
    'Hurriclaw': [3],
    'Hyvatia': [4],
    'Iceglint Dancer': [1],
    'Ironhoof': [3],
    'Kerasaur': [3],
    'Kronablight': [3],
    'La Guardia': [1],
    'Lava Larva': [1],
    'Lightcrusher': [3],
    'Lottie Lost': [1],
    'Lumiscale Construct': [3],
    'Mining Drone': [1],
    'Mining Reindeer': [3],
    'Nameless Explorer': [4],
    'Nimbus Wraith': [1],
    'Nocturnus Knight': [3],
    "Pilgrim's Shell": [3],
    'Questless Knight': [3],
    'Reactor Husk': [4],
    'Rocksteady Guardian': [3],
    'Roseshroom': [3],
    'Sabercat Prowler': [3],
    'Sabercat Reaver': [3],
    'Sabyr Boar': [1],
    'Sacerdos': [1],
    'Sagittario': [1],
    'Sentry Construct': [4],
    'Shadow Stepper': [1],
    'Snip Snap': [1],
    'Spacetrek Explorer': [3],
    'Spearback': [3],
    'Spectro Drake': [1],
    'Spectro Prism': [1],
    'Stonewall Bracer': [3],
    'Tambourinist': [3],
    'Tempest Mephis': [4],
    'Tick Tack': [1],
    'Traffic Illuminator': [1],
    'Tremor Warrior': [1],
    'Vanguard Junrock': [1],
    'Violet-Feathered Heron': [3],
    'Viridblaze Saurian': [3],
    'Vitreum Dancer': [3],
    'Voltscourge Stalker': [1],
    'Whiff Whaff': [1],
    'Windlash Coleoid': [3],
    'Zig Zag': [1],
    'Zip Zap': [1],
    'Rage Against the Statue': [3],
};

/** A single, specific WW echo entity: its real name plus every cost/set
 * combination it can legitimately have. Built by merging `WW_ECHO_NAME_TO_SET`
 * / `WW_ECHO_AMBIGUOUS_SETS` (sets) with `WW_ECHO_COSTS` (cost) above — the
 * single source of truth for the Cost -> Set -> Echo picker used by both the
 * manual "Add echo" flow and the OCR confirm-and-add flow. Every entry here
 * is real, sourced data; nothing is guessed. */
export interface WwEchoCatalogEntry {
    name: string;
    costs: number[];
    sets: string[];
}

export const WW_ECHO_CATALOG: WwEchoCatalogEntry[] = Object.keys(WW_ECHO_COSTS).map((name) => ({
    name,
    costs: WW_ECHO_COSTS[name],
    sets: WW_ECHO_NAME_TO_SET[name] ? [WW_ECHO_NAME_TO_SET[name]] : (WW_ECHO_AMBIGUOUS_SETS[name] ?? []),
}));

/**
 * A specific named echo's OWN item art (the creature/boss render shown for
 * that entity), as opposed to its Sonata Set's badge icon (see
 * `gear-catalogs.ts`'s `sets[].icon`, a separate 34-entry set). Sourced
 * 2026-07-16 from game8.co's "List of All Echoes" page (encore.moe's echo
 * API was tried first but reused the SAME icon for several genuinely
 * different echoes — e.g. Hecate/Tempest Mephis, Chest Mimic/Zig Zag — so it
 * was dropped in favor of game8, whose 178 matched icons were confirmed to
 * have zero duplicate URLs among them). 12 of the 190 catalogued names have
 * no entry here — the "Illusive" echoes named after playable characters
 * (Jinhsi, Changli, Calcharo, Shorekeeper, Camellya, Carlotta, Roccia,
 * Brant, Cantarella, Zani, Cartethyia, Phoebe) — neither game8 nor
 * prydwen.gg list them as standalone echo entries, and encore.moe's one
 * icon for all 12 (also reused for the unrelated Sentry Construct) failed
 * the same duplicate-icon check, so nothing was guessed for them; they fall
 * back to their Sonata Set's badge icon, same as before this table existed.
 * Looked up dynamically by name (see `echoItemIconFor` in
 * `src/renderer/src/data/gameData.ts`), not baked into `GearEntry` at
 * instance-creation time, so it applies retroactively to already-owned gear.
 */
export const WW_ECHO_ITEM_ICONS: Record<string, string> = {
    "Thundering Mephis": "icons/echo-items/thundering-mephis.webp",
    "Nightmare: Thundering Mephis": "icons/echo-items/nightmare-thundering-mephis.webp",
    "Inferno Rider": "icons/echo-items/inferno-rider.webp",
    "Nightmare: Inferno Rider": "icons/echo-items/nightmare-inferno-rider.webp",
    "Lampylumen Myriad": "icons/echo-items/lampylumen-myriad.webp",
    "Crownless": "icons/echo-items/crownless.webp",
    "Nightmare: Crownless": "icons/echo-items/nightmare-crownless.webp",
    "Mourning Aix": "icons/echo-items/mourning-aix.webp",
    "Nightmare: Mourning Aix": "icons/echo-items/nightmare-mourning-aix.webp",
    "Impermanence Heron": "icons/echo-items/impermanence-heron.webp",
    "Nightmare: Impermanence Heron": "icons/echo-items/nightmare-impermanence-heron.webp",
    "Nightmare: Feilian Beringal": "icons/echo-items/nightmare-feilian-beringal.webp",
    "Hecate": "icons/echo-items/hecate.webp",
    "Dragon of Dirge": "icons/echo-items/dragon-of-dirge.webp",
    "Fallacy of No Return": "icons/echo-items/fallacy-of-no-return.webp",
    "Mech Abomination": "icons/echo-items/mech-abomination.webp",
    "Lorelei": "icons/echo-items/lorelei.webp",
    "Lioness of Glory": "icons/echo-items/lioness-of-glory.webp",
    "Sigillum": "icons/echo-items/sigillum.webp",
    "Voidwing Moth": "icons/echo-items/voidwing-moth.webp",
    "Smiter": "icons/echo-items/smiter.webp",
    "Smolder": "icons/echo-items/smolder.webp",
    "Porcelain Picket": "icons/echo-items/porcelain-picket.webp",
    "Stone Picket": "icons/echo-items/stone-picket.webp",
    "Aureate Picket": "icons/echo-items/aureate-picket.webp",
    "The False Sovereign": "icons/echo-items/the-false-sovereign.webp",
    "Lady of the Sea": "icons/echo-items/lady-of-the-sea.webp",
    "Nightmare: Hecate": "icons/echo-items/nightmare-hecate.webp",
    "Nightmare: Havoc Warrior": "icons/echo-items/nightmare-havoc-warrior.webp",
    "Nightmare: Glacio Predator": "icons/echo-items/nightmare-glacio-predator.webp",
    "Nightmare: Tambourinist": "icons/echo-items/nightmare-tambourinist.webp",
    "Nightmare: Violet-Feathered Heron": "icons/echo-items/nightmare-violet-feathered-heron.webp",
    "Nightmare: Cyan-Feathered Heron": "icons/echo-items/nightmare-cyan-feathered-heron.webp",
    "Nightmare: Electro Predator": "icons/echo-items/nightmare-electro-predator.webp",
    "Nightmare: Aero Predator": "icons/echo-items/nightmare-aero-predator.webp",
    "Nightmare: Gulpuff": "icons/echo-items/nightmare-gulpuff.webp",
    "Nightmare: Chirpuff": "icons/echo-items/nightmare-chirpuff.webp",
    "Nightmare: Viridblaze Saurian": "icons/echo-items/nightmare-viridblaze-saurian.webp",
    "Nightmare: Baby Viridblaze Saurian": "icons/echo-items/nightmare-baby-viridblaze-saurian.webp",
    "Nightmare: Baby Roseshroom": "icons/echo-items/nightmare-baby-roseshroom.webp",
    "Nightmare: Tick Tack": "icons/echo-items/nightmare-tick-tack.webp",
    "Nightmare: Dwarf Cassowary": "icons/echo-items/nightmare-dwarf-cassowary.webp",
    "Nightmare: Roseshroom": "icons/echo-items/nightmare-roseshroom.webp",
    "Thousand-Puppet Pavilion": "icons/echo-items/thousand-puppet-pavilion.webp",
    "Nightmare: Kelpie": "icons/echo-items/nightmare-kelpie.webp",
    "Nightmare: Lampylumen Myriad": "icons/echo-items/nightmare-lampylumen-myriad.webp",
    "Nightmare: Tempest Mephis": "icons/echo-items/nightmare-tempest-mephis.webp",
    "Fog Lionarch: Body": "icons/echo-items/fog-lionarch-body.webp",
    "Fog Lionarch: Head": "icons/echo-items/fog-lionarch-head.webp",
    "Kernel Puppet: Fright": "icons/echo-items/kernel-puppet-fright.webp",
    "Kernel Puppet: Grief": "icons/echo-items/kernel-puppet-grief.webp",
    "Kernel Puppet: Joy": "icons/echo-items/kernel-puppet-joy.webp",
    "Kernel Puppet: Anger": "icons/echo-items/kernel-puppet-anger.webp",
    "Kernel Puppet: Reflection": "icons/echo-items/kernel-puppet-reflection.webp",
    "Kernel Puppet: Worry": "icons/echo-items/kernel-puppet-worry.webp",
    "Chop Chop: Headless": "icons/echo-items/chop-chop-headless.webp",
    "Chop Chop: Leftless": "icons/echo-items/chop-chop-leftless.webp",
    "Chop Chop: Rightless": "icons/echo-items/chop-chop-rightless.webp",
    "Myriad Snare: Rustfire Chassis": "icons/echo-items/myriad-snare-rustfire-chassis.webp",
    "Twin Nova: Collapsar Blade": "icons/echo-items/twin-nova-collapsar-blade.webp",
    "Twin Nova: Nebulous Cannon": "icons/echo-items/twin-nova-nebulous-cannon.webp",
    "Reminiscence: Denia": "icons/echo-items/reminiscence-denia.webp",
    "Reminiscence: Threnodian - Voidborne Construct": "icons/echo-items/reminiscence-threnodian-voidborne-construct.webp",
    "Reminiscence: Fenrico": "icons/echo-items/reminiscence-fenrico.webp",
    "Reminiscence: Fleurdelys": "icons/echo-items/reminiscence-fleurdelys.webp",
    "Reminiscence: Kronaclaw": "icons/echo-items/reminiscence-kronaclaw.webp",
    "Reminiscence: Threnodian - Leviathan": "icons/echo-items/reminiscence-threnodian-leviathan.webp",
    "Jué": "icons/echo-items/ju.webp",
    "Geospider S4": "icons/echo-items/geospider-s4.webp",
    "Reminiscence - Nightmare: Adam Smasher": "icons/echo-items/reminiscence-nightmare-adam-smasher.webp",
    "Abyssal Gladius": "icons/echo-items/abyssal-gladius.webp",
    "Abyssal Mercator": "icons/echo-items/abyssal-mercator.webp",
    "Abyssal Patricius": "icons/echo-items/abyssal-patricius.webp",
    "Aero Drake": "icons/echo-items/aero-drake.webp",
    "Aero Predator": "icons/echo-items/aero-predator.webp",
    "Aero Prism": "icons/echo-items/aero-prism.webp",
    "Autopuppet Scout": "icons/echo-items/autopuppet-scout.webp",
    "Baby Roseshroom": "icons/echo-items/baby-roseshroom.webp",
    "Baby Viridblaze Saurian": "icons/echo-items/baby-viridblaze-saurian.webp",
    "Bell-Borne Geochelone": "icons/echo-items/bell-borne-geochelone.webp",
    "Calcified Junrock": "icons/echo-items/calcified-junrock.webp",
    "Capitaneus": "icons/echo-items/capitaneus.webp",
    "Carapace": "icons/echo-items/carapace.webp",
    "Chasm Guardian": "icons/echo-items/chasm-guardian.webp",
    "Chest Mimic": "icons/echo-items/chest-mimic.webp",
    "Chirpuff": "icons/echo-items/chirpuff.webp",
    "Chop Chop": "icons/echo-items/chop-chop.webp",
    "Clang Bang": "icons/echo-items/clang-bang.webp",
    "Corrosaurus": "icons/echo-items/corrosaurus.webp",
    "Cruisewing": "icons/echo-items/cruisewing.webp",
    "Cuddle Wuddle": "icons/echo-items/cuddle-wuddle.webp",
    "Cyan-Feathered Heron": "icons/echo-items/cyan-feathered-heron.webp",
    "Diamondclaw": "icons/echo-items/diamondclaw.webp",
    "Diggy Duggy": "icons/echo-items/diggy-duggy.webp",
    "Diurnus Knight": "icons/echo-items/diurnus-knight.webp",
    "Dreamless": "icons/echo-items/dreamless.webp",
    "Dwarf Cassowary": "icons/echo-items/dwarf-cassowary.webp",
    "Electro Drake": "icons/echo-items/electro-drake.webp",
    "Electro Predator": "icons/echo-items/electro-predator.webp",
    "Excarat": "icons/echo-items/excarat.webp",
    "Fae Ignis": "icons/echo-items/fae-ignis.webp",
    "Feilian Beringal": "icons/echo-items/feilian-beringal.webp",
    "Fission Junrock": "icons/echo-items/fission-junrock.webp",
    "Flautist": "icons/echo-items/flautist.webp",
    "Flora Drone": "icons/echo-items/flora-drone.webp",
    "Flora Reindeer": "icons/echo-items/flora-reindeer.webp",
    "Fog Lionarch": "icons/echo-items/fog-lionarch.webp",
    "Forbidden Bastion": "icons/echo-items/forbidden-bastion.webp",
    "Frostbite Coleoid": "icons/echo-items/frostbite-coleoid.webp",
    "Frostscourge Stalker": "icons/echo-items/frostscourge-stalker.webp",
    "Fusion Drake": "icons/echo-items/fusion-drake.webp",
    "Fusion Dreadmane": "icons/echo-items/fusion-dreadmane.webp",
    "Fusion Prism": "icons/echo-items/fusion-prism.webp",
    "Fusion Warrior": "icons/echo-items/fusion-warrior.webp",
    "Galescourge Stalker": "icons/echo-items/galescourge-stalker.webp",
    "Glacio Drake": "icons/echo-items/glacio-drake.webp",
    "Glacio Dreadmane": "icons/echo-items/glacio-dreadmane.webp",
    "Glacio Predator": "icons/echo-items/glacio-predator.webp",
    "Glacio Prism": "icons/echo-items/glacio-prism.webp",
    "Glommoth": "icons/echo-items/glommoth.webp",
    "Golden Junrock": "icons/echo-items/golden-junrock.webp",
    "Gulpuff": "icons/echo-items/gulpuff.webp",
    "Havoc Drake": "icons/echo-items/havoc-drake.webp",
    "Havoc Dreadmane": "icons/echo-items/havoc-dreadmane.webp",
    "Havoc Prism": "icons/echo-items/havoc-prism.webp",
    "Havoc Warrior": "icons/echo-items/havoc-warrior.webp",
    "Hoartoise": "icons/echo-items/hoartoise.webp",
    "Hocus Pocus": "icons/echo-items/hocus-pocus.webp",
    "Hoochief": "icons/echo-items/hoochief.webp",
    "Hooscamp": "icons/echo-items/hooscamp.webp",
    "Hurriclaw": "icons/echo-items/hurriclaw.webp",
    "Hyvatia": "icons/echo-items/hyvatia.webp",
    "Iceglint Dancer": "icons/echo-items/iceglint-dancer.webp",
    "Ironhoof": "icons/echo-items/ironhoof.webp",
    "Kerasaur": "icons/echo-items/kerasaur.webp",
    "Kronablight": "icons/echo-items/kronablight.webp",
    "La Guardia": "icons/echo-items/la-guardia.webp",
    "Lava Larva": "icons/echo-items/lava-larva.webp",
    "Lightcrusher": "icons/echo-items/lightcrusher.webp",
    "Lottie Lost": "icons/echo-items/lottie-lost.webp",
    "Lumiscale Construct": "icons/echo-items/lumiscale-construct.webp",
    "Mining Drone": "icons/echo-items/mining-drone.webp",
    "Mining Reindeer": "icons/echo-items/mining-reindeer.webp",
    "Nameless Explorer": "icons/echo-items/nameless-explorer.webp",
    "Nimbus Wraith": "icons/echo-items/nimbus-wraith.webp",
    "Nocturnus Knight": "icons/echo-items/nocturnus-knight.webp",
    "Questless Knight": "icons/echo-items/questless-knight.webp",
    "Reactor Husk": "icons/echo-items/reactor-husk.webp",
    "Rocksteady Guardian": "icons/echo-items/rocksteady-guardian.webp",
    "Roseshroom": "icons/echo-items/roseshroom.webp",
    "Sabercat Prowler": "icons/echo-items/sabercat-prowler.webp",
    "Sabercat Reaver": "icons/echo-items/sabercat-reaver.webp",
    "Sabyr Boar": "icons/echo-items/sabyr-boar.webp",
    "Sacerdos": "icons/echo-items/sacerdos.webp",
    "Sagittario": "icons/echo-items/sagittario.webp",
    "Sentry Construct": "icons/echo-items/sentry-construct.webp",
    "Shadow Stepper": "icons/echo-items/shadow-stepper.webp",
    "Snip Snap": "icons/echo-items/snip-snap.webp",
    "Spacetrek Explorer": "icons/echo-items/spacetrek-explorer.webp",
    "Spearback": "icons/echo-items/spearback.webp",
    "Spectro Drake": "icons/echo-items/spectro-drake.webp",
    "Spectro Prism": "icons/echo-items/spectro-prism.webp",
    "Stonewall Bracer": "icons/echo-items/stonewall-bracer.webp",
    "Tambourinist": "icons/echo-items/tambourinist.webp",
    "Tempest Mephis": "icons/echo-items/tempest-mephis.webp",
    "Tick Tack": "icons/echo-items/tick-tack.webp",
    "Traffic Illuminator": "icons/echo-items/traffic-illuminator.webp",
    "Tremor Warrior": "icons/echo-items/tremor-warrior.webp",
    "Vanguard Junrock": "icons/echo-items/vanguard-junrock.webp",
    "Violet-Feathered Heron": "icons/echo-items/violet-feathered-heron.webp",
    "Viridblaze Saurian": "icons/echo-items/viridblaze-saurian.webp",
    "Vitreum Dancer": "icons/echo-items/vitreum-dancer.webp",
    "Voltscourge Stalker": "icons/echo-items/voltscourge-stalker.webp",
    "Whiff Whaff": "icons/echo-items/whiff-whaff.webp",
    "Windlash Coleoid": "icons/echo-items/windlash-coleoid.webp",
    "Zig Zag": "icons/echo-items/zig-zag.webp",
    "Zip Zap": "icons/echo-items/zip-zap.webp",
    "Rage Against the Statue": "icons/echo-items/rage-against-the-statue.webp",
};

/**
 * SELF buffs a specific named echo's own active "Echo Skill" grants the
 * wielder when triggered — distinct from its Sonata Set bonus. Looked up by
 * echo name (see `echoSelfBuffsFor` in `src/renderer/src/data/gameData.ts`),
 * same two-tier model as `WeaponEntry.selfBuffs`. Real, sourced examples only
 * — added 2026-07-16, sourced from game8.co (a lower rigor bar than this
 * project's usual encore.moe-direct standard for character kits, since this
 * app has no per-echo-skill API source). Research estimated this is a real
 * mechanic on roughly 15-20% of the ~167-echo catalog (~25-33 items); only
 * the 2 below have a confirmed exact percentage — the rest of that estimated
 * set (Bell-Borne Geochelone, Hyvatia, Glommoth, Spacetrek Explorer,
 * Impermanence Heron, and others not yet identified) are real but their
 * exact values weren't confirmed in this pass, so they're deliberately NOT
 * added rather than guessed — a follow-up sourcing pass could fill these in
 * the same way this table itself gets extended.
 *
 * Fallacy of No Return's value WAS confirmed in a 2026-07-16 re-audit
 * (game8.co): "Activating the Echo Skill grants the Resonator 10% Energy
 * Regen and all team members 10% ATK for 20s." Only the SELF (Energy Regen)
 * half is added below — the team-ATK half has no home in this schema (this
 * table models wielder-only self-buffs; echoes have no team-buff mechanism
 * the way weapons do), so it's left unmodeled rather than misrepresented.
 */
export const WW_ECHO_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; restrictedToCharacters?: string[] }>> = {
    'Lady of the Sea': [
        { stat: 'elemDmg', label: 'Aero DMG Bonus (Echo Skill)', value: 12, conditional: true },
        { stat: 'dmgBonus', label: 'Liberation DMG Bonus (Echo Skill)', value: 12, conditional: true, appliesTo: ['ult'] },
    ],
    'Fallacy of No Return': [
        { stat: 'energyRegen', label: 'Energy Regen (Echo Skill)', value: 10, conditional: true },
    ],
    'Jué': [
        { stat: 'dmgBonus', label: 'Res. Skill DMG Bonus (Echo Skill, "Blessing of Time")', value: 16, conditional: true, appliesTo: ['skill'] },
    ],
    // Main-slot bonus only — this echo ALSO unlocks a brand-new castable
    // Echo Skill move for Lucy/Rebecca specifically; that portion is a
    // separate, larger feature (a new skill, not a buff) and is
    // intentionally not modeled here. Sources: api.encore.moe/en/echo/6000201
    // Skill.DescriptionEx, cross-checked against wuthering.gg/echos/
    // reminiscence---nightmare-adam-smasher (both agree: 15% Crit Rate,
    // Lucy/Rebecca only).
    'Reminiscence - Nightmare: Adam Smasher': [
        { stat: 'critRate', label: 'Crit. Rate (Main Slot)', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] },
    ],
};
