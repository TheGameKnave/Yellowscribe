// Data model to support arbitrary game systems' rosters.


class Roster {
    name = "Unnamed Roster";
    game = "";
    dataSet = "";
    edition = "";
    version = "";
    app = "";
    appVersion = "";
    hash = "";
    meta = new Map();  
    order = [];
    groups = new Map();
    errors = [];
    decorativeNames;

    constructor(name, game, dataSet, edition, version, app, appVersion, hash, decorativeNames = false) {
        this.name = name;
        this.game = game;
        this.dataSet = dataSet;
        this.edition = edition;
        this.version = version;
        this.app = app;
        this.appVersion = appVersion;
        this.hash = hash;
        this.decorativeNames = decorativeNames;
    }

    addGroup(group) {
        this.order.push(group.uuid);
        this.groups.set(group.uuid, group);
    }

    addError(error) {
        this.errors.push(error);
    }

    addMeta(key, value) {
        this.meta.set(key, value);
    }
}

class Group {
    name;
    type; // group (if it contains pieces) or game piece if it's a single model/figure/token
    uuid = require('crypto').randomBytes(4).toString("hex");
    meta = new Map(); // meta information about the group
    groupClass; // whatever the classification of the group is
    groupAsset; // the asset that was used to create this group
    gamePieces = new Map(); // uuid -> GamePiece; each discrete model/figure/token in the group.
                            // A group can be a single game piece, in which case it will have
                            // no objects in gamePieces; the groupAsset will be the only asset.

    constructor(name, type, groupClass, groupAsset) {
        this.name = name;
        this.type = type;
        this.groupClass = groupClass;
        this.groupAsset = groupAsset;
    }

    setGroupAsset(groupAsset) {
        this.groupAsset = groupAsset;
    }

    addGamePiece(gamePiece) {
        this.gamePieces.set(require('crypto').randomBytes(8).toString("hex"), gamePiece);
    }

    addMeta(key, value) {
        this.meta.set(key, value);
    }
}

class AssetGroup {
    // AssetGroup represents the header of a class of assets, e.g. "Weapons".
    group;
    assetDepth;

    constructor(group, assetDepth) {
        this.group = group;
        this.assetDepth = assetDepth;
    }
}

class Asset {
    name; // name of the asset
    type; // 'game piece' or 'conceptual'
    assetDepth; // level of indentation
    meta = new Map(); // meta information about the asset
    assets = []; // sub-assets of this asset
    description; // user-defined description text
    errors = []; // errors associated with the asset
    keywords = {}; // keywords associated with the asset
    quantity = 1; // quantity of the asset
    stats = {}; // stats associated with the asset
    text; // data-defined rules text for the asset
    ttsDescription; // tooltip contents for tabletop simulator
    ttsNickname; // tooltip title for tabletop simulator

    constructor(name, type) {
        this.name = name;
        this.type = type;
    }

    setAssetDepth(assetDepth) {
        this.assetDepth = assetDepth;
    }

    addMeta(key, value) {
        this.meta.set(key, value);
    }

    addError(error) {
        this.errors.push(error);
    }

    addAsset(asset) {
        this.assets.push(asset);
    }

    addKeyword(cat, value) {
        this.keywords[cat] = this.keywords[cat] || [];
        if(Array.isArray(value)) {
            this.keywords[cat].push(...value);
        } else {
            this.keywords[cat].push(value);
        }
    }

    setText(text) {
        this.text = text;
    }

    setDescription(description) {
        this.description = description;
    }

    setQuantity(quantity) {
        this.quantity = quantity;
    }

