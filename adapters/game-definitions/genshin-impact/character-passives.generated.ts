/**
 * @fileoverview Hand-curated GI character passive-talent self-buffs
 * @module adapters/game-definitions/genshin-impact/character-passives.generated
 *
 * SELF stat buffs from a character's OWN (non-weapon, non-constellation) passive
 * talents — e.g. Zhongli's "Dominance of Earth" (Normal/Charged/Plunge/Skill/Burst
 * DMG scaled by his own Max HP). Unlike weapons/constellations there is no
 * structured-vs-prose split to exploit; genshin-db's passive-talent text is prose
 * only, same as constellations, so this is a plain hand-authored table — see
 * scripts/curate-gi-character-passives.cjs for the curation methodology and
 * rejection categories (mirrors curate-gi-constellations.cjs).
 * DO NOT edit by hand — re-run scripts/curate-gi-character-passives.cjs.
 * 44 characters, 62 buff entries (last hand-updated 2026-07-30 as part of a
 * full-roster re-audit; the curation script's own count may be stale until
 * it's next re-run against this same data).
 */
import type { BuffEntry } from '@shared/types/game-bundle';

export const CHARACTER_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff'] }>> = {
    // Added 2026-07-11, GI character-passive re-verification vs gi.yatta.moe (full
    // 121-char roster) — see DATA_PROGRESS.md for methodology + rejection categories.
    "xilonen": [{"stat":"defPct","label":"DEF, 15s after nearby ally Nightsoul Burst (P2)","value":20,"conditional":true},{"stat":"dmgBonus","label":"Normal/Plunge DMG · while <2 modified Source Samples (P1, Netotiliztli's Echoes)","value":30,"conditional":true,"appliesTo":["normal","plunge"]}],
    "amber": [{"stat":"atkPct","label":"ATK, 10s after Aimed Shot weak-point hit (P2)","value":15,"conditional":true}],
    "razor": [{"stat":"energyRegen","label":"Energy Recharge, while Energy<50% (P2)","value":30,"conditional":true}],
    "xingqiu": [{"stat":"elemDmg","label":"Hydro DMG (P1)","value":20,"conditional":false}],
    // REMOVED 2026-07-30 — the previous entry here ("Pyro DMG +40%, while in
    // combat, P2") was fabricated: Arlecchino's real P2 ("Strength Alone Can
    // Defend") is a defensive +1% All-Elemental/Physical RES per 100 ATK
    // above 1,000 (capped 20% each) — a self-RES% effect this engine has no
    // stat primitive for yet (only `resShred`, which debuffs enemies, not a
    // self RES% buff). Left unmodeled rather than kept wrong — see roadmap.
    "sigewinne": [{"stat":"elemDmg","label":"Hydro DMG, 18s after Rebound Hydrotherapy (P1)","value":8,"conditional":true}],
    "iansan": [{"stat":"atkPct","label":"ATK, 15s after Swift Stormflight hit (P1)","value":20,"conditional":true}],
    "diluc": [{"stat":"elemDmg","label":"Pyro DMG · Dawn infusion active (P2)","value":20,"conditional":true}],
    "mona": [{"stat":"elemDmg","label":"Hydro DMG · 20% of own ER (P2)","value":12,"conditional":true,"scaleOff":{"sourceStat":"energyRegen","basis":"total","ratio":0.2}}],
    "keqing": [{"stat":"critRate","label":"Crit Rate · post-Starward-Sword (P2)","value":15,"conditional":true},{"stat":"energyRegen","label":"Energy Recharge · post-Starward-Sword (P2)","value":15,"conditional":true}],
    "zhongli": [{"stat":"flatDmgAdd","label":"Normal/Charged/Plunge DMG · flat add, 1.39% of own Max HP (P2)","value":200,"conditional":false,"appliesTo":["normal","charged","plunge"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.0139}},{"stat":"flatDmgAdd","label":"Skill DMG · flat add, 1.9% of own Max HP (P2)","value":280,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.019}},{"stat":"flatDmgAdd","label":"Burst DMG · flat add, 33% of own Max HP (P2)","value":4850,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.33}}],
    "xiao": [{"stat":"elemDmg","label":"DMG · max ramp, Bane of All Evil (P1)","value":25,"conditional":true},{"stat":"elemDmg","label":"Skill DMG · 3 stacks (P2)","value":45,"conditional":true,"appliesTo":["skill"]}],
    "hu_tao": [{"stat":"elemDmg","label":"Pyro DMG · HP<=50% (P2)","value":33,"conditional":true}],
    "yoimiya": [{"stat":"elemDmg","label":"Pyro DMG · max 10 stacks (P1)","value":20,"conditional":true}, {"stat":"dmgBonus","label":"Niwabi Enshou (NA DMG, Skill, lvl 10)","value":61.744,"conditional":true,"appliesTo":["normal"]}],
    "ayaka": [{"stat":"elemDmg","label":"Normal/Charged DMG · post-Burst (P1)","value":30,"conditional":true,"appliesTo":["normal","charged"]},{"stat":"elemDmg","label":"Cryo DMG · post-Skill-Cryo-application (P2)","value":18,"conditional":true}],
    "itto": [{"stat":"flatDmgAdd","label":"Charged DMG · flat add, 35% of own DEF, Arataki Kesagiri (P2)","value":280,"conditional":false,"appliesTo":["charged"],"scaleOff":{"sourceStat":"def","basis":"total","ratio":0.35}}],
    "yae_miko": [{"stat":"elemDmg","label":"Skill DMG · 0.15% per own EM point (P2)","value":15,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.15}}],
    "cyno": [{"stat":"flatDmgAdd","label":"Normal DMG · flat add, 150% of own EM, Pactsworn Pathclearer state (P2)","value":1500,"conditional":true,"appliesTo":["normal"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":1.5}},{"stat":"dmgBonus","label":"Secret Rite: Chasmic Soulfarer DMG +35%, Judication (P1, Featherfall Judgment)","value":35,"conditional":true,"appliesTo":["skill"]},{"stat":"flatDmgAdd","label":"Duststalker Bolt DMG · flat add, 250% of own EM (P1/P2)","value":2500,"conditional":true,"appliesTo":["skill_duststalker"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":2.5}}],
    "alhaitham": [{"stat":"elemDmg","label":"Skill/Burst DMG · 0.1% per own EM point, capped (P2)","value":100,"conditional":false,"appliesTo":["skill","ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.1,"cap":100}}],
    "baizhu": [{"stat":"elemDmg","label":"Dendro DMG · active character HP>=50% (P1)","value":25,"conditional":true}],
    "lyney": [{"stat":"elemDmg","label":"DMG · vs Pyro-affected, guaranteed portion (P2)","value":60,"conditional":true}],
    "neuvillette": [{"stat":"elemDmg","label":"Charged DMG · 3 stacks (P1)","value":60,"conditional":true,"appliesTo":["charged"]},{"stat":"elemDmg","label":"Hydro DMG · HP>=80% of Max, capped (P2)","value":30,"conditional":true}],
    "wriothesley": [{"stat":"atkPct","label":"ATK% · 5 stacks (P2)","value":30,"conditional":true}],
    "navia": [{"stat":"elemDmg","label":"Normal/Charged/Plunge DMG · Geo infusion active (P1)","value":40,"conditional":true,"appliesTo":["normal","charged","plunge"]},{"stat":"atkPct","label":"ATK% · 2 elemental teammates (P2)","value":40,"conditional":true}],
    "chiori": [{"stat":"elemDmg","label":"Geo DMG · post-ally-Geo-Construct (P2)","value":20,"conditional":true}],
    "clorinde": [{"stat":"flatDmgAdd","label":"Normal/Burst DMG · flat add, 60% of own ATK, capped (P1)","value":1800,"conditional":true,"appliesTo":["normal","ult"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.6,"cap":1800}},{"stat":"critRate","label":"Crit Rate · 2 stacks, Bond of Life (P2)","value":20,"conditional":true}],
    "emilie": [{"stat":"elemDmg","label":"DMG · vs Burning, 0.015% per own ATK point, capped (P2)","value":36,"conditional":true,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.015,"cap":36}}],
    "kinich": [{"stat":"flatDmgAdd","label":"Skill DMG · flat add, up to 640% of own ATK, 2 stacks, Scalespiker Cannon (P2)","value":6400,"conditional":true,"appliesTo":["skill"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":6.4}}],
    "mualani": [{"stat":"flatDmgAdd","label":"Burst DMG · flat add, 45% of own Max HP, 3 stacks (P2)","value":5500,"conditional":true,"appliesTo":["ult"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.45}}],
    "citlali": [{"stat":"flatDmgAdd","label":"Frostfall Storm DMG · flat add, 90% of own EM (P2)","value":900,"conditional":false,"appliesTo":["skill_frostfall"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.9}},{"stat":"flatDmgAdd","label":"Burst DMG · flat add, 1200% of own EM (P2)","value":12000,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":12}}],
    // FIXED 2026-07-25 — P2 "Kiongozi" ("...DMG that the CURRENT ACTIVE
    // PARTY MEMBER deals...") isn't self-only — it buffs whichever character
    // is active when it procs, including a teammate Mavuika swapped off for.
    // Moved to CHARACTER_TEAM_BUFFS below (value unchanged, 40% cap —
    // icy-veins/KQM, verified 2026-07-25).
    "mavuika": [{"stat":"atkPct","label":"ATK% · post-ally-Nightsoul-Burst (P1)","value":30,"conditional":true}],
    "yelan": [{"stat":"hpPct","label":"HP% · 4 elemental types (P1)","value":30,"conditional":true}],
    "aloy": [{"stat":"atkPct","label":"ATK% · post-Coil-effect (P1)","value":16,"conditional":true},{"stat":"elemDmg","label":"Cryo DMG · max ramp, Rushing Ice (P2)","value":35,"conditional":true}],
    "columbina": [{"stat":"critRate","label":"Crit Rate · 3 stacks (P1)","value":15,"conditional":true}],
    "flins": [{"stat":"elementalMastery","label":"EM · 8% of own ATK, capped (P2)","value":160,"conditional":false,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.08,"cap":160}}],
    "lohen": [{"stat":"atkPct","label":"ATK% · post-ally-Cryo-reaction, Masterstroke mode (P2)","value":15,"conditional":true}],
    "sandrone": [{"stat":"elementalMastery","label":"EM · 8% of own ATK, capped (P2)","value":160,"conditional":false,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.08,"cap":160}}],
    "tighnari": [{"stat":"elementalMastery","label":"EM · post-Wreath-Arrow (P1)","value":50,"conditional":true},{"stat":"elemDmg","label":"Charged/Burst DMG · 0.06% per own EM point, capped (P2)","value":60,"conditional":false,"appliesTo":["charged","ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.06,"cap":60}}],
    "varesa": [{"stat":"atkPct","label":"ATK% · post-ally-Nightsoul-Burst, 2 stacks (P2)","value":70,"conditional":true},{"stat":"flatDmgAdd","label":"Plunge ground-impact DMG · flat add, 50% of own ATK, Tag-Team Triple Jump! (P1)","value":500,"conditional":false,"appliesTo":["plunge"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.5}},{"stat":"flatDmgAdd","label":"Plunge ground-impact DMG · flat add, 180% of own ATK, Fiery Passion state (P1)","value":1800,"conditional":true,"appliesTo":["plunge"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":1.8}}],
    "zibai": [{"stat":"defPct","label":"DEF% · 3 other Geo teammates (P2)","value":45,"conditional":true},{"stat":"elementalMastery","label":"EM · 3 other Hydro teammates (P2)","value":180,"conditional":true},{"stat":"flatDmgAdd","label":"Spirit Steed's Stride (Hit 2) DMG · flat add, 60% of own DEF (P1, The Selenic Adeptus Descends)","value":600,"conditional":false,"appliesTo":["skill_spiritsteed_2"],"scaleOff":{"sourceStat":"def","basis":"total","ratio":0.6}}],
    "raiden": [{"stat":"elemDmg","label":"Electro DMG · 0.4% per 1% ER above 100% (P2)","value":0,"conditional":false,"scaleOff":{"sourceStat":"energyRegen","basis":"total","ratio":0.4,"offset":100}}],
    // CORRECTED 2026-07-30 — `appliesTo` was `["skill"]`, which (matching by
    // TYPE, not id) also wrongly caught her base press/hold Skill cast; the
    // real passive only affects Tri-Karma Purification specifically. Also
    // added the missing Crit Rate half of the same passive (was previously
    // only the DMG% half).
    "nahida": [{"stat":"elemDmg","label":"Tri-Karma Purification DMG · 0.1% per own EM point above 200, capped (P2)","value":0,"conditional":false,"appliesTo":["skill_trikarma"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.1,"offset":200,"cap":80}},{"stat":"critRate","label":"Crit Rate · 0.03% per own EM point above 200, capped 24% (P2)","value":0,"conditional":false,"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.03,"offset":200,"cap":24}}],
    // Added 2026-07-30, GI full-roster re-audit follow-up (10-agent pass) —
    // confirmed missing self-buffs, 2-source unless noted. Skipped anything
    // requiring a new engine primitive (Lunar-Charged/-Crystallize/-Bloom
    // reaction channel, live party-composition-count scaling) — flagged
    // separately as a roadmap item, not guessed at here.
    "durin": [{"stat":"elemDmg","label":"DMG · 3% per 100 own ATK, capped 75% at 2500 ATK (P2, Light Manifest of the Divine Calculus)","value":75,"conditional":false,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.03,"cap":75}}],
    "aino": [{"stat":"flatDmgAdd","label":"Burst DMG · flat add, 50% of own EM (P2)","value":500,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.5}}],
    "sethos": [{"stat":"flatDmgAdd","label":"Shadowpiercing Shot DMG · flat add, 700% of own EM, Scorching Sandshade (P4)","value":7000,"conditional":true,"appliesTo":["aimed_level2"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":7.0}}],
    "kachina": [{"stat":"elemDmg","label":"Geo DMG · 12s post-ally-Nightsoul-Burst (P1)","value":20,"conditional":true},{"stat":"flatDmgAdd","label":"Turbo Twirly DMG · flat add, 20% of own DEF (P4)","value":200,"conditional":false,"appliesTo":["skill_mounted","skill_independent"],"scaleOff":{"sourceStat":"def","basis":"total","ratio":0.2}}],
    "layla": [{"stat":"flatDmgAdd","label":"Shooting Star DMG · flat add, 1.5% of own Max HP (P2, Stellar Predator)","value":165,"conditional":false,"appliesTo":["skill_shootingstar"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.015}}],
    "kirara": [{"stat":"dmgBonus","label":"Skill DMG · 0.4% per 1000 own Max HP (P2, Pupillary Variance)","value":0,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.0004}},{"stat":"dmgBonus","label":"Burst DMG · 0.3% per 1000 own Max HP (P2, Pupillary Variance)","value":0,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.0003}}],
    "kaveh": [{"stat":"elementalMastery","label":"EM · +25/hit during Burst, max 4 stacks (P2, A Craftsman's Curious Conceptions)","value":100,"conditional":true}],
    "varka": [{"stat":"elemDmg","label":"Anemo/matching-element DMG · 10% per 1000 own ATK, capped 25% (P1, Dawn Wind's March)","value":25,"conditional":false,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.01,"cap":25}},{"stat":"dmgBonus","label":"DMG · Azure Fang's Oath, max 4 stacks (P2, Wind's Vanguard)","value":30,"conditional":true}],
    "gorou": [{"stat":"flatDmgAdd","label":"Inuzaka All-Round Defense DMG · flat add, 156% of own DEF (P2, A Favor Repaid)","value":1560,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"def","basis":"total","ratio":1.56}},{"stat":"flatDmgAdd","label":"Burst/Crystal Collapse DMG · flat add, 15.6% of own DEF (P2, A Favor Repaid)","value":156,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"def","basis":"total","ratio":0.156}}],
    // Shenhe's Elemental Skill itself carries a real, always-on mechanic
    // ("Icy Quill") separate from her two ascension-passive team buffs
    // already in bundle.ts (cb-gi-shenhe/-press/-hold) — confirmed via her
    // own combat data (param3 = 0.821808 at talent lvl 10).
    "shenhe": [{"stat":"flatDmgAdd","label":"Normal/Charged/Plunge/Skill/Burst Cryo DMG · flat add, 82.18% of own ATK, Icy Quill (Skill)","value":8218,"conditional":false,"appliesTo":["normal","charged","plunge","skill","ult"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.821808}}],
    "gaming": [{"stat":"dmgBonus","label":"Charmed Cloudstrider DMG · HP>=50% (P2, Air of Prosperity)","value":20,"conditional":true,"appliesTo":["plunge"]}],
    "traveler-dendro": [{"stat":"dmgBonus","label":"Razorgrass Blade DMG · 0.15% per own EM point (P4, Verdant Luxury)","value":0,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.15}},{"stat":"dmgBonus","label":"Surgent Manifestation DMG · 0.1% per own EM point (P4, Verdant Luxury)","value":0,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.1}}],
    "traveler-hydro": [{"stat":"flatDmgAdd","label":"Torrent Surge DMG · flat add, 45% of HP consumed via Suffusion, capped 5,000 (P4, Clear Waters)","value":5000,"conditional":true,"appliesTo":["skill"]}],
    "freminet": [{"stat":"dmgBonus","label":"Pressurized Floe DMG +40%, 5s post-Shatter (P2, Parallel Condensers)","value":40,"conditional":true,"appliesTo":["skill","plunge"]}],
    "yanfei": [{"stat":"elemDmg","label":"Pyro DMG +5% per Scarlet Seal consumed, 6s, max 3 (P1, Proviso)","value":15,"conditional":true},{"stat":"flatDmgAdd","label":"Charged DMG · flat add, 80% of own ATK, on Charged Attack CRIT (P2, Blazing Eye)","value":800,"conditional":true,"appliesTo":["charged"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.8}}],
    // Skirk P1 "Return to Oblivion" — base-kit (not constellation-gated)
    // damage multiplier from Death's Crossing stacks (max 3), a fundamental,
    // always-relevant part of her kit. Modeled at max stacks (this app's
    // established convention for capped/maxed stacking effects) — real
    // per-stack values are 110/120/170% of original NA/CA DMG and
    // 105/115/160% of original Burst DMG; expressed here as the
    // equivalent +% dmgBonus (170%->+70%, 160%->+60%) at 3 stacks.
    "skirk": [{"stat":"dmgBonus","label":"Normal/Charged DMG +70%, Warp mode, 3 Death's Crossing stacks (P1, Return to Oblivion)","value":70,"conditional":true,"appliesTo":["normal","charged"]},{"stat":"dmgBonus","label":"Burst DMG +60%, 3 Death's Crossing stacks (P1, Return to Oblivion)","value":60,"conditional":true,"appliesTo":["ult"]}],
    "lauma": [{"stat":"dmgBonus","label":"Skill DMG · 0.04% per own EM point, capped 32% (P4)","value":0,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.04,"cap":32}}],
    // Added 2026-07-31. Real passive is 2 mutually-exclusive branches (5/10/
    // 15% Healing Bonus per non-self Fontainian teammate, OR 5/10/15% Cryo
    // DMG per non-Fontainian teammate) — only the damage-relevant Cryo DMG
    // branch is modeled (this app doesn't track healing), at its max
    // (3 non-Fontainian teammates) case, conditional — same established
    // "assume the common/max case" convention as Navia's/Kaveh's entries.
    "charlotte": [{"stat":"elemDmg","label":"Cryo DMG +15%, 3 non-Fontainian teammates, Diversified Investigation (P1)","value":15,"conditional":true}],
    // Nefer's Burst consumes all banked Veil of Falsehood stacks (max 3,
    // base kit) to boost its own DMG — core kit mechanic, not an ascension
    // passive, but modeled the same way self-buffs already are here.
    // Modeled at max stacks: 40%/stack at talent lvl 10 x 3 = 120%
    // (verified via KQM library + separate max-stack confirmation, 2026-07-31).
    "nefer": [{"stat":"dmgBonus","label":"Burst DMG +120%, 3 Veil of Falsehood stacks consumed","value":120,"conditional":true,"appliesTo":["ult"]}],
};

/**
 * TEAM-WIDE buffs from a character's own (non-weapon, non-constellation)
 * passive talent — see `CharacterEntry.teamBuffs` in shared/types/game-bundle.ts.
 * Populated ONLY for characters whose real passive talent grants a buff to
 * a party member OTHER than themselves AND has no existing implementation
 * elsewhere. Aloy's own team-side passive (Prophecies of Dawn, ATK+8% to
 * nearby party members) is NOT here — it's already a real, working entry in
 * bundle.ts's `character` buff array (cb-gi-aloy-team); deliberately not
 * duplicated here.
 */
export const CHARACTER_TEAM_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff']; stacksMax?: number; autoTrigger?: { skillIds: string[]; durationSeconds: number } }>> = {
    // P2 "Kiongozi" (verified 2026-07-25, icy-veins/KQM): "...every point of
    // Fighting Spirit present when it is used increases the DMG that the
    // CURRENT ACTIVE PARTY MEMBER deals by 0.2%. The maximum increase
    // obtainable this way is 40%..." — genuinely missing anywhere else.
    "mavuika": [{"stat":"elemDmg","label":"DMG bonus to current active party member · 0.2%/Fighting Spirit point, capped 40%, decaying over 20s post-Burst (P2)","value":40}],
    // Added 2026-07-30, GI full-roster re-audit follow-up — confirmed
    // team-wide passive-talent buffs missing from both channels.
    "xiangling": [{"stat":"atkPct","label":"ATK% for 10s, to whoever picks up the Chili Pepper left by Guoba Attack (P4, Beware, It's Super Hot!)","value":10}],
    "candace": [{"stat":"dmgBonus","label":"NA-elemental-hit DMG · 0.5% per 1000 of Candace's own Max HP, to allies under Prayer of the Crimson Crown (P2)","value":0,"appliesTo":["normal"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.0005}}],
    "lynette": [{"stat":"atkPct","label":"ATK% for 10s post-Burst, scaling with party elemental-type count (1-4 types: 8/12/16/20%) — modeled at the common 4-type case (P1, Sophisticated Synergy)","value":20,"conditional":true}],
    // Nicole's Skill grants "Grace of Kenosis" to the active character: flat
    // ATK = 15% of Nicole's own ATK, capped at 600 (confirmed via aggregated
    // search of icy-veins/game8). Her separate "Arcane Projection"
    // coordinated-attack mechanic is NOT modeled here — no source gave a
    // precise per-instance ATK% (only "scales with ATK", no number) — flagged
    // as a known gap rather than guessed at.
    "nicole": [{"stat":"atk","label":"Flat ATK · 15% of Nicole's own ATK, capped 600, Grace of Kenosis (Skill)","value":600,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.15,"cap":600}}],
    "ifa": [{"stat":"elementalMastery","label":"EM +80 for 10s after an ally's Nightsoul Burst (P2, Mutual Aid Agreement)","value":80}],
    "illuga": [{"stat":"critRate","label":"Crit Rate +5%, 20s after Skill/Burst (P1, Torchforger's Covenant)","value":5},{"stat":"critDmg","label":"Crit DMG +10%, 20s after Skill/Burst (P1, Torchforger's Covenant)","value":10}],
    "prune": [{"stat":"dmgBonus","label":"Party DMG · 0.025% per own ATK point above 2000, capped 50% (P2/A4, Tolling Synchronicity)","value":0,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.025,"offset":2000,"cap":50}}],
    // P2 "Flippant Masterpiece" (verified 2026-07-25, u7buy/icy-veins):
    // "While in Masterstroke mode, for 8s after another nearby party member
    // triggers a Cryo Reaction, that character's ATK is increased by 15%,
    // while Lohen's ATK is increased by 15%." — the ally-side half of the
    // same effect Lohen's own selfBuffs entry above already covers.
    "lohen": [{"stat":"atkPct","label":"ATK% · to the ally whose Cryo Reaction triggered it, Masterstroke mode (P2)","value":15}],
};

export default CHARACTER_SELF_BUFFS;
