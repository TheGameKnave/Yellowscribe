const AdmZip = require("adm-zip");
const {parseXML} = require("./xml");
const DataModel = require("./dataModel");
const Helpers = require("./helpers");

const BS_10E_SYSTEM_ID = "sys-352e-adc2-7639-d6a9";
const FACTION_KEYWORD_PREFIX = "Faction: ";
let weaponAbilityShortNames = new Map();
weaponAbilityShortNames.set("assault", "AS");
weaponAbilityShortNames.set("rapid fire", "RF");
weaponAbilityShortNames.set("ignores cover", "IC");
weaponAbilityShortNames.set("twin-linked", "TL");
weaponAbilityShortNames.set("twin linked", "TL");
weaponAbilityShortNames.set("pistol", "PL");
weaponAbilityShortNames.set("torrent", "TO");
weaponAbilityShortNames.set("lethal hits", "LH");
weaponAbilityShortNames.set("lance", "LC");
weaponAbilityShortNames.set("indirect fire", "IF");
weaponAbilityShortNames.set("precision", "PR");
weaponAbilityShortNames.set("blast", "BL");
weaponAbilityShortNames.set("melta", "ML");
weaponAbilityShortNames.set("heavy", "HV");
weaponAbilityShortNames.set("hazardous", "HZ");
weaponAbilityShortNames.set("devastating wounds", "DW");
weaponAbilityShortNames.set("sustained hits", "SH");
weaponAbilityShortNames.set("extra attacks", "EA");

function extractRosterXML(rawData) {
    let zip;
    try {
        zip = new AdmZip(rawData);
    } catch (err) {
        return rawData;
    }

    const zipEntries = zip.getEntries();

    if (zipEntries.length !== 1) {
        throw new Error("Invalid Rosz file, it should have only 1 file in archive");
    }

    return zip.readAsText(zipEntries[0]);
}

function parse10eRoster(rosz, wargearAllocationMode, decorativeNames) {
    let rosterYs = new DataModel.Roster(
        //name, game, dataSet, edition, version, app, appVersion, hash
        rosz.$.name,
        rosz.$.gameSystemName,
        null,
        rosz.$.gameSystemRevision,
        null,
        'Battlescribe or New Recruit',
        rosz.$.battleScribeVersion,
        null,
        decorativeNames,
    );
    rosterYs.wargearAllocationMode = wargearAllocationMode; // this is not in the model but we cheat it in for legacy 10e parsing

    for (const force of rosz.forces[0].force) {
        if (force.selections && force.selections[0]) {
            for (const selection of force.selections[0].selection) {
                if (selection.$.type == "unit" || selection.$.type == "model") {
                    rosterYs.addGroup(parseUnit(selection, rosterYs));
                }
            }
        }
    }

    return rosterYs;
}