    createDescription(group){
        this.ttsDescription = '';
        let assetClusters = this.findClusters(this.assets);
        let nicknameAppend = [];
        let initialDepth = assetClusters[0][0].assetDepth;
        assetClusters.forEach((assetCluster,k) => {
        if(assetCluster.length === 1 && (assetCluster[0].group || Object.keys(assetCluster[0].stats || {}).length || (assetClusters[k+1] && assetCluster[0].assetDepth < assetClusters[k+1][0].assetDepth))) this.ttsDescription += this.makeTtsDescription(assetCluster[0], initialDepth, assetCluster[0].assetDepth === initialDepth);
        else{
            let displayDepth = assetCluster[0].assetDepth - initialDepth === 0 ? 0 : (assetCluster[0].assetDepth - initialDepth - 1);
            let indentation = ' '.repeat(displayDepth * 4);
            let currWidth = indentation.length;
            let currLine = 0;
            let lines = [[]];
            assetCluster.forEach((asset,i) => {
            let assetWidth = this.calculateStringLength(asset.name);
            let spaceLeft = 75 - currWidth;
            if(assetWidth + 3 > spaceLeft){
                currLine++;
                currWidth = 0;
                lines.push([]);
            }
            lines[currLine].push(asset.name + (i === assetCluster.length - 1 ? '' : ', '));
            if(asset.meta.ttsAppendToParentNickname) nicknameAppend.push(asset.name);
            currWidth += assetWidth + 3;
            });
            let linesStr = '\n' + indentation + '[88ccaa]' + lines.map(line => line.join('')).join('\n' + indentation).replace(/,\s/g, '[-], [88ccaa]') + '[-]';
            this.ttsDescription += linesStr;
        }
        });
        if(this.meta?.ttsPartOfGroup){
            let groupAssetClusters = this.findClusters(group.groupAsset?.assets || [], true);
            if(groupAssetClusters.length){
                this.ttsDescription += `\n\n[u]${group.groupClass}:[/u]`;
                let groupInitialDepth = groupAssetClusters[0][0].assetDepth;
                groupAssetClusters.forEach((assetCluster,i) => {
                    if(assetCluster.length === 1 && (assetCluster[0].group || Object.keys(assetCluster[0].stats || {}).length || assetCluster[0].assets?.traits?.length || assetCluster[0].assets?.included?.length)) this.ttsDescription += this.makeTtsDescription(assetCluster[0], groupInitialDepth);
                    else{
                        let displayDepth = assetCluster.assetDepth - initialDepth === 0 ? 0 : (assetCluster.assetDepth - initialDepth - 1);
                        this.ttsDescription += '\n' + ' '.repeat(displayDepth * 4) + '[88ccaa]' + assetCluster.map(asset => asset.name).join('[-], [88ccaa]') + '[-]';
                    }
                });
            }
        }

        this.ttsNickname = this.name;
        if(nicknameAppend.length) this.ttsNickname += ' w/' + nicknameAppend.join(', ');
        this.ttsNickname += (group.meta.ttsDamageStat && this.stats[group.meta.ttsDamageStat] !== undefined ? '\n[00ff33]' + this.stats[group.meta.ttsDamageStat] + '/' + this.stats[group.meta.ttsDamageStat] + '[-] ' : '');
    }

    findClusters(assets, skipGamePieces = false){
        let assetClusters = [];
        let curClust = [];
        let assetList = skipGamePieces ? this.filterGamePiecesAndSubAssets(assets) : assets;
        assetList.forEach((asset,i) => {
        if(
            !asset.group
            && !Object.keys(asset.stats || {}).length 
            && (!assets[i+1] || asset.assetDepth >= assets[i+1].assetDepth)
        ) {
            curClust.push(asset);
        } else {
            let bool = !asset.group && asset.type !== 'game piece' && (!assets[i-1] || asset.assetDepth === assets[i-1].assetDepth) && (!assets[i+1] || asset.assetDepth >= assets[i+1].assetDepth);
            if(bool) curClust.push(asset);
            if(curClust.length) assetClusters.push(curClust);
            curClust = [];
            if(!bool) assetClusters.push([asset]);
        }
        });
        if(curClust.length) assetClusters.push(curClust);
        return assetClusters
    }
    filterGamePiecesAndSubAssets(assets){
        const filteredAssets = [];
        let skipDepth = null;

        for (let i = 1; i < assets.length; i++) {
        const asset = assets[i];

        if(asset.group && assets[i+1]?.type === 'game piece'){
            // do nothing
        }else if (asset.type === 'game piece') {
            skipDepth = asset.assetDepth;
        } else if (skipDepth === null || asset.assetDepth <= skipDepth) {
            filteredAssets.push(asset);
            skipDepth = null;
        }
        }
        return filteredAssets;
    }

    makeTtsDescription(asset, initialDepth, fancyStats = false){
        let descFrag = '';
        if(fancyStats) descFrag = this.descriptionStats(asset, fancyStats);
        else {
        let displayDepth = asset.assetDepth - initialDepth === 0 ? 0 : (asset.assetDepth - initialDepth - 1);
        let indentation = '\n' + ' '.repeat(displayDepth * 4);
        if(asset.group){
            let groupColor = ['combat', 'attack', 'weapon'].some(word => asset.group.toLowerCase().includes(word)) ? 'ff6666' : 'ccaaff';
            descFrag = '\n' + indentation + '[i][' + groupColor + ']' + asset.group + '[-][/i]';
        }
        else {
            descFrag += `${indentation}${asset.quantity > 1 ? asset.quantity + '× ' : ''}[b]${asset.name}[/b]`;
            if(Object.keys(asset.stats || {}).length) descFrag += `${this.descriptionStats(asset, fancyStats, initialDepth)}`;
        }
        }
        return descFrag
    }

