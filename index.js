// Require Node.js Dependencies
const zlib = require("zlib");
const {
    createWriteStream,
    createReadStream,
    promises: { access, mkdir, readdir, writeFile, readFile }
} = require("fs");
const { join, parse } = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");

// Require Third-party Dependencies
const uuid = require("uuid/v4");
const tar = require("tar-fs");
const premove = require("premove");
const semver = require("semver");

// Require SlimIO Dependencies
const TimeMap = require("@slimio/timemap");
const Addon = require("@slimio/addon");


// Require Internal Dependencies
const {
    ADDONS_DIR,
    ARCHIVES_DIR,
    ARCHIVE_TYPES,
    createArchivesDir,
    createArchiveJSON,
    splitTAR,
    isArchiveTAR
} = require("./src/utils");


// CONSTANTS
const STREAM_ID = new TimeMap(30000);

// Vars
const pipeAsync = promisify(pipeline);

const Prism = new Addon("prism")
    .lockOn("events")
    .lockOn("socket");

Prism.on("awake", () => {
    Prism.ready();
});

// async function createArchiveJSON() {
//     const json = { addons: {}, modules: {} };
//     const files = await readdir(ARCHIVES_DIR, { withFileTypes: true });
//     for (const dirent of files) {
//         if (!dirent.isFile() || dirent.name === "archives.json") {
//             continue;
//         }

//         const isTAR = isArchiveTAR(dirent.name);
//         if (!isTAR) {
//             continue;
//         }
//         const [type, addonName, version] = isTAR;

//         const jsonType = json[type.toLowerCase() === "addon" ? "addons" : "modules"];
//         if (Reflect.has(jsonType, addonName)) {
//             jsonType[addonName].push(version);
//         }
//         else {
//             jsonType[addonName] = [version];
//         }
//     }
//     await writeFile(join(ARCHIVES_DIR, "archives.json"), JSON.stringify(json, null, 4));
// }

STREAM_ID.on("expiration", (key, value) => {
    console.log(`STREAM_ID key ${key} has expired!`);
});

Prism.on("start", async() => {
    await createArchivesDir();
    await createArchiveJSON();
});

// eslint-disable-next-line max-params
async function brotliDecompress(type, filename, version, force) {
    const { name } = parse(filename);
    const tarExtractDir = join(ARCHIVES_DIR, "temp", name);

    await pipeAsync(
        createReadStream(join(ARCHIVES_DIR, filename)),
        tar.extract(tarExtractDir)
    );

    try {
        await mkdir(join(ADDONS_DIR, name));
    }
    catch (err) {
        // Ignore
    }

    const files = await readdir(tarExtractDir);
    // eslint-disable-next-line
    const streamPromises = files.map((file) => {
        return pipeAsync(
            createReadStream(join(tarExtractDir, file)),
            zlib.createBrotliDecompress(),
            createWriteStream(join(ADDONS_DIR, name, file))
        );
    });
    await Promise.all(streamPromises);

    await premove(tarExtractDir);
}

async function startBundle(header, fileName) {
    const { name } = parse(fileName);
    const isTAR = isArchiveTAR(name, true);
    if (isTAR === false) {
        throw new Error(`File name ${fileName} is not detected as a .tar archive`);
    }
    const writeStream = createWriteStream(join(ARCHIVES_DIR, name));
    const id = uuid();
    const [type, addonName, version] = isTAR;
    STREAM_ID.set(id, { writeStream, name, type, addonName, version });

    return id;
}

async function sendBundle(header, id, chunk) {
    try {
        if (!STREAM_ID.has(id)) {
            throw new Error(`Write stream doesn't exist for id ${id}`);
        }
        const { writeStream } = STREAM_ID.get(id);
        writeStream.write(Buffer.from(chunk.data));
    }
    catch (err) {
        const { writeStream, name } = STREAM_ID.get(id);
        writeStream.destroy();
        await unlink(name);
        STREAM_ID.delete(id);
        throw err;
    }
}

async function endBundle(header, id) {
    try {
        const { writeStream, type, addonName, version } = STREAM_ID.get(id);
        writeStream.destroy();
        STREAM_ID.delete(id);

        const archiveJSONPath = join(ARCHIVES_DIR, "archives.json");
        const archiveFile = await readFile(archiveJSONPath, { encoding: "utf8" });
        const archiveJSON = JSON.parse(archiveFile);
        if (Reflect.has(archiveJSON[type], addonName)) {
            if (!archiveJSON[type][addonName].includes(version)) {
                archiveJSON[type][addonName].push(version);
            }
        }
        else {
            archiveJSON[type][addonName] = [version];
        }
        await writeFile(archiveJSONPath, JSON.stringify(archiveJSON, null, 4));

        return true;
    }
    catch (err) {
        console.log(err);

        return false;
    }
}

// eslint-disable-next-line max-params
async function installArchive(header, name, version, options = Object.create(null)) {
    // const type = options.type ? options.type.toLowerCase() : "Addon";
    // const { type = "Addon", force = false } = options;
    // if (!ARCHIVE_TYPES.has(type))

    await brotliDecompress(type, name, version, force);
}

Prism.registerCallback("start_bundle", startBundle);
Prism.registerCallback("send_bundle", sendBundle);
Prism.registerCallback("end_bundle", endBundle);
Prism.registerCallback("install_archive", installArchive);

module.exports = Prism;
