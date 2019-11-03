// Require Node.js Dependencies
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { join, parse, resolve, dirname } from "path";
const { readdir, writeFile, readFile } = fs;

// Require Third-party Dependencies
import semver from "semver";
import semiver from "semiver";

// Node.js constants
const __dirname = dirname(fileURLToPath(import.meta.url));

// CONSTANTS
const ADDONS_DIR = join(__dirname, "..", "..");
const ARCHIVES_DIR = resolve(ADDONS_DIR, "..", "archives");
const ARCHIVES_JSON_PATH = join(ARCHIVES_DIR, "archives.json");
const ARCHIVE_TYPES = new Set(["Addon", "Module"]);

export const constants = Object.freeze({
    ADDONS_DIR,
    ARCHIVES_DIR,
    ARCHIVES_JSON_PATH,
    ARCHIVE_TYPES
});

/**
 * @async
 * @function addInArchiveJSON
 * @param {!string} type
 * @param {!string} addonName
 * @param {!string} version
 * @returns {Promise<void>}
 */
export async function addInArchiveJSON(type, addonName, version) {
    const archiveFile = await readFile(ARCHIVES_JSON_PATH, { encoding: "utf8" });
    const archiveJSON = JSON.parse(archiveFile);
    if (Reflect.has(archiveJSON[type], addonName)) {
        if (!archiveJSON[type][addonName].includes(version)) {
            archiveJSON[type][addonName].push(version);
            archiveJSON[type][addonName] = archiveJSON[type][addonName].sort(semiver);
        }
    }
    else {
        archiveJSON[type][addonName] = [version];
    }

    await writeFile(ARCHIVES_JSON_PATH, JSON.stringify(archiveJSON, null, 4));
}

/**
 * @async
 * @function createArchiveJSON
 * @returns {Promise<void>}
 */
export async function createArchiveJSON() {
    const json = { addons: {}, modules: {} };
    const files = await readdir(ARCHIVES_DIR, { withFileTypes: true });
    for (const dirent of files) {
        if (!dirent.isFile() || dirent.name === "archives.json") {
            continue;
        }

        console.log(`createArchiveJSON: ${dirent.name}`);
        const isTAR = isArchiveTAR(parse(dirent.name).name);
        if (isTAR === null) {
            continue;
        }

        const [type, addonName, version] = isTAR;
        const jsonType = json[type.toLowerCase() === "addon" ? "addons" : "modules"];
        if (Reflect.has(jsonType, addonName)) {
            jsonType[addonName].push(version);
            jsonType[addonName] = jsonType[addonName].sort(semiver);
        }
        else {
            jsonType[addonName] = [version];
        }
    }

    await writeFile(ARCHIVES_JSON_PATH, JSON.stringify(json, null, 4));
}

/**
 * @function splitTAR
 * @param {!string} filename
 * @returns {[string, string, string]}
 */
export function splitTAR(filename) {
    const [type, ...rest] = parse(filename).name.split("-");
    const version = rest.pop();
    const addonName = rest.join("-");

    return [type, addonName, version];
}

/**
 * @function isArchiveTAR
 * @param {!string} fileName
 * @param {boolean} [typeToLower=false]
 * @returns {null | [string, string, string]}
 */
export function isArchiveTAR(fileName, typeToLower = false) {
    const [type, ...rest] = fileName.split("-");
    if (!ARCHIVE_TYPES.has(type)) {
        console.error(`Type ${type} unknow`);

        return null;
    }

    const version = rest.pop();
    const addonName = rest.join("-");
    if (semver.valid(version) === null) {
        console.error(`Version ${version} from ${addonName} not a valid semver`);

        return null;
    }

    if (typeToLower === true) {
        return [type === "Addon" ? "addons" : "modules", addonName, version];
    }

    // pass type to lower case ?
    return [type, addonName, version];
}