    descriptionStats(asset, fancyStats = false, initialDepth = 0){
        let statline = '[cccccc]';
        let displayStats = {};
        if(!asset.meta?.ttsStatDisplay) displayStats = asset.stats;
        else {
        asset.meta.ttsStatDisplay.split(',').forEach(statName => {
            if(asset.stats[statName]) displayStats[statName] = asset.stats[statName];
        });
        }
        if(!fancyStats){
        let displayDepth = asset.assetDepth - initialDepth === 0 ? 0 : (asset.assetDepth - initialDepth - 1);
        let indentation = ' '.repeat(displayDepth * 4);
        let currWidth = indentation.length;
        let currLine = 0;
        let lines = [[]];
        Object.keys(displayStats || {}).forEach((statName,i) => {
            let statValue = displayStats[statName];
            let statWidth = this.calculateStringLength(statName + ': ' + statValue);
            let spaceLeft = 75 - currWidth;
            if(statWidth > spaceLeft){
            currLine++;
            currWidth = 0;
            lines.push([]);
            }
            lines[currLine].push(`${statName}: [ffaa00]${statValue}[-]   `);
            currWidth += statWidth + 3;
        });
        statline += '\n' + indentation + lines.map(line => line.join('').trimEnd()).join('\n' + indentation);
        }else{
        let currWidth = 0;
        let currLine = 0;
        let headlines = [[]];
        let valuelines = [[]];
        Object.keys(displayStats || {}).forEach((statName,i) => {
            let statValue = displayStats[statName];
            let statNameWidth = this.calculateStringLength(statName);
            let statValueWidth = this.calculateStringLength(displayStats[statName]);
            let statWidth = Math.max(statNameWidth,statValueWidth);
            let spaceLeft = 75 - currWidth;
            if(statWidth > spaceLeft){
            currLine++;
            currWidth = 0;
            headlines.push([]);
            valuelines.push([]);
            }
            headlines[currLine].push(`${' '.repeat(Math.floor((statWidth - statNameWidth) / 2))}${statName}${' '.repeat(Math.ceil((statWidth - statNameWidth) / 2) + 3)}`);
            valuelines[currLine].push(`[ffaa00]${' '.repeat(Math.floor((statWidth - statValueWidth) / 2))}${statValue}${' '.repeat(Math.ceil((statWidth - statValueWidth) / 2) + 3)}[-]`);
            currWidth += statWidth + 3;
        });
        let linesStr = '';
        for(let i = 0; i < headlines.length; i++){
            linesStr += (i ? '\n' : '') + headlines[i].join('').trimEnd();
            linesStr += '\n' + valuelines[i].join('').trimEnd();
            linesStr += `\n${'-'.repeat(48)}`;
        }
        statline += linesStr;
        }
        statline += '[-]';
        return statline
    }

    // Function to guess the length of a string in spaces based on character widths
    
    calculateStringLength(str) {
        let totalLength = 0;
    
        for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const charLen = charLengths[char];
        
        if (charLen) {
            totalLength += charLen;
        } else {
            // Handle characters not found in the charLengths constant
            totalLength += 10; // Default length for characters not found
        }
        }
        return Math.round(totalLength / charLengths[' ']);
    }
}

const charLengths = {
    '\'': 7,
    '‘': 8, '’': 8, '′': 8,
    'i': 9, 'j': 9, 'I': 9, 'J': 9, ' ': 9,
    'l': 10, ';': 10, ':': 10, ',': 10, '.': 10,
    '!': 11, '|': 11,
    'f': 13, 'r': 13, 't': 13, '[': 13, ']': 13, '{': 13, '}': 13, '"': 13, '″': 13,
    '-': 14, '(': 14, ')': 14,
    'c': 15, 's': 15, 'z': 15, '\\': 15, '“': 15, '”': 15,
    'L': 16, '*': 16, '<': 16, '>': 16, '?': 16,
    'e': 17, 'x': 17,
    'E': 18, 'F': 18, 'S': 18, 'T': 18, '`': 18, '=': 18, '_': 18, '+': 18, '–': 18,
    'a': 19, 'b': 19, 'd': 19, 'g': 19, 'h': 19, 'k': 19, 'o': 19, 'p': 19, 'q': 19, 'v': 19, 'y': 19, 'C': 19, 'P': 19, 'Z': 19, '~': 19, '$': 19, '^': 19,
    'n': 20, 'u': 20, 'B': 20, 'Y': 20, '1': 20, '2': 20, '3': 20, '4': 20, '5': 20, '6': 20, '7': 20, '8': 20, '9': 20, '0': 20,
    'K': 21, 'R': 21, 'V': 21, 'X': 21, '&': 21,
    'A': 22, 'G': 22, '#': 22,
    'D': 23, 'U': 23,
    'H': 24, 'N': 24, 'O': 24, 'Q': 24,
    '—': 25,
    'w': 28,
    'm': 29, 'M': 29,
    '%': 30,
    'W': 31,
    '@': 32,
};

module.exports = {Roster, Group, Asset, AssetGroup}