function parseUnit(selection, rosterYs) {
    let unit = new Unit(selection.$.name, rosterYs);

    if (selection.profiles && selection.profiles[0]) {
        for (const profile of selection.profiles[0].profile) {
            switch (profile.$.typeName) {
                case "Unit":
                    unit.addProfile(parseModelCharacteristics(profile));
                    break;

                case "Abilities":
                    unit.addAbility(parseAbility(profile));
                    break;
            }
        }
    }

    // Core and faction abilities are typically represented as "rules", whereas unit-specific
    // ones are "profiles" of type "Abilities". Some, such as Leader, are both, with the "rule"
    // having the generic text, and the "profile" having the unit-specific text, e.g. what
    // units this unit can lead. The data model copes with duplicates by ignoring those after
    // the first, so we parse rules after profiles to ensure we get the more specific version.
    if (selection.rules && selection.rules[0]) {
        for (const rule of selection.rules[0].rule) {
            unit.addAbility(new Ability(rule.$.name, rule.description[0], []));
        }
    }

    if (selection.$.type == "model") {
        // This is a single-model unit. Re-parse the selection
        // as a model.
        unit.addModel(parseModel(selection, unit));
    } else if (selection.selections && selection.selections[0]) {
        // This is a multi-model unit. Look for child models and upgrades.
        for (const childSelection of selection.selections[0].selection) {
            switch (childSelection.$.type) {
                case "model":
                    unit.addModel(parseModel(childSelection, unit));
                    break;

                case "upgrade":
                    parseAndAddUnitSelection(childSelection, unit);
                    break;
            }
        }
    }

    for (const category of selection.categories[0].category) {
        let keyword = category.$.name;
        if (keyword.startsWith(FACTION_KEYWORD_PREFIX)) {
            unit.addFactionKeyword(keyword.substring(FACTION_KEYWORD_PREFIX.length));
        } else {
            unit.addOtherKeyword(keyword);
        }
    }

    unit.completeParse(); // just go ahead and process the unit as previously, so we can modify it
                          // to fit the new data model. TODO: streamline this by someone who knows it better.

    
    // make groupAsset
    let groupAsset = new DataModel.Asset(
        selection.$.name,
        selection.$.type === "model" ? "game piece" : "group",
    );
    groupAsset.assetDepth = 0;
    // keyword and text for groupAsset
    if(unit.factionKeywords.size) groupAsset.addKeyword('Faction', Array.from(unit.factionKeywords));
    if(unit.keywords.size) groupAsset.addKeyword('Keywords', Array.from(unit.keywords));
    if(selection.$.desc) groupAsset.setText(selection.$.desc);

    // make group
    let group = new DataModel.Group(
        // name, type, groupClass, groupAsset,
        selection.$.name,
        selection.$.type === "model" ? "game piece" : "group",
        "Unit",
        groupAsset,
    );
    group.meta = {
        ttsDamageStat: "W",
        ttsCoherency: "2,5,5",
    }

    // if single-model: stats
    if(selection.$.type == "model") {
        Object.entries(unit.modelProfiles.get(unit.name) || {}).forEach(([statKey,statValue],i) => {
            if(i) groupAsset.stats[statKey] = statValue;
        });
    }
    // flat-map groupAsset copy AND sub-assets (abilities) into groupAsset.assets
    let groupAssetZero = JSON.parse(Helpers.serialize(groupAsset));
    groupAsset.assets.push(groupAssetZero);
    if(unit.abilities.size) groupAsset.assets.push(new DataModel.AssetGroup('Abilities', groupAsset.assetDepth + 1));
    for(const [name, ability] of unit.abilities) {
        let asset = new DataModel.Asset(
            ability.name,
            "conceptual",
        );
        asset.assetDepth = groupAsset.assetDepth + 1;
        asset.setText(ability.desc);
        groupAsset.addAsset(asset);
    }
    // if multi-model:
    if(selection.$.type == "unit") {
        for(const [key, model] of unit.models.models) {
            let asset = new DataModel.Asset(
                model.name,
                "game piece",
            );
            asset.assetDepth = groupAsset.assetDepth + 1;
            asset.quantity = model.number || 1;
            asset.meta = {ttsPartOfGroup: true, ...group.meta};
            if(model.desc) asset.setText(model.desc);
            //   parse and stat each asset as a game piece
            let profile = unit.modelProfiles.get(model.name) || unit.modelProfiles.get(unit.name) || {};
            Object.entries(profile || {}).forEach(([statKey,statValue],i) => {
                if(i) asset.stats[statKey] = statValue;
            });
            let assetZero = JSON.parse(Helpers.serialize(asset));
            asset.assets.push(assetZero);
            //   fill out model sub-assers (weapons w/profiles, weapon abilities, etc)
            if(model.weapons.length) asset.assets.push(new DataModel.AssetGroup('Weapons', asset.assetDepth + 1));
            model.weapons.forEach(weapon => {
                let subAsset = new DataModel.Asset(
                    weapon.name,
                    "conceptual",
                );
                subAsset.assetDepth = asset.assetDepth + 1;
                subAsset.quantity = weapon.number || 1;
                let weaponData = unit.weapons.get(weapon.name);
                Object.entries(weaponData || {}).forEach(([statKey,statValue],i) => {
                    if(['range','a','bsws','s','ap','d'].includes(statKey)){
                        let statName = statKey;
                        if(statName === 'bsws'){
                            statName = weaponData.range === 'melee' ? 'ws' : 'bs';
                        }
                        subAsset.stats[statName] = statValue;
                    }
                });
                asset.addAsset(subAsset);
                if(weapon.abilities?.size){
                    subAsset.assets.push(new DataModel.AssetGroup('Abilities', subAsset.assetDepth + 1));
                    weapon.abilities.forEach(ability => {
                        let subAsset = new DataModel.Asset(ability, "conceptual");
                        subAsset.assetDepth = subAsset.assetDepth + 1;
                    })
                }
            });
            //   populate gamePieces in group
            asset.createDescription(group);
            group.addGamePiece(asset);
            //   append model sub-assets to groupAsset.assets
            groupAsset.assets.push(...asset.assets);
        }
    }else if(selection.$.type == "model") {
        if(unit.weapons.size) groupAsset.assets.push(new DataModel.AssetGroup('Weapons', groupAsset.assetDepth + 1));
        unit.weapons.forEach(weapon => {
            let subAsset = new DataModel.Asset(
                weapon.name,
                "conceptual",
            );
            subAsset.assetDepth = groupAsset.assetDepth + 1;
            subAsset.quantity = weapon.number || 1;
            let weaponData = unit.weapons.get(weapon.name);
            Object.entries(weaponData || {}).forEach(([statKey,statValue],i) => {
                if(['range','a','bsws','s','ap','d'].includes(statKey)){
                    let statName = statKey;
                    if(statName === 'bsws'){
                        statName = weaponData.range === 'melee' ? 'ws' : 'bs';
                    }
                    subAsset.stats[statName] = statValue;
                }
            });
            groupAsset.addAsset(subAsset);
            groupAsset.meta = group.meta;
            if(weapon.abilities?.size){
                subAsset.assets.push(new DataModel.AssetGroup('Abilities', subAsset.assetDepth + 1));
                weapon.abilities.forEach(ability => {
                    let subAsset = new DataModel.Asset(ability, "conceptual");
                    subAsset.assetDepth = subAsset.assetDepth + 1;
                })
            }
        });
        group.groupAsset.createDescription(group);
    }
    return group;
}

