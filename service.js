const http = require('http'),
    fs = require('fs'),
    crypto = require('crypto'),
    path = require('path'),
    statik = require("node-static"),
    MODULE_PATH = "lua_modules",
    HOMEPAGE = "bs2tts.html";
const {rosterizerParse} = require("./bin/rosterizerParser");
const {roszParse} = require("./bin/roszParser");
const Roster = require("./bin/9eRoster");
const ttsScript = require("./bin/ttsScript");


const TEN_MINUTES = 600000,
    PATH_PREFIX = "files/",
    FILE_NAME_REGEX = /(?<name>.+?)(?=.json)/,

    ERRORS = {
        invalidFormat: `<h2 class='error'>I can only accept .regiztry, .rosz and .ros files.</h2>
        <p>
            Please make sure you are attempting to upload your roster and not another file by accident!
        </p>`
            .replace(/[\n\r]/g, "\\n"),
        unknown: `<h2 class='error'>Something went wrong.</h2>
        <p>
            Please reach out to ThePants999 in the <a href='https://discord.gg/kKT6JKsdek'>Yellowscribe discord server</a>.
            Please send your .regiztry/.rosz file along with your bug report, and thank you so much for your patience!
        </p>`
            .replace(/[\n\r]/g, "\\n"),
        fileWrite: `<h2 class='error'>Something went wrong while creating your roster.</h2>
        <p>
            Please reach out to ThePants999 in the <a href='https://discord.gg/kKT6JKsdek'>Yellowscribe discord server</a>.
            Please send your .regiztry/.rosz file along with your bug report, and thank you so much for your patience!
        </p>`
            .replace(/[\n\r]/g, "\\n"),
        rosterNotFound: "Your roster code appears to have expired, please upload it again and get a new code."
    },
    SANITIZATION_MAPPING = {
        " & ": " and ",
        ">": "＞",
        "<": "＜"
    },

    SANITIZATION_REGEX = new RegExp(Object.keys(SANITIZATION_MAPPING).join("|"), "g");

const file = new statik.Server('./site'),
    currentFiles = new Set(
        fs.readdirSync(PATH_PREFIX)
        .filter(filename => FILE_NAME_REGEX.test(filename))
        .map(fileName => fileName.match(FILE_NAME_REGEX).groups.name)),
    server = http.createServer(function (req, res) {
        if (req.method === 'POST') {
            let data = [], dataLength = 0;

            req.on('data', chunk => {
                data.push(chunk);
                dataLength += chunk.length
            })
            .on('end', () => {
                let postURL = new URL(`http://${req.headers.host}${req.url}`),
                    buf = Buffer.alloc(dataLength),
                    uuid;

                do uuid = crypto.randomBytes(4).toString("hex");
                while (currentFiles.has(uuid));

                currentFiles.add(uuid);

                for (let i = 0, len = data.length, pos = 0; i < len; i++) {
                    data[i].copy(buf, pos);
                    pos += data[i].length;
                }

                if (postURL.pathname === "/getFormattedArmy") {
                    try {
                        let filename = postURL.searchParams.get("filename");
                        let wargearAllocationMode = "allModels";
                        if (postURL.searchParams.get("allocationMode")) {
                            wargearAllocationMode = postURL.searchParams.get("allocationMode");
                        }
                        let armyDataObj;
                        if (path.extname(filename) == '.regiztry') {
                            // Rosterizer registry
                            armyDataObj = rosterizerParse(buf);
                        } else {
                            // Battlescribe roster
                            armyDataObj = roszParse(buf, wargearAllocationMode);
                        }
                         sendHTTPResponse(res, Roster.serialize(armyDataObj, 2), 200);
                    } catch (err) {
                        if (err.toString().includes("Invalid or unsupported zip format.")) {
                            sendHTTPResponse(res, `{ "err": "${ERRORS.invalidFormat}" }`, 415);
                            console.log(err);
                        } else {
                            sendHTTPResponse(res, `{ "err": "${ERRORS.unknown}" }`, 500);
                            console.log(err);
                        }
                    }
                } else if (postURL.pathname === "/getArmyCode") {
                    try {
                        let armyData = JSON.parse(buf.toString());

                        sendHTTPResponse(res, `{ "code": "${uuid}" }`, 200);

                        formatAndStoreRoster(uuid,
                            armyData.edition,
                            armyData.order,
                            armyData.units,
                            postURL.searchParams.get('uiHeight'),
                            postURL.searchParams.get('uiWidth'),
                            postURL.searchParams.get('decorativeNames'),
                            buildScript(postURL.searchParams.get("modules").split(",")));
                    } catch (err) {
                        sendHTTPResponse(res, `{ "err": "${ERRORS.unknown}" }`, 500);
                        console.log(err);
                    }
                } else if (postURL.pathname === "/makeArmyAndReturnCode") {
                    // This endpoint effectively combines both of the previous two into one,
                    // supporting a mode whereby you go straight from uploaded file to code
                    // without first getting an opportunity to inspect the parsed list, rename
                    // units, configure options etc.
                    try {
                        // Support the usual inputs just in case, but also default them since this
                        // endpoint isn't being used by the native site.
                        let wargearAllocationMode = postURL.searchParams.get("allocationMode") || "allModels";
                        let uiHeight = postURL.searchParams.get('uiHeight') || "700";
                        let uiWidth = postURL.searchParams.get('uiWidth') || "1200";
                        let decorativeNames = postURL.searchParams.get('decorativeNames') || "";
                        let modules = postURL.searchParams.get("modules") || "MatchedPlay";

                        let filename = postURL.searchParams.get("filename");
                        let armyDataObj;
                        if (path.extname(filename) == '.regiztry') {
                            // Rosterizer registry
                            armyDataObj = rosterizerParse(buf);
                        } else {
                            // Battlescribe roster
                            armyDataObj = roszParse(buf, wargearAllocationMode);
                        }

                        // "What in tarnation is going on here!?" you must be thinking. Well, the parsed army
                        // contains a bunch of maps, as that made the parsing process easier, but the way we
                        // serialize that when responding to a call to /getFormattedArmy ends up flattening
                        // those maps in the resulting JSON. Therefore we're expecting the flattened verison
                        // back on the subsequent call to /getArmyCode. Since we're combining both steps of
                        // that process here, the easiest way to end up with the correct format is to do a hop
                        // via JSON.
                        armyDataObj = JSON.parse(Roster.serialize(armyDataObj, 2));

                        console.log(uuid)
                        sendHTTPResponse(res, `{ "code": "${uuid}" }`, 200);

                        formatAndStoreRoster(uuid,
                            armyDataObj.edition,
                            armyDataObj.order,
                            armyDataObj.units,
                            uiHeight,
                            uiWidth,
                            decorativeNames,
                            buildScript(modules.split(",")));
                    } catch (err) {
                        if (err.toString().includes("Invalid or unsupported zip format.")) {
                            sendHTTPResponse(res, `{ "err": "${ERRORS.invalidFormat}" }`, 415);
                            console.log(err);
                        } else {
                            sendHTTPResponse(res, `{ "err": "${ERRORS.unknown}" }`, 500);
                            console.log(err);
                        }
                    }
                }
            });
        }
        else if (req.method === "GET") {
            if (req.url === "/favicon.ico")
                file.serveFile('/img/favicon.ico', 200, {}, req, res);

            else if (req.url === "/")
                file.serveFile(HOMEPAGE, 200, {}, req, res);

            else {
                let getURL = new URL(`http://${req.headers.host}${req.url}`);

                if (getURL.pathname === "/get_army_by_id") {
                    try {
                        const id = getURL.searchParams.get('id').trim(),
                            fileData = fs.readFileSync(`${PATH_PREFIX}${id}.json`);

                        if (!fileData)
                            sendHTTPResponse(res, `{ "err": "Roster not found!" }`, 404);

                        else
                            sendHTTPResponse(res, fileData);
                    }

                    catch (err) {
                        sendHTTPResponse(res, `{ "err": "${ERRORS.rosterNotFound}" }`, 404);
                        console.log(err);
                    }
                }

                else
                    file.serve(req, res);
            }
        }
    });

