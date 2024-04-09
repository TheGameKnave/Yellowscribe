const AdmZip = require("adm-zip");
const Model = require("./10eDataModel");
const { raw } = require("body-parser");
const { parse } = require("path");

// Explanation of Rosterizer data format:
// https://docs.google.com/document/d/1P9dSOkToVupxVkUiY6OKVkchw9zNqSWa--a2W2qix1k/edit?usp=sharing

function extractRegistryJSON(rawData) {
    let zip;
    try {
        zip = new AdmZip(rawData);
    } catch (err) {
        throw new Error("Uploaded file appears corrupt: not a valid zip file");
    }

    const zipEntries = zip.getEntries();
    if (zipEntries.length !== 1) {
        throw new Error("Uploaded file appears corrupt: valid zip file but contains multiple files");
    }

    let text = zip.readAsText(zipEntries[0]);
    return JSON.parse(text);
}

function parseRegistry(json, legacy = false) {
    let roster = new Model.Roster();
    
    // legacy parsing
    if(legacy){
        discoverUnits(roster, json);

        for (let error of json.errors) {
            let errorText = error.message;
            if (error.name.length > 0) {
                errorText = error.name + ": " + errorText;
            }
            roster.addError(errorText);
        }
    }
    else{
        // new parsing
        roster = {
            game: json.info.game,
            edition: json.info.rulebookVersion.split('.')[0],
            order: [],
            groups: {},
            errors: [],
        };
        registry = findParents(json);
        discoverChildGamePieces(roster, registry);
        discoverGroups(roster, registry);
        roster.errors = registry.errors.map(error => error.name + ": " + error.message);
    }


    return roster;
}

function discoverUnits(roster, asset) {
    for (let subAsset of asset.assets.included) {
        if (subAsset.lineage.includes("Unit")) {
            roster.addUnit(parseUnit(subAsset, roster));
        }
        discoverUnits(roster, subAsset);
    }
}

function parseModel(modelAsset, unit) {
    let name = modelAsset.name ? 
        `${modelAsset.name} (${modelAsset.aspects?.label || modelAsset.designation})`
        : (modelAsset.aspects?.label || modelAsset.designation);
    let m = modelAsset.stats.M.processed.format.current;
    let t = modelAsset.stats.T.processed.format.current;
    let sv = modelAsset.stats.Sv.processed.format.current;
    let w = modelAsset.stats.W.processed.format.current;
    let ld = modelAsset.stats.Ld.processed.format.current;
    let oc = modelAsset.stats.OC.processed.format.current;
    let number = modelAsset.quantity;

    let model = new Model.Model(name, number, unit);
    let modelWargear = [];
    let modelSpecialWargear = [];
    for (let asset of modelAsset.assets.traits) {
        if (asset.classIdentity == "Weapon") {
            parseAndAddWeapon(asset, model, unit);
        } else if (asset.classification == "Ability" ||
                asset.classification == "Enhancement") {
            model.addAbility(parseAbility(asset));
        } else if (asset.classification == "Wargear") {
            model.addAbility(parseAbility(asset));
            modelWargear.push(asset.designation);
            if (asset.designation.toLowerCase().includes("shield") ||
                asset.designation.toLowerCase().includes("vexilla")) {
                modelSpecialWargear.push(asset.designation);
            }
        }
    }

    if (modelWargear.length > 0 && !modelAsset.lineage.includes("Unit")) {
        // For multi-model units, models carrying wargear should
        // be distinguished by name.  This is partly because it's
        // helpful to have a clear distinction for who's carrying
        // something like a medipack, and partly because some
        // wargear alters model characteristics and means we need
        // a separate statline for them on the datasheet.
        //
        // We check lineage because we don't want to do
        // this for single-model units, which are distinguished
        // by having the Unit represent the model. We only want to
        // add a single piece of wargear, because otherwise T'au
        // get stupid with battlesuit systems and drones - but we do
        // need to include all wargear that changes stats, e.g. shields
        // or vexillas, because as above we need models with unique
        // statlines to have unique names, but bloody T'au can have both
        // "Shield Drone" and "Shield Generator" on the same model, and
        // similarly Custodes can have models with vex, shield or both.
        if (modelSpecialWargear.length > 0) {
            for (let specialWargear of modelSpecialWargear) {
                model.name += " w/ " + specialWargear;
            }
        } else {
            model.name += " w/ " + modelWargear[0];
        }
    }

    // We do this last in case the model got renamed during child asset
    // processing.
    let profile = new Model.ModelCharacteristics(model.name, m, t, sv, w, ld, oc);
    unit.addProfile(profile);

    return model;
}

