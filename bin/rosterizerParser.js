const AdmZip = require("adm-zip");
const Model = require("./dataModel");
const { raw } = require("body-parser");
const { parse } = require("path");
equal = require('fast-deep-equal');

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

function parseRegistry(registry, decorativeNames = false) {
    let rosterYs = new Model.Roster(
        //name, game, dataSet, edition, version, app, appVersion, hash
        registry.name || 'Unnamed ' + (registry.aspects.Label || 'Roster'),
        registry.info.game,
        registry.info.name,
        registry.info.rulebookVersion.split('.')[0],
        registry.info.rulebookVersion,
        'Rosterizer',
        registry.info.appVersion,
        registry.info.hash,
        decorativeNames,
    );
    Object.entries(registry.meta).forEach(([key, value]) => rosterYs.addMeta(key, value));
    let registryParents = findParents(deepCopyObj(registry));
    discoverChildGamePieces(rosterYs, registryParents);
    discoverGroups(rosterYs, registryParents);
    rosterYs.errors = registryParents.errors.map(error => error.name + ': ' + error.message);
    return rosterYs;
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
function discoverChildGamePieces(rosterYs, asset) {
    ['traits','included'].forEach(division => {
      for (let subAsset of asset.assets[division]) {
        if (subAsset.aspects.Type === 'game piece' && (!asset.parent || !subAsset.meta?.ttsPartOfGroup)) {
            rosterYs.addGroup(parseGamePiece(subAsset, require('crypto').randomBytes(4).toString('hex')));
        }
        discoverChildGamePieces(rosterYs, subAsset);
      }
    });
}
function parseGamePiece(asset, uuid) {
    let groupAsset = recurseAsset(asset);
    let group = new Model.Group(
        asset.name ? `${asset.name} (${asset.aspects?.Label || asset.designation})` : (asset.aspects?.Label || asset.designation),
        'game piece',
        asset.classification,
        groupAsset,
    );
    group.meta = asset.meta;
    
    group.groupAsset.createDescription(group);
    return group;
}
function discoverGroups(rosterYs, asset) {
    let hasChildGamePieces = false;
    ['traits','included'].forEach(division => {
        for (let subAsset of asset.assets?.[division]) {
            if (subAsset.aspects.Type === 'game piece' && subAsset.meta?.ttsPartOfGroup) {
                hasChildGamePieces = true;
            }
            discoverGroups(rosterYs, subAsset);
        }
    });
    if (hasChildGamePieces && asset.parent) {
        rosterYs.addGroup(parseGroup(asset, require('crypto').randomBytes(4).toString('hex')));
    }
}


function parseGroup(asset, uuid) {
    let groupAsset = recurseAsset(asset);
    let group = new Model.Group(
        asset.name ? `${asset.name} (${asset.aspects?.Label || asset.designation})` : (asset.aspects?.Label || asset.designation),
        'group',
        asset.classification,
        groupAsset,
    );
    group.meta = asset.meta;
    let gamePieces = [];
    ['traits','included'].forEach(division => {
        asset.assets?.[division].filter(asset => asset.aspects.Type === 'game piece').forEach((subAsset,i,a) => {
            gamePieces.push(recurseAsset(subAsset, 1));
        });
    });
    gamePieces.forEach(gamePiece => {
        gamePiece.createDescription(group);
    });
    // make object from gamePieces array to group.gamePieces object with uid keys
    group.gamePieces = gamePieces.reduce((obj, gamePiece) => {
      const uuid = require('crypto').randomBytes(8).toString('hex');
      obj[uuid] = { ...obj[uuid], ...gamePiece };
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
    let parsedAsset = new Model.Asset(
        asset.name ? `${asset.name} (${asset.aspects?.Label || asset.designation})` : (asset.aspects?.Label || asset.designation),
        asset.aspects.Type,
    );
    parsedAsset.setQuantity(Number(asset.quantity) || 1)
    parsedAsset.keywords = asset.keywords || {};
    parsedAsset.errors = asset.errors || [];
    parsedAsset.meta = asset.meta || {};
    parsedAsset.setText(asset.text || '');
    parsedAsset.setDescription(asset.description || '');
    delete parsedAsset.keywords.Tags;
    Object.keys(parsedAsset.keywords || {}).forEach(keyCat => {
      if(!parsedAsset.keywords[keyCat].length) delete parsedAsset.keywords[keyCat];
    });
    let statGroups = {};
    Object.entries(asset.stats || {}).forEach(([statName,stat]) => {
        if(
            !['hidden'].includes(stat.visibility)
            && (stat.value !== null)
            && (!asset.meta.ttsStatDisplay || asset.meta.ttsStatDisplay.split(',').includes(statName))
        ) {
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
        parsedAsset.stats = {...parsedAsset.stats,...stats};
    });
    return parsedAsset
}

function flatMapAssets(asset, depth = 0) {
    let divisions = ['traits','included'];
    let flattenedAsset = parseAsset(asset);
    flattenedAsset.assetDepth = depth;

    let flattened = [flattenedAsset];

    let assetsDisplay = orderAssets(asset,null);
    divisions.forEach(division => {
      let assetsQuantized = quantizeAssetGroups(assetsDisplay?.[division] || {});
      let assetGroupIndex = null;
      let toPush = [];

      Object.keys(assetsQuantized || {}).forEach(assetGroup => {
          // make group header
          if(!divisions.includes(assetGroup) && assetsQuantized[assetGroup]?.length){
              let assetGroupElement = {
                  group: assetGroup,
                  assetDepth: flattenedAsset.assetDepth + 1,
              };
              toPush.push(assetGroupElement);
              assetGroupIndex = toPush.length - 1;
          }
          // recurse through tree
          assetsQuantized[assetGroup]?.forEach((subAsset,i,a) => {
              let subAssets = flatMapAssets(a[i], depth + 1);
              toPush.push(...subAssets);
          });
      });

      flattened.push(...toPush);
    });

    return flattened
}
function quantizeAssetGroups(assetGroups){
    let newAssetGroups = {};
    Object.keys(assetGroups).forEach(assetGroup => {
      newAssetGroups[assetGroup] = assetQuantization(assetGroups[assetGroup] || []);
    });
    return newAssetGroups
}
function assetQuantization(assets){
    let oldAssetList = [...assets];
    let newAssetList = [];
    while(oldAssetList.length){
      let asset = {...oldAssetList[0]};
      // trim the asset
      oldAssetList.shift();
      let newQty = Number(asset.quantity) || 1;
      let combinedNames = [asset.name || ''];
      let combinedDescriptions = [asset.description || ''];
      let newAsset = {...asset,quantity: null,name: null,description: null};
      let newAssetStats = Object.entries(newAsset.stats || {}).map(([key,value]) => [key,value.processed.format.current]);
      if(oldAssetList.length){
        for(let j = 0; j < oldAssetList.length; j++){
          let compareAsset = oldAssetList[j] ? {...oldAssetList[j],quantity: null} : null;
          let compareAssetStats = Object.entries(compareAsset?.stats || {}).map(([key,value]) => [key,value.processed.format.current]);
          if(oldAssetList[j] && equal({...newAsset.bareAsset,quantity:null,name:null,description:null},{...compareAsset.bareAsset,quantity:null,name:null,description:null}) && equal(newAssetStats,compareAssetStats)){
            newQty += Number(oldAssetList[j]) || 1;
            combinedNames.push(oldAssetList[j].name || '');
            combinedDescriptions.push(oldAssetList[j].description || '');
            delete oldAssetList[j];
          }
        };
      }
      // de-sparse oldAssetList
      oldAssetList = oldAssetList.filter(asset => asset);
      newAsset.quantity = newQty;
      newAsset.name = combinedNames.filter(name => name).join(', ');
      newAsset.description = '';
      combinedDescriptions.forEach((desc,i) => {
        if(desc) newAsset.description += (newAsset.description ? '\n\n' : '') + (combinedNames[i] ? combinedNames[i] + ': ' : '') + desc;
      });
      newAssetList.push(newAsset);
    };
    return newAssetList
}


/**
 * Deep copies an object
 * TODO examine if this is correct
 * @param obj object to be copied
 * @returns Reference to new copy of object
 */
function deepCopyObj(obj, cloned = new WeakMap()) {
    if (null == obj || typeof obj !== 'object') return obj;
  
    if (cloned.has(obj)) {
      return cloned.get(obj);
    }
  
    let copy;
  
    if (obj instanceof Array) {
      copy = [];
      cloned.set(obj, copy);
      for (let i = 0, len = obj.length; i < len; i++) {
        copy[i] = deepCopyObj(obj[i], cloned);
      }
    } else if (obj instanceof Object) {
      copy = {};
      cloned.set(obj, copy);
      for (let attr in obj) {
        if (obj.hasOwnProperty(attr) && attr !== 'parent') {
          if (cloned.has(obj[attr])) {
            copy[attr] = cloned.get(obj[attr]);
          } else {
            copy[attr] = deepCopyObj(obj[attr], cloned);
          }
        }
      }
    } else {
      return obj;
    }
  
    return copy;
}
/**
   * Sorts items inside an asset
   * @param items items to be sorted
   * @returns sorted items[]
   */
function sortItems(items){
    return items?.sort((a, b) => {
        // sorts by item designation using splitting §
        let aSort = (typeof a === 'string' ? a : a.item).split('§')[1];
        let bSort = (typeof b === 'string' ? b : b.item).split('§')[1];
        return aSort?.toLowerCase().localeCompare(bSort?.toLowerCase())
    })
}

function orderAssets(asset, rulebook){
    let assetsDisplay = {
      traits: {},
      included: {}
    };
    if(asset.aspects['Group Includes']){
      asset.allowed?.classifications?.forEach(className => {
        rulebook?.processed?.assetMorphology?.[className]?.legacy?.forEach(allowedClass => {
          if(!asset.disallowed?.classifications?.includes(allowedClass)){
            if(Object.keys(rulebook?.processed?.composedDependencies.assetCatalog).filter(itemKey => itemKey.split('§')[0] === allowedClass).length){
              assetsDisplay.included[allowedClass] = [];
            }
          }
        });
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
    let allowedClasses = getAllowedClasses(asset,rulebook);
    let groupSort = asset.assets?.included.filter(subAsset => subAsset.aspects?.['Group By']).map(subAsset => subAsset.aspects?.['Group By']);
    if(asset.aspects['Group Includes']){
      allowedClasses.forEach(className => {
        assetsDisplay.included[className] = [];
      });
    }else if(groupSort?.length){
      let sortingGroups = new Set();
      allowedClasses.forEach(className => {
        let classGroup = new Set();
        let keyGroup = new Set();
        asset.assets?.included?.forEach((subAsset) => {
          if(subAsset.classification === className){
            if(subAsset.aspects?.['Group By'] && subAsset.keywords?.[subAsset.aspects?.['Group By']]?.[0]){
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
          let groupBy = subAsset.aspects?.['Group By'];
          let keysSort = [];
          if(subAsset.aspects.Type === 'game piece'){
            keysSort = subAsset.keywords?.[groupBy]?.length ? [subAsset.keywords[groupBy][0]] : ['included'];
          }else{
            keysSort = subAsset.keywords?.[groupBy]?.length ? subAsset.keywords[groupBy] : ['included'];
          }
          keysSort.forEach(key => {
            assetsDisplay.included[key] = assetsDisplay.included[key] || [];
            assetsDisplay.included[key].push(subAsset);
          });
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
        let groupBy = subAsset.aspects?.['Group By'];
        let keysSort = [];
        if(subAsset.aspects.Type === 'game piece'){
          keysSort = subAsset.keywords?.[groupBy]?.length ? [subAsset.keywords[groupBy][0]] : ['traits'];
        }else{
          keysSort = subAsset.keywords?.[groupBy]?.length ? subAsset.keywords[groupBy] : ['traits'];
        }
        keysSort.forEach(key => {
          assetsDisplay.traits[key] = assetsDisplay.traits[key] || [];
          assetsDisplay.traits[key].push(subAsset);
        });
      }else{
        assetsDisplay.traits.traits = assetsDisplay.traits.traits || [];
        assetsDisplay.traits.traits.push(subAsset);
      }
    });
    return assetsDisplay;
}

function getAllowedClasses(asset, rulebook) {
    const allowedClasses = asset.allowed?.classifications;
    let allowedLegacies = new Set();

    function getTemplatedClasses(className) {
      // Fetch templated classes for className
      const templatedClasses = Object.entries(rulebook?.processed?.assetMorphology || {}).filter(([clnm,classification]) => classification.templateClass === className).map(([clnm]) => clnm);
      templatedClasses.forEach((templatedClass) => {
        allowedLegacies.add(templatedClass);
        // Recursively add templated classes for each templated class
        getTemplatedClasses(templatedClass);
      });
    }

    allowedClasses?.forEach(className => {
      allowedLegacies.add(className);
      getTemplatedClasses(className);
    });
    asset.allowed?.items?.forEach(item => allowedLegacies.add(item.split('§')[0]));
    return Array.from(allowedLegacies)
  }

module.exports.rosterizerParse = (rawData, decorativeNames) => {
    const json = extractRegistryJSON(rawData);
    let roster = parseRegistry(json, decorativeNames);
    return roster;
}