/**
 * Sends an http response with the given ServerResponse
 * @param {http.ServerResponse} response The response to write to
 * @param {*} data The data to be written to the response
 * @param {number} code The http header response code
 * @param {string} contentType The content type header to be sent with the response
 */
function sendHTTPResponse(response, data, code = 200, contentType = 'application/json') {
    response.writeHead(code, {'Content-Type': contentType});
    response.write(data);
    response.end();
}

function cleanFiles() {
    fs.readdir(PATH_PREFIX, (err, files) => {
        if (err)
            return;

        if (!files || typeof files[Symbol.iterator] !== 'function') {
            console.log("for some reason files is not iterable");
            return;
        }

        for (const filePath of files) {
            if (!filePath.includes("README") && (Date.now() - TEN_MINUTES) > fs.statSync(PATH_PREFIX + filePath).mtime) {

                fs.unlink(path.join(PATH_PREFIX, filePath), () => {});
            }
        }
    });
}

var scriptBuilder;

function loadModules() {
    scriptBuilder = new ttsScript.ScriptBuilder(MODULE_PATH);
}

/**
 * Formats the given modules into the appropriate lua scripting string to be given to units
 * @param {string[]} modules An array containing the names of the modules to be loaded
 * @returns A string containing the fully formatted lua scripting for the army
 */
function buildScript(modules) {
    return scriptBuilder.build(modules);
}

function formatAndStoreRoster(id, edition, order, armyData, uiHeight, uiWidth, decorativeNames, baseScript) {
    storeFormattedRoster(id, edition, undefined, undefined, armyData, uiHeight, uiWidth, decorativeNames, baseScript, order);
}

function storeFormattedRoster(id, edition, xml, height, armyData, uiHeight, uiWidth, decorativeNames, baseScript, order) {
    fs.writeFileSync(`${PATH_PREFIX}${id}.json`, JSON.stringify({
        xml,
        edition,
        order,
        height,
        armyData: JSON.parse(sanitize(JSON.stringify(armyData))), // yes, I know this looks awful
        uiHeight,
        uiWidth,
        decorativeNames,
        baseScript
    }, null, 2));
}

/**
 * Replaces any troublesome characters with "sanitized" versions so as to not break scripting
 * @param {string} str The string to be sanitized
 * @returns {string} The sanitized string
 */
function sanitize(str) {
    return str.replace(SANITIZATION_REGEX, match => SANITIZATION_MAPPING[match]);
}

module.exports.server = server
module.exports.loadModules = loadModules
module.exports.cleanFiles = cleanFiles