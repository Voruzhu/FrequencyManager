/**
 * @fileoverview Wuthering Waves character database
 * @module adapters/game-definitions/wuthering-waves/characters
 *
 * Per-character base stats, element, weapon, and icon path. The damage
 * calculator and OCR scanner read this list to know which characters exist
 * and their canonical base values.
 *
 * Icons live under `icons/characters/<id>.webp` relative to this game
 * package (sourced from encore.moe's WuWa API — real character portraits,
 * not placeholders).
 */

import type { ElementType, WeaponType, CharacterSkill } from '@shared/types/game-definition';

export interface WUCharacter {
    id: string;
    name: string;
    element: ElementType;
    weapon: WeaponType;
    /** Base stats at Lv1/Asc0. */
    baseAtk: number;
    baseHp: number;
    baseDef: number;
    baseCritRate: number;
    baseCritDmg: number;
    baseEnergyRegen: number;
    /** Relative path to the character icon within this game package. */
    icon: string;
    /** Per-character skills (precise). Omitted → falls back to game-wide actions. */
    skills?: CharacterSkill[];
}

export const CHARACTERS: WUCharacter[] = [
    { id: 'rover-spectro', name: 'Rover (Spectro)', element: 'Spectro', weapon: 'Sword', baseAtk: 830, baseHp: 12200, baseDef: 620, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/rover-spectro.webp' },
    { id: 'jinhsi', name: 'Jinhsi', element: 'Spectro', weapon: 'Broadblade', baseAtk: 855, baseHp: 12800, baseDef: 640, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/jinhsi.webp' },
    { id: 'yinlin', name: 'Yinlin', element: 'Electro', weapon: 'Rectifier', baseAtk: 848, baseHp: 11800, baseDef: 600, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/yinlin.webp' },
    { id: 'changli', name: 'Changli', element: 'Fusion', weapon: 'Sword', baseAtk: 862, baseHp: 12100, baseDef: 610, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/changli.webp' },
    { id: 'camellya', name: 'Camellya', element: 'Havoc', weapon: 'Sword', baseAtk: 866, baseHp: 12600, baseDef: 630, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/camellya.webp' },
    { id: 'jiyan', name: 'Jiyan', element: 'Aero', weapon: 'Broadblade', baseAtk: 858, baseHp: 12900, baseDef: 660, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/jiyan.webp' },
    { id: 'calcharo', name: 'Calcharo', element: 'Electro', weapon: 'Broadblade', baseAtk: 851, baseHp: 12700, baseDef: 655, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/calcharo.webp' },
    { id: 'encore', name: 'Encore', element: 'Fusion', weapon: 'Rectifier', baseAtk: 845, baseHp: 12500, baseDef: 585, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/encore.webp' },
    { id: 'verina', name: 'Verina', element: 'Spectro', weapon: 'Rectifier', baseAtk: 812, baseHp: 12950, baseDef: 675, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/verina.webp' },
    { id: 'sanhua', name: 'Sanhua', element: 'Glacio', weapon: 'Sword', baseAtk: 758, baseHp: 10900, baseDef: 560, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/sanhua.webp' },
    { id: 'baizhi', name: 'Baizhi', element: 'Glacio', weapon: 'Rectifier', baseAtk: 742, baseHp: 11450, baseDef: 595, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/baizhi.webp' },
    { id: 'yangyang', name: 'Yangyang', element: 'Aero', weapon: 'Sword', baseAtk: 755, baseHp: 10800, baseDef: 558, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/yangyang.webp' },
    { id: 'chixia', name: 'Chixia', element: 'Fusion', weapon: 'Pistols', baseAtk: 780, baseHp: 10650, baseDef: 545, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/chixia.webp' },
    { id: 'danjin', name: 'Danjin', element: 'Havoc', weapon: 'Sword', baseAtk: 788, baseHp: 10550, baseDef: 542, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/danjin.webp' },
    { id: 'mortefi', name: 'Mortefi', element: 'Fusion', weapon: 'Pistols', baseAtk: 776, baseHp: 10700, baseDef: 552, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/mortefi.webp' },
    { id: 'aalto', name: 'Aalto', element: 'Aero', weapon: 'Pistols', baseAtk: 772, baseHp: 10600, baseDef: 548, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/aalto.webp' },
    { id: 'taoqi', name: 'Taoqi', element: 'Havoc', weapon: 'Broadblade', baseAtk: 744, baseHp: 11400, baseDef: 600, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/taoqi.webp' },
    { id: 'xiangli-yao', name: 'Xiangli Yao', element: 'Electro', weapon: 'Gauntlets', baseAtk: 860, baseHp: 12400, baseDef: 615, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/xiangli-yao.webp' },
    { id: 'zhezhi', name: 'Zhezhi', element: 'Glacio', weapon: 'Rectifier', baseAtk: 856, baseHp: 11900, baseDef: 605, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/zhezhi.webp' },
    { id: 'shorekeeper', name: 'Shorekeeper', element: 'Spectro', weapon: 'Rectifier', baseAtk: 815, baseHp: 12980, baseDef: 680, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/shorekeeper.webp' },
    { id: 'carlotta', name: 'Carlotta', element: 'Glacio', weapon: 'Pistols', baseAtk: 868, baseHp: 12300, baseDef: 618, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/carlotta.webp' },
    { id: 'roccia', name: 'Roccia', element: 'Havoc', weapon: 'Gauntlets', baseAtk: 840, baseHp: 12150, baseDef: 612, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/roccia.webp' },
    { id: 'cantarella', name: 'Cantarella', element: 'Havoc', weapon: 'Rectifier', baseAtk: 818, baseHp: 12750, baseDef: 668, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/cantarella.webp' },
    { id: 'lingyang', name: 'Lingyang', element: 'Glacio', weapon: 'Gauntlets', baseAtk: 853, baseHp: 12000, baseDef: 608, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/lingyang.webp' },
    { id: 'yuanwu', name: "Yuanwu", element: 'Electro', weapon: 'Gauntlets', baseAtk: 225, baseHp: 8525, baseDef: 1638, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/yuanwu.webp' },
    { id: 'lumi', name: "Lumi", element: 'Electro', weapon: 'Broadblade', baseAtk: 338, baseHp: 8500, baseDef: 880, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/lumi.webp' },
    { id: 'youhu', name: "Youhu", element: 'Glacio', weapon: 'Gauntlets', baseAtk: 263, baseHp: 9975, baseDef: 1051, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/youhu.webp' },
    { id: 'brant', name: "Brant", element: 'Fusion', weapon: 'Sword', baseAtk: 375, baseHp: 11675, baseDef: 1308, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/brant.webp' },
    { id: 'phoebe', name: "Phoebe", element: 'Spectro', weapon: 'Rectifier', baseAtk: 413, baseHp: 10825, baseDef: 1259, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/phoebe.webp' },
    { id: 'ciaccona', name: "Ciaccona", element: 'Aero', weapon: 'Pistols', baseAtk: 375, baseHp: 12238, baseDef: 1198, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/ciaccona.webp' },
    { id: 'zani', name: "Zani", element: 'Spectro', weapon: 'Gauntlets', baseAtk: 438, baseHp: 10775, baseDef: 1137, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/zani.webp' },
    { id: 'lupa', name: "Lupa", element: 'Fusion', weapon: 'Broadblade', baseAtk: 388, baseHp: 11913, baseDef: 1186, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/lupa.webp' },
    { id: 'phrolova', name: "Phrolova", element: 'Havoc', weapon: 'Rectifier', baseAtk: 438, baseHp: 10775, baseDef: 1137, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/phrolova.webp' },
    { id: 'cartethyia', name: "Cartethyia", element: 'Aero', weapon: 'Sword', baseAtk: 313, baseHp: 14800, baseDef: 611, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/cartethyia.webp' },
    { id: 'augusta', name: "Augusta", element: 'Electro', weapon: 'Broadblade', baseAtk: 463, baseHp: 10300, baseDef: 1112, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/augusta.webp' },
    { id: 'iuno', name: "Iuno", element: 'Aero', weapon: 'Gauntlets', baseAtk: 450, baseHp: 10525, baseDef: 1124, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/iuno.webp' },
    { id: 'buling', name: "Buling", element: 'Electro', weapon: 'Rectifier', baseAtk: 225, baseHp: 10625, baseDef: 1259, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/buling.webp' },
    { id: 'galbrena', name: "Galbrena", element: 'Fusion', weapon: 'Pistols', baseAtk: 463, baseHp: 10300, baseDef: 1112, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/galbrena.webp' },
    { id: 'chisa', name: "Chisa", element: 'Havoc', weapon: 'Broadblade', baseAtk: 438, baseHp: 10775, baseDef: 1137, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/chisa.webp' },
    { id: 'qiuyuan', name: "Qiuyuan", element: 'Aero', weapon: 'Sword', baseAtk: 375, baseHp: 12238, baseDef: 1198, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/qiuyuan.webp' },
    { id: 'lynae', name: "Lynae", element: 'Spectro', weapon: 'Pistols', baseAtk: 375, baseHp: 12238, baseDef: 1198, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/lynae.webp' },
    { id: 'mornye', name: "Mornye", element: 'Fusion', weapon: 'Broadblade', baseAtk: 288, baseHp: 15375, baseDef: 1357, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/mornye.webp' },
    { id: 'luuk-herssen', name: "Luuk Herssen", element: 'Spectro', weapon: 'Gauntlets', baseAtk: 463, baseHp: 10300, baseDef: 1112, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/luuk-herssen.webp' },
    { id: 'aemeath', name: "Aemeath", element: 'Fusion', weapon: 'Sword', baseAtk: 425, baseHp: 11025, baseDef: 1149, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/aemeath.webp' },
    // 11 characters added 2026-07-12, sourced from api.encore.moe/en/character/{roleId}
    // (same validated source as the rest of this session's WW data work — see
    // [[ww-encore-api-source]]). Includes the 3 missing Rover elements (this
    // roster previously only had Rover: Spectro).
    { id: 'denia', name: "Denia", element: 'Fusion', weapon: 'Rectifier', baseAtk: 425, baseHp: 11025, baseDef: 1149, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/denia.webp' },
    { id: 'hiyuki', name: "Hiyuki", element: 'Glacio', weapon: 'Sword', baseAtk: 463, baseHp: 10300, baseDef: 1112, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/hiyuki.webp' },
    { id: 'jianxin', name: "Jianxin", element: 'Aero', weapon: 'Gauntlets', baseAtk: 338, baseHp: 14113, baseDef: 1124, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/jianxin.webp' },
    { id: 'lucilla', name: "Lucilla", element: 'Glacio', weapon: 'Rectifier', baseAtk: 375, baseHp: 12238, baseDef: 1198, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/lucilla.webp' },
    { id: 'lucy', name: "Lucy", element: 'Spectro', weapon: 'Pistols', baseAtk: 425, baseHp: 11025, baseDef: 1149, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/lucy.webp' },
    { id: 'rebecca', name: "Rebecca", element: 'Electro', weapon: 'Pistols', baseAtk: 400, baseHp: 11600, baseDef: 1173, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/rebecca.webp' },
    { id: 'sigrika', name: "Sigrika", element: 'Aero', weapon: 'Gauntlets', baseAtk: 438, baseHp: 10775, baseDef: 1137, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/sigrika.webp' },
    { id: 'suisui', name: "Suisui", element: 'Glacio', weapon: 'Rectifier', baseAtk: 288, baseHp: 16713, baseDef: 1100, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/suisui.webp' },
    { id: 'rover-aero', name: "Rover (Aero)", element: 'Aero', weapon: 'Sword', baseAtk: 438, baseHp: 10775, baseDef: 1137, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/rover-aero.webp' },
    { id: 'rover-havoc', name: "Rover (Havoc)", element: 'Havoc', weapon: 'Sword', baseAtk: 413, baseHp: 10825, baseDef: 1259, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/rover-havoc.webp' },
    { id: 'rover-electro', name: "Rover (Electro)", element: 'Electro', weapon: 'Sword', baseAtk: 438, baseHp: 10775, baseDef: 1137, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100, icon: 'icons/characters/rover-electro.webp' },
];

export function getCharacter(id: string): WUCharacter | undefined {
    return CHARACTERS.find((c) => c.id === id);
}