function parseAndAddWeapon(weaponAsset, model, unit, namePrefix = null) {
    if (weaponAsset.keywords.Tags && weaponAsset.keywords.Tags.includes("Multi-weapon")) {
        // This is a weapon consisting of multiple profiles.
        // We treat each profile - profiles here are further weapons
        // nested underneath this one - as a separate weapon.
        let mixedClasses = false;
        let classFound = null;
        for (let subAsset of weaponAsset.assets.traits) {
            if (classFound == null) {
                classFound = subAsset.classification;
            } else if (classFound != subAsset.classification) {
                mixedClasses = true;
                break;
            }
        }

        for (let subAsset of weaponAsset.assets.traits) {
            // The name of a profile should be prefixed with the name of the weapon.
            if (subAsset.classIdentity == "Weapon") {
                let weaponName = weaponAsset.name ?
                    `${weaponAsset.name} (${weaponAsset.aspects?.Label || weaponAsset.designation})`
                    : (weaponAsset.aspects?.Label || weaponAsset.designation);
                parseAndAddWeapon(subAsset, model, unit, weaponName);
            }
        }
    } else {
        let name = weaponAsset.name ?
            `${weaponAsset.name} (${weaponAsset.aspects?.Label || weaponAsset.designation})`
            : (weaponAsset.aspects?.Label || weaponAsset.designation);
        if (namePrefix != null) {
            name = namePrefix + " - " + name;
        }
        let isMelee = (weaponAsset.classification == "Melee Weapon");
        let range = isMelee ? Model.MELEE_RANGE : weaponAsset.stats.Range.processed.format.current;
        let a = weaponAsset.stats.A.processed.format.current;
        let bsws = isMelee ?
            weaponAsset.stats.WS.processed.format.current :
            weaponAsset.stats.BS.processed.format.current;
        let s = weaponAsset.stats.S.processed.format.current;
        let ap = weaponAsset.stats.AP.processed.format.current;
        let d = weaponAsset.stats.D.processed.format.current;

        let weapon = new Model.Weapon(name, range, a, bsws, s, ap, d);

        for (let asset of weaponAsset.assets.traits) {
            if (asset.classification == "Ability") {
                weapon.addAbility(parseAbility(asset));
            }
        }

        weapon.completeParse();

        model.addWeapon(weapon);
    }
}

function parseAbility(abilityAsset) {
    let text = abilityAsset.text;
    if (abilityAsset.keywords.Keywords && abilityAsset.keywords.Keywords.includes("Primarch")) {
        for (let childAsset of abilityAsset.assets.traits) {
            if (childAsset.classification == "Ability") {
                text += "\n" + (childAsset.name ? `${childAsset.name} (${childAsset.aspects?.Label || childAsset.designation})` : (childAsset.aspects?.Label || childAsset.designation)) + ": " + childAsset.text;
            }
        }
    }

    let keywords = [];
    if (abilityAsset.keywords.Keywords) {
        keywords = abilityAsset.keywords.Keywords;
    }
    if (abilityAsset.keywords.Tags) {
        keywords = keywords.concat(abilityAsset.keywords.Tags);
    }

    return new Model.Ability(
        (abilityAsset.name ? `${abilityAsset.name} (${abilityAsset.aspects?.Label || abilityAsset.designation})` : (abilityAsset.aspects?.Label || abilityAsset.designation)),
        abilityAsset.text,
        keywords);
}

function parseUnitChildAsset(unit, childAsset) {
    switch (childAsset.classification) {
        case "Model":
            unit.addModel(parseModel(childAsset, unit));
            break;

        case "Ability":
        case "Enhancement":
        case "Wargear":
            unit.addAbility(parseAbility(childAsset));
            break;

        // Single-model units may also have Weapon child assets.
        // They'll be handled later by re-parsing this unit as a model.
    }
}

