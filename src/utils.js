// Require Node.js Dependencies
const {
    access, mkdir, readdir, writeFile, readFile
} = require("fs").promises;
const { join, parse, resolve } = require("path");

// Require Third-party Dependencies
const semver = require("semver");
const semverSort = require("semver-sort");

// CONSTANTS
const ADDONS_DIR = join(__dirname, "..", "..");
const ARCHIVES_DIR = resolve(ADDONS_DIR, "..", "archives");
const ARCHIVES_JSON_PATH = join(ARCHIVES_DIR, "archives.json");
const ARCHIVE_TYPES = new Set(["Addon", "Module"]);

async function createArchivesDir() {
    try {
        await access(ARCHIVES_DIR);
    }
    catch ({ code }) {
        if (code === "ENOENT") {
            await mkdir(ARCHIVES_DIR);
        }
    }
}

async function writeArchiveJSON(obj) {
    await writeFile(ARCHIVES_JSON_PATH, JSON.stringify(obj, null, 4));
}

async function addInArchiveJSON(type, addonName, version) {
    const archiveFile = await readFile(ARCHIVES_JSON_PATH, { encoding: "utf8" });
    const archiveJSON = JSON.parse(archiveFile);
    if (Reflect.has(archiveJSON[type], addonName)) {
        if (!archiveJSON[type][addonName].includes(version)) {
            const versions = archiveJSON[type][addonName];
            versions.push(version);
            semverSort.desc(versions);
        }
    }
    else {
        archiveJSON[type][addonName] = [version];
    }
    await writeArchiveJSON(archiveJSON);
}

async function createArchiveJSON() {
    const json = { addons: {}, modules: {} };
    const files = await readdir(ARCHIVES_DIR, { withFileTypes: true });
    for (const dirent of files) {
        if (!dirent.isFile() || dirent.name === "archives.json") {
            continue;
        }
        console.log(`createArchiveJSON: ${dirent.name}`);
        const { name } = parse(dirent.name);
        const isTAR = isArchiveTAR(name);
        if (!isTAR) {
            continue;
        }
        const [type, addonName, version] = isTAR;

        const jsonType = json[type.toLowerCase() === "addon" ? "addons" : "modules"];
        if (Reflect.has(jsonType, addonName)) {
            const versions = jsonType[addonName];
            versions.push(version);
            semverSort.desc(versions);
        }
        else {
            jsonType[addonName] = [version];
        }
    }
    await writeArchiveJSON(json);
}

function splitTAR(filename) {
    const { name } = parse(filename);
    const [type, ...rest] = name.split("-");
    const version = rest.pop();
    const addonName = rest.join("-");

    return [type, addonName, version];
}

function isArchiveTAR(fileName, typeToLower = false) {
    const [type, ...rest] = fileName.split("-");
    if (!ARCHIVE_TYPES.has(type)) {
        console.error(`Type ${type} unknow`);

        return false;
    }

    const version = rest.pop();
    const addonName = rest.join("-");
    if (semver.valid(version) === null) {
        console.error(`Version ${version} from ${addonName} not a valid semver`);

        return false;
    }

    if (typeToLower === true) {
        return [type === "Addon" ? "addons" : "modules", addonName, version];
    }

    // pass type to lower case ?
    return [type, addonName, version];
}

module.exports = {
    ADDONS_DIR,
    ARCHIVES_DIR,
    ARCHIVES_JSON_PATH,
    ARCHIVE_TYPES,

    createArchivesDir,
    addInArchiveJSON,
    createArchiveJSON,
    splitTAR,
    isArchiveTAR
};
