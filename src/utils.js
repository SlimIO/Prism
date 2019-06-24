// Require Node.js Dependencies
const {
    createWriteStream,
    createReadStream,
    promises: { access, mkdir, readdir, writeFile, readFile }
} = require("fs");
const { join, parse, resolve } = require("path");

// Require Third-party Dependencies
const semver = require("semver");

// CONSTANTS
const ADDONS_DIR = join(__dirname, "..", "..");
const ARCHIVES_DIR = resolve(ADDONS_DIR, "..", "archives");
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

async function createArchiveJSON() {
    const json = { addons: {}, modules: {} };
    const files = await readdir(ARCHIVES_DIR, { withFileTypes: true });
    for (const dirent of files) {
        if (!dirent.isFile() || dirent.name === "archives.json") {
            continue;
        }

        const isTAR = isArchiveTAR(dirent.name);
        if (!isTAR) {
            continue;
        }
        const [type, addonName, version] = isTAR;

        const jsonType = json[type.toLowerCase() === "addon" ? "addons" : "modules"];
        if (Reflect.has(jsonType, addonName)) {
            jsonType[addonName].push(version);
        }
        else {
            jsonType[addonName] = [version];
        }
    }
    await writeFile(join(ARCHIVES_DIR, "archives.json"), JSON.stringify(json, null, 4));
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
    ARCHIVE_TYPES,
    createArchivesDir,
    createArchiveJSON,
    splitTAR,
    isArchiveTAR
};