function parseUnit(unitAsset, roster) {
    let unit = new Model.Unit((unitAsset.name ? `${unitAsset.name} (${unitAsset.aspects?.Label || unitAsset.designation})` : (unitAsset.aspects?.Label || unitAsset.designation)), roster);

    for (let asset of unitAsset.assets.traits) {
         parseUnitChildAsset(unit, asset);
    }

    for (let asset of unitAsset.assets.included) {
        parseUnitChildAsset(unit, asset);
    }

    for (let keyword of unitAsset.keywords.Faction) {
        unit.addFactionKeyword(keyword);
    }

    for (let keyword of unitAsset.keywords.Keywords) {
        unit.addOtherKeyword(keyword);
    }

    if (unit.models["models"].size == 0) {
        // If a unit has no child models, that means it consists of
        // a single model whose name matches the unit, and contains
        // the same child assets that a model asset would contain.
        // We can simply re-parse this asset as a model.
        unit.addModel(parseModel(unitAsset, unit));
    }

    unit.completeParse();

    return unit;
}


function findParents(asset) {
    // drill down through asset's traits and included assets and assign parents to each
    ['traits','included'].forEach(division => {
        asset.assets?.[division].forEach((subAsset,i,a) => {
            a[i].parent = asset;
            findParents(subAsset);
        });
    });
    return asset;
}
function discoverChildGamePieces(roster, asset) {
    ['traits','included'].forEach(division => {
        for (let subAsset of asset.assets?.[division]) {
            if (subAsset.aspects.Type ==='game piece' && !asset.parent) {
                let uuid = require('crypto').randomBytes(4).toString("hex");
                roster.order.unshift(uuid);
                roster.groups[uuid] = parseGamePiece(subAsset, roster, uuid);
            }
        }
    });
}
function parseGamePiece(asset, roster, uuid) {
    let group = {
        uuid: uuid,
        name: asset.name ? `${asset.name} (${asset.aspects?.Label || asset.designation})` : (asset.aspects?.Label || asset.designation),
        type: "game piece",
    };
    group.groupAsset = recurseAsset(asset);
    let moreuuid = require('crypto').randomBytes(8).toString("hex");
    group.gamePieces = {
        [moreuuid]: group.groupAsset,
    }
    return group;
}
function discoverGroups(roster, asset) {
    let hasChildGamePieces = false;
    ['traits','included'].forEach(division => {
        for (let subAsset of asset.assets?.[division]) {
            if (subAsset.aspects.Type ==='game piece') {
                hasChildGamePieces = true;
            }else{
                discoverGroups(roster, subAsset);
            }
        }
    });
    if (hasChildGamePieces && asset.parent) {
        let uuid = require('crypto').randomBytes(4).toString("hex");
        roster.order.unshift(uuid);
        roster.groups[uuid] = parseGroup(asset, roster, uuid);
    }
}


function parseGroup(asset, roster, uuid) {
    let group = {
        uuid: uuid,
        name: asset.name ? `${asset.name} (${asset.aspects?.Label || asset.designation})` : (asset.aspects?.Label || asset.designation),
    };
    group.groupAsset = recurseAsset(asset);
    let gamePieces = [];
    ['traits','included'].forEach(division => {
        asset.assets?.[division].filter(asset => asset.aspects.Type === "game piece").forEach((subAsset,i,a) => {
            gamePieces.push(recurseAsset(subAsset, 1));
        });
    });
    // make object from gamePieces array to group.gamePieces object with uid keys
    group.gamePieces = gamePieces.reduce((obj, model) => {
        const uuid = require('crypto').randomBytes(8).toString("hex");
        obj[uuid] = { ...obj[uuid], ...model };
        return obj;
    }, {});
    return group
}

