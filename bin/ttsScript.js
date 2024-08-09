const fs = require("fs");
const path = require("path");

class ScriptBuilder {

    constructor(modulePath) {
        this.availableModules = this.loadModules(modulePath)
    }

    loadModules(modulePath) {
        let moduleMapText = fs.readFileSync(path.join(modulePath, "module_mapping.json"));

        let loadedModules = {
            MatchedPlay: {
                Constants: null,
                Module: null,
                ScriptKeys: null
            },
            Crusade: {
                Constants: null,
                Module: null,
                ScriptKeys: null
            }
        }

        for (const [name, module] of Object.entries(JSON.parse(moduleMapText))) {
            if (!loadedModules[name])
                continue;

            for (const [field, fieldData] of Object.entries(module)) {
                if (field === "ScriptKeys")
                    loadedModules[name].ScriptKeys = fieldData;
                else
                    loadedModules[name][field] = fs.readFileSync(path.join(modulePath, fieldData));
            }
        }

        return loadedModules;
    }

    /**
     * Formats the given modules into the appropriate lua scripting string to be given to units
     * @param {string[]} modules An array containing the names of the modules to be loaded
     * @returns A string containing the fully formatted lua scripting for the army
     */
    build(modules) {
        return fs.readFileSync("lua_modules/Rosterizer.lua").toString()
    }
}

module.exports.ScriptBuilder = ScriptBuilder;