class ModelCharacteristics {
    name;
    M;
    T;
    Sv;
    W;
    Ld;
    OC;

    constructor(name, m, t, sv, w, ld, oc) {
        this.name = name;
        this.M = m;
        this.T = t;
        this.Sv = sv;
        this.W = w;
        this.Ld = ld;
        this.OC = oc;
    }
}

function parseModelCharacteristics(profile) {
    let chrM, chrT, chrSv, chrW, chrLd, chrOC = null;
    for (const characteristic of profile.characteristics[0].characteristic) {
        switch (characteristic.$.name) {
            case "M":
                chrM = characteristic._;
                break;
            case "T":
                chrT = characteristic._;
                break;
            case "SV":
                chrSv = characteristic._;
                break;
            case "W":
                chrW = characteristic._;
                break;
            case "LD":
                chrLd = characteristic._;
                break;
            case "OC":
                chrOC = characteristic._;
                break;
        }
    }
    return new ModelCharacteristics(profile.$.name, chrM, chrT, chrSv, chrW, chrLd, chrOC);
}

function parseModel(selection, unit) {
    let model = new Model(selection.$.name, selection.$.number, unit);

    parseAndAddModelSelection(selection, model);

    if (selection.profiles && selection.profiles[0]) {
        for (const profile of selection.profiles[0].profile) {
            if (profile.$.typeName == "Unit") {
                // Model-specific characteristic profile.
                unit.addProfile(parseModelCharacteristics(profile));
            }
        }
    }

    return model;
}

function parseAndAddModelSelection(selection, model) {
    if (selection.selections && selection.selections[0]) {
        // This selection has children.
        for (const childSelection of selection.selections[0].selection) {
            parseAndAddModelSelection(childSelection, model);
        }
    }

    // In Battlescribe data, a selection of X models
    // with Y weapons each will contain X*Y weapons.
    // But our data model wants to know how many each
    // model has.
    let number = parseInt(selection.$.number) / model.number;
    if (selection.profiles && selection.profiles[0]) {
        for (const profile of selection.profiles[0].profile) {
            switch (profile.$.typeName) {
                case "Melee Weapons":
                case "Ranged Weapons":
                    model.addWeapon(parseWeapon(profile, number));
                    break;

                case "Abilities":
                    model.addAbility(parseAbility(profile));
                    break;
            }
        }
    }
}