function recurseAsset(asset, depth = 0) {
    let parsedAsset = parseAsset(asset);
    //flat map all assets and sub-assets with indentation value
    parsedAsset.assets = flatMapAssets(asset, depth);
    return parsedAsset
}
function parseAsset(asset) {
    let parsedAsset = {
        name: asset.name ? `${asset.name} (${asset.aspects?.Label || asset.designation})` : (asset.aspects?.Label || asset.designation),
        quantity: asset.quantity,
        keywords: asset.keywords,
        errors: asset.errors,
        description: asset.description,
        text: asset.text,
        type: asset.aspects.Type,
    };
    let statGroups = {};
    Object.entries(asset.stats || {}).forEach(([statName,stat]) => {
        if(!['hidden'].includes(stat.visibility) && (stat.processed.numeric.current !== null || stat.processed.rank.current !== null ||stat.processed.term.current !== null)) {
            let statGroup = stat.group || 'ungrouped';
            statGroups[statGroup] = statGroups[statGroup] || {groupOrder:0,stats:[]};
            statGroups[statGroup].groupOrder = stat.groupOrder || 0;
            statGroups[statGroup].stats.push({...stat,name: statName});
        }
    });
    let statGroupsSorted = Object.fromEntries(
        Object.entries(statGroups)
            .sort(([keyA, valueA], [keyB, valueB]) => {
                if (valueA.groupOrder === valueB.groupOrder) {
                    return keyA.localeCompare(keyB);
                }
                return valueA.groupOrder - valueB.groupOrder;
            })
    );
    // Move 'ungrouped' to the end if it exists
    if (statGroupsSorted.hasOwnProperty('ungrouped')) {
        const ungroupedValue = statGroupsSorted['ungrouped'];
        delete statGroupsSorted['ungrouped'];
        statGroupsSorted['ungrouped'] = ungroupedValue;
    }
    Object.keys(statGroupsSorted).forEach(statGroupKey => {
        statGroupsSorted[statGroupKey].stats = statGroupsSorted[statGroupKey].stats.sort((a,b) => a.statOrder - b.statOrder || a.name.localeCompare(b.name));
    });

    parsedAsset.stats = {};
    Object.keys(statGroupsSorted).forEach(statGroupKey => {
        let stats = {};
        statGroupsSorted[statGroupKey].stats.map(stat => {
            let statValue = stat.processed.format.current;
            statValue = statValue.replace(/<[^>]*>/g, '');
            if(!statValue){
                switch (stat.statType) {
                    case 'numeric': statValue = stat.processed.numeric.current; break;
                    case 'rank':    statValue = stat.processed.rank.current;    break;
                    case 'term':    statValue = stat.processed.term.current;    break;
                    default:        break;
                }
            }
            stats[stat.name] = statValue;
        });
        parsedAsset.stats = {...stats};
    });
    return parsedAsset
}


function flatMapAssets(asset, depth = 0) {
    let divisions = ['traits','included'];
    let flattenedAsset = parseAsset(asset);
    flattenedAsset.assetDepth = depth;

    let flattened = [flattenedAsset];
  
    let assetsDisplay = orderAssets(asset,);
    divisions.forEach(division => {
        let assetGroupIndex = null;
        let toPush = [];

        Object.keys(assetsDisplay?.[division] || {}).forEach(assetGroup => {
            // make group header
            if(!divisions.includes(assetGroup) && assetsDisplay?.[division][assetGroup]?.length){
                let assetGroupElement = {
                    group: assetGroup,
                    assetDepth: flattenedAsset.assetDepth + 1,
                };
                toPush.push(assetGroupElement);
                assetGroupIndex = toPush.length - 1;
            }
            // recurse through tree
            assetsDisplay?.[division][assetGroup]?.forEach((subAsset,i,a) => {
                let subAssets = flatMapAssets(a[i], depth + 1);
                toPush.push(...subAssets);
            });
        });

        flattened.push(...toPush);
    });
  
    return flattened
}


  /** Sorts assets based on their aspects
   * @param asset
   * @returns AssetDisplay
   */
  function orderAssets(asset){
    let assetsDisplay = {
        traits: {},
        included: {}
    };
    if(asset.aspects['Group Includes']){
        asset.allowed?.classifications?.forEach(className => {
            if(!asset.disallowed?.classifications?.includes(className)){
                assetsDisplay.included[className] = [];
            }
        });
        asset.allowed?.items?.forEach(itemName => {
            let className = itemName.split('§')[0];
            if(!asset.disallowed?.classifications?.includes(className) && !asset.disallowed?.items.includes(itemName)){
                assetsDisplay.included[className] = [];
            }
        });
    }else{
        assetsDisplay.included.included = []
    }
    let includes = asset.assets?.included || [];
    if(asset.aspects['Order Includes A–Z']){
        includes = sortItems(includes);
        includes.forEach((include,i,a) => {
            let newCrumbs = include.breadcrumbsRegistry.slice(0,-1);
            newCrumbs.push(i)
            a[i].breadcrumbsRegistry = [...newCrumbs];
        });
    }
    let currentClasses = Array.from(new Set(asset.assets.included.map(subAsset => subAsset.classification)));
    let groupSort = asset.assets?.included.filter(subAsset => subAsset.aspects?.['Group By']).map(subAsset => subAsset.aspects?.['Group By']);
    if(asset.aspects['Group Includes']){
        currentClasses.forEach(className => {
            assetsDisplay.included[className] = [];
        });
    }else if(groupSort?.length){
        let sortingGroups = new Set();
        currentClasses.forEach(className => {
            let classGroup = new Set();
            let keyGroup = new Set();
            asset.assets?.included?.forEach((subAsset) => {
                if(subAsset.classification === className){
                    if(subAsset.aspects?.['Group By'] && subAsset.keywords?.[subAsset.aspects?.['Group By']][0]){
                        keyGroup.add(subAsset.keywords[subAsset.aspects?.['Group By']][0]);
                    }else{
                        classGroup.add(className);
                    }
                }
            });
            sortingGroups = new Set([...sortingGroups, ...classGroup]);
            sortingGroups = new Set([...sortingGroups, ...Array.from(keyGroup).sort()]);
        });
        Array.from(sortingGroups).forEach(sortingGroup => {
            assetsDisplay.included[sortingGroup] = [];
        });
    }
    asset.assets?.included?.forEach((subAsset) => {
        let className = asset.item.split('§')[0];
        if(!asset.disallowed?.classifications?.includes(className) && !asset.disallowed?.items?.includes(asset.item)){
            if(asset.aspects?.['Group Includes']){
                assetsDisplay.included[subAsset.classification] = assetsDisplay.included[subAsset.classification] || [];
                assetsDisplay.included[subAsset.classification].push(subAsset);
            }else if(subAsset.aspects?.['Group By']){
            let keySort = subAsset.keywords[subAsset.aspects?.['Group By']][0] || 'included';
                assetsDisplay.included[keySort] = assetsDisplay.included[keySort] || [];
                assetsDisplay.included[keySort].push(subAsset);
            }else{
                assetsDisplay.included.included = assetsDisplay.included.included || [];
                assetsDisplay.included.included.push(subAsset);
            }
        }
    });
    asset.assets?.traits?.forEach((subAsset) => {
        if(asset.aspects?.['Group Traits']){
            assetsDisplay.traits[subAsset.classification] = assetsDisplay.traits[subAsset.classification] || [];
            assetsDisplay.traits[subAsset.classification].push(subAsset);
        }else if(subAsset.aspects?.['Group By']){
            let keySort = subAsset.keywords[subAsset.aspects?.['Group By']][0] || 'traits';
            assetsDisplay.traits[keySort] = assetsDisplay.traits[keySort] || [];
            assetsDisplay.traits[keySort].push(subAsset);
        }else{
            assetsDisplay.traits.traits = assetsDisplay.traits.traits || [];
            assetsDisplay.traits.traits.push(subAsset);
        }
    });
    return assetsDisplay;
}

function sortItems(items){
    logMethods('sortItems');
    return items?.sort((a, b) => {
        // sorts by item designation using splitting §
        let aSort = (typeof a === 'string' ? a : a.item).split('§')[1];
        let bSort = (typeof b === 'string' ? b : b.item).split('§')[1];
        return aSort?.toLowerCase().localeCompare(bSort?.toLowerCase())
    })
}

module.exports.rosterizerParse = (rawData, legacy = false) => {
    const json = extractRegistryJSON(rawData);
    let roster = parseRegistry(json, legacy);
    return roster;
}