function parseAndAddUnitSelection(selection, unit) {
    if (selection.selections && selection.selections[0]) {
        // This selection has children.
        for (const childSelection of selection.selections[0].selection) {
            parseAndAddUnitSelection(childSelection, unit);
        }
    }

    if (selection.$.type == "model") {
        // Some units with particularly odd compositions have the overall
        // composition as an "upgrade" selection, with the models underneath.
        unit.addModel(parseModel(selection, unit));
    } else if (selection.profiles && selection.profiles[0]) {
        for (const profile of selection.profiles[0].profile) {
            switch (profile.$.typeName) {
                case "Melee Weapons":
                case "Ranged Weapons":
                    let weapon = parseWeapon(profile, 1);
                    if (selection.$.from && selection.$.from == "group") {
                        unit.addAllModelsWeapon(weapon);
                    } else {
                        unit.addUnassignedWeapon(weapon);
                    }
                    break;

                case "Abilities":
                    let ability = parseAbility(profile);
                    if (selection.$.from && selection.$.from == "group") {
                        unit.addAbility(ability);
                    } else {
                        unit.addUnassignedAbility(ability);
                    }
                    break;
            }
        }
    }
}

function parseWeapon(profile, number) {
    let chrRange, chrA, chrBSWS, chrS, chrAP, chrD, keywords = null;
    let name = profile.$.name;
    if (name.startsWith("➤ ")) {
        // We add each profile of a multi-profile weapon as a
        // separate weapon, but we don't want the arrow that
        // indicates it's a profile.
        name = name.substring(2);
    }

    for (const characteristic of profile.characteristics[0].characteristic) {
        switch (characteristic.$.name) {
            case "Range":
                chrRange = characteristic._;
                break;
            case "A":
                chrA = characteristic._;
                break;
            case "BS":
            case "WS":
                chrBSWS = characteristic._;
                break;
            case "S":
                chrS = characteristic._;
                break;
            case "AP":
                chrAP = characteristic._;
                break;
            case "D":
                chrD = characteristic._;
                break;
            case "Keywords":
                if (characteristic._) {
                    keywords = characteristic._;
                } else {
                    keywords = "-";
                }
                break;
        }
    }

    let weapon = new Weapon(name, chrRange, chrA, chrBSWS, chrS, chrAP, chrD);
    weapon.setNumber(number)

    if (keywords != "-") {
        for (const keyword of keywords.split(", ")) {
            weapon.addAbility(new Ability(keyword, "", []));
        }
    }

    weapon.completeParse();
    return weapon;
}

function parseAbility(profile) {
    return new Ability(profile.$.name, profile.characteristics[0].characteristic[0]._, [])
}
class Ability {
    name;
    desc;
    keywords;

    constructor(name, text, keywords) {
        this.name = name;
        this.desc = text;
        this.keywords = keywords;
    }
}

class Weapon {
    name;
    range;
    a;
    bsws;
    s;
    ap;
    d;
    number = 1;
    abilities = "";
    shortAbilities = "";

    _internalAbilities = [];

    constructor(name, range, a, bsws, s, ap, d) {
        this.name = name;
        this.range = range;
        this.a = a;
        this.bsws = bsws;
        this.s = s;
        this.ap = ap;
        this.d = d;
    }

    addAbility(ability) {
        this._internalAbilities.push(ability);
    }

    addAnother() {
        this.number += 1;
    }

    setNumber(number) {
        this.number = number;
    }

    isMelee() {
        return this.range == MELEE_RANGE;
    }

    completeParse() {
        // Called when we've finished parsing this weapon. We
        // now need to convert abilitiesInternal into the strings
        // that the TTS mod needs.

        if (this._internalAbilities.length == 0) {
            // Well, that was easy.
            this.abilities = "-";
            this.shortAbilities = "-";
        } else {
            // Format the abilities into a single list, with
            // core abilities first and special abilities last.
            this.abilities = "";
            this.shortAbilities = "";
            let specialAbilities = [];

            for (let ability of this._internalAbilities) {
                if (ability.keywords.includes("Special")) {
                    specialAbilities.push(ability);
                } else {
                    if (this.abilities.length > 0) {
                        this.abilities += ", ";
                        this.shortAbilities += ",";
                    }

                    let finalSpaceIndex = ability.name.lastIndexOf(" ");
                    if ((finalSpaceIndex < 0) ||
                        isNaN(ability.name.substring(finalSpaceIndex))) {
                        // This is a standalone ability with no
                        // numeric portion.
                        this.abilities += ability.name;
                        let lowerAbility = ability.name.toLowerCase();
                        if (weaponAbilityShortNames.has(lowerAbility)) {
                            // This ability has a short form - use it. (Note - we're going to
                            // throw this away later, this is dead code - we may reinstate it
                            // later.)
                            this.shortAbilities += weaponAbilityShortNames.get(lowerAbility);
                        } else {
                            // This ability doesn't have a short form:
                            // bump it to special abilities.
                            specialAbilities.push(ability);
                            this.shortAbilities += "*"
                        }
                    } else {
                        // This ability has a numeric final component.
                        // We'll need to use the short form without
                        // the numeric part, then add the number.
                        let initialPart = ability.name.substring(0, finalSpaceIndex).toLowerCase();
                        let numericPart = ability.name.substring(finalSpaceIndex + 1);
                        this.abilities += ability.name;
                        this.shortAbilities += weaponAbilityShortNames.get(initialPart) + numericPart;
                    }
                }
            }

            // The above logic was designed to provide brevity in weapon tooltips,
            // so "[Devastating Wounds, Sustained Hits 2]" could be shortened to
            // "DW, SH2". Feedback suggests that that's not as important as clarity,
            // so we're going to throw away the short form for now.
            this.shortAbilities = this.abilities;

            for (let ability of specialAbilities) {
                if (this.abilities.length > 0) {
                    this.abilities += "\n";
                }
                this.abilities += ability.name + ": " + ability.desc;
            }
        }

        delete this._internalAbilities;
    }
}

class Model {
    name;
    abilities = new Set();
    weapons = [];
    number;
    _internalAbilities = [];
    _parentUnit;

    constructor(name, number, parentUnit) {
        this.name = name;
        this.number = parseInt(number, 10);
        this._parentUnit = parentUnit;
    }

    maybeSplit() {
        // We want to modify a single model. If this is a stack of one,
        // it'll do. Otherwise, split one out from this stack.
        if (this.number == 1) {
            return this;
        } else {
            let newModel = new Model(this.name, 1, this.parentUnit);
            newModel._parentUnit = this._parentUnit;
            newModel._internalAbilities = [...this._internalAbilities];
            newModel.weapons = [...this.weapons];
            this.number--;
            this._parentUnit.models["totalNumberOfModels"] -= 1;
            this._parentUnit.addModel(newModel);
            return newModel;
        }
    }

    addAbility(ability) {
        if (!this.abilities.has(ability.name)) {
            this.abilities.add(ability.name);
            this._internalAbilities.push(ability);
        }
    }

    addWeapon(weapon) {
        let found = false;
        for (let existingWeapon of this.weapons) {
            if (existingWeapon.name == weapon.name) {
                if (this._parentUnit.weapons.get(weapon.name).isMelee() == weapon.isMelee()) {
                    // Duplicate of one we already have
                    existingWeapon.number += weapon.number;
                    found = true;
                    break;
                } else {
                    // Dual-profile weapon. The Rosterizer parser is able to catch
                    // this in advance, but the Rosz parser isn't; we kindly help
                    // out by handling it here.
                    let meleeName = weapon.name + " (melee)";
                    let rangedName = weapon.name + " (ranged)";
                    if (weapon.isMelee()) {
                        this._parentUnit.renameWeapon(weapon.name, rangedName);
                        existingWeapon.name = rangedName;
                        weapon.name = meleeName;
                    } else {
                        this._parentUnit.renameWeapon(weapon.name, meleeName);
                        existingWeapon.name = meleeName;
                        weapon.name = rangedName;
                    }
                }
            }
        }

        if (!found) {
            // New one
            this.weapons.push({"name": weapon.name, "number": weapon.number});
        }

        this._parentUnit.addWeapon(weapon);
    }

    // This model's unit has been fully parsed.
    unitParseComplete() {
        delete this._internalAbilities;
        delete this._parentUnit;
    }
}

class Unit {
    name;
    factionKeywords = new Set();
    keywords = new Set();
    abilities = new Map();
    models = {};
    modelProfiles = new Map();
    weapons = new Map();
    isSingleModel = false;
    uuid = require('crypto').randomBytes(4).toString("hex");
    _roster;

    // This one is an easy bit of backwards compatibility with 9e.
    // In the 9e data model, "rules" were any abilities so common-
    // place that the roster didn't bother including their rules
    // text, and the parser in TTS is expecting a list, but is fine
    // with it being empty. The 10e equivalent is Core/Faction
    // abilities, which we handle elsewhere, so this will forever
    // be empty.
    rules = [];

    // These are weapons and wargear abilities which aren't assigned
    // to a specific model. This only happens with rosz files;
    // Rosterizer is more accurate! Depending on the user's choice,
    // we'll assign these once we've got all the models.
    unassignedWeapons = [];
    _unassignedAbilities = [];

    // These are weapons which all models in the unit have, stored
    // during unit parsing and then pushed onto all models once
    // we know we have them all.
    _allModelWeapons = [];

    constructor(name, roster) {
        this.name = name;
        this._roster = roster;
        this.models["models"] = new Map();
        this.models["totalNumberOfModels"] = 0;
    }

    addFactionKeyword(keyword) {
        this.factionKeywords.add(keyword);
    }

    addOtherKeyword(keyword) {
        this.keywords.add(keyword);
    }

    addAbility(ability) {
        this.abilities.set(ability.name, ability);
    }

    addModel(model) {
        this.models["models"].set(require('crypto').randomBytes(8).toString("hex"), model);
        this.models["totalNumberOfModels"] += model.number;
    }

    addProfile(profile) {
        this.modelProfiles.set(profile.name, profile);
    }

    addUnassignedAbility(ability) {
        this._unassignedAbilities.push(ability);
    }

    addAllModelsWeapon(weapon) {
        this.weapons.set(weapon.name, weapon);
        this._allModelWeapons.push(weapon);
    }

    addUnassignedWeapon(weapon) {
        this.weapons.set(weapon.name, weapon);
        this.unassignedWeapons.push(weapon);
    }

    addWeapon(weapon) {
        this.weapons.set(weapon.name, weapon);
    }

    renameWeapon(oldName, newName) {
        let weapon = this.weapons.get(oldName);
        if (weapon) {
            this.weapons.set(newName, this.weapons.get(oldName));
            this.weapons.delete(oldName);
            weapon.name = newName;
        }
    }

    completeParse() {
        // Called when we've finished parsing this unit. We now
        // need to allocate anything that's unallocated. We also
        // need to duplicate unit-scope abilities onto models, and
        // then collate all model-scope abilities onto the unit.
        // We finally need to aggregate Core and Faction abilities, and
        // copy all-model weapons to all models.
        if (this._roster.wargearAllocationMode == "oneModel" ||
            this._roster.wargearAllocationMode == "separateModels") {
            // We need to auto-allocate unallocated wargear. We want to
            // go in the order of most to least boring models, which
            // likely means the ones there's most of in the unit.
            let modelsArr = Array.from(this.models["models"].values());
            modelsArr.sort((a, b) => b.number - a.number);
            let modelIndex = 0;
            let modelToModify = null;

            for (let weapon of this.unassignedWeapons) {
                if (modelToModify == null || this._roster.wargearAllocationMode == "separateModels") {
                    // We need to split out another model to modify.
                    if (modelToModify == modelsArr[modelIndex]) {
                        // We just modified the last model in the stack,
                        // move onto the next stack
                        modelIndex++;

                        if (modelIndex >= modelsArr.length) {
                            // We just wrapped round the set of models. That
                            // means we've probably got nonsense data - more
                            // weapons to assign than models in the unit!?
                            // Can't see any sensible logic for how to handle
                            // this, so we'll just start from the beginning
                            // again so we don't crash.
                            modelIndex = 0;
                        }
                    }
                    modelToModify = modelsArr[modelIndex].maybeSplit();
                }

                modelToModify.name += " w/ " + weapon.name;
                modelToModify.addWeapon(weapon);
            }

            for (let ability of this._unassignedAbilities) {
                if (modelToModify == null || this._roster.wargearAllocationMode == "separateModels") {
                    // We need to split out another model to modify.
                    if (modelToModify == modelsArr[modelIndex]) {
                        // We just modified the last model in the stack,
                        // move onto the next stack
                        modelIndex++;

                        if (modelIndex >= modelsArr.length) {
                            // We just wrapped round the set of models. That
                            // means we've probably got nonsense data - more
                            // weapons to assign than models in the unit!?
                            // Can't see any sensible logic for how to handle
                            // this, so we'll just start from the beginning
                            // again so we don't crash.
                            modelIndex = 0;
                        }
                    }
                    modelToModify = modelsArr[modelIndex].maybeSplit();
                }

                modelToModify.name += " w/ " + ability.name;
                modelToModify.addAbility(ability);
            }
        } else {
            // Unallocated wargear is to be treated as assigned to all
            // models - nice and easy.
            this._allModelWeapons = this._allModelWeapons.concat(this.unassignedWeapons);
            for (let ability of this._unassignedAbilities) {
                this.addAbility(ability);
            }
        }
        this.unassignedWeapons = [];
        delete this._unassignedAbilities;
        delete this._roster;

        for (let ability of this.abilities.values()) {
            for (let model of this.models["models"].values()) {
                model.addAbility(ability);
            }
        }

        for (let model of this.models["models"].values()) {
            for (let ability of model._internalAbilities) {
                this.addAbility(ability);
            }
            for (let weapon of this._allModelWeapons) {
                model.addWeapon(weapon);
            }
            model.unitParseComplete();
        }
        delete this._allModelWeapons;

        // Extract abilities tagged Core or Faction.
        let coreAbilities = [];
        let factionAbilities = [];
        for (let ability of this.abilities.values()) {
            if (ability.keywords.includes("Core")) {
                coreAbilities.push(ability.name);
            } else if (ability.keywords.includes("Faction")) {
                factionAbilities.push(ability.name);
            }
        }

        // Aggregate abilities tagged Faction into a single Faction ability.
        // Add it to the unit.
        let factionAbilitiesStr = "";
        for (let ability of factionAbilities) {
            this.abilities.delete(ability);
            if (factionAbilitiesStr.length > 0) { factionAbilitiesStr += ", "; }
            factionAbilitiesStr += ability;
        }
        if (factionAbilitiesStr.length > 0) {
            let newAbility = new Ability("Faction", factionAbilitiesStr, []);
            this.addAbility(newAbility);
        }

        // Aggregate abilities tagged Core into a single Core ability.
        // Add it to the unit.
        let coreAbilitiesStr = "";
        for (let ability of coreAbilities) {
            this.abilities.delete(ability);
            if (coreAbilitiesStr.length > 0) { coreAbilitiesStr += ", "; }
            coreAbilitiesStr += ability;
        }
        if (coreAbilitiesStr.length > 0) {
            let newAbility = new Ability("Core", coreAbilitiesStr, []);
            this.addAbility(newAbility);
        }

        // Finally, remove keywords from abilities - TTS isn't interested.
        for (let ability of this.abilities.values()) {
            delete ability.keywords;
        }
    }
}

module.exports.roszParse = (rawData, wargearAllocationMode, decorativeNames) => {
    const xmlData = extractRosterXML(rawData);
    const result = parseXML(xmlData);
    if (result.roster.$.gameSystemId == BS_10E_SYSTEM_ID) {
        return parse10eRoster(result.roster, wargearAllocationMode, decorativeNames);
    }
};