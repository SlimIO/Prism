"use strict";

// Require Node.js Dependencies
const zlib = require("zlib");
const { join, parse } = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const {
    createWriteStream, createReadStream,
    promises: { mkdir, readdir, readFile }
} = require("fs");

// Require Third-party Dependencies
const uuid = require("uuid/v4");
const tar = require("tar-fs");
const premove = require("premove");

// Require SlimIO Dependencies
const TimeMap = require("@slimio/timemap");
const Addon = require("@slimio/addon");


// Require Internal Dependencies
const {
    ADDONS_DIR,
    ARCHIVES_DIR,
    ARCHIVE_TYPES,
    createArchivesDir,
    addInArchiveJSON,
    createArchiveJSON,
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

STREAM_ID.on("expiration", (key, value) => {
    console.log(`STREAM_ID key ${key} has expired!`);
});

Prism.on("start", async() => {
    await createArchivesDir();
    await createArchiveJSON();
});

/**
 * @async
 * @function brotliDecompress
 * @param {!string} type
 * @param {!string} addonName
 * @param {!string} version
 * @param {boolean} [force=false]
 * @returns {Promise<void>}
 */
async function brotliDecompress(type, addonName, version, force = false) {
    const fileName = `${type}-${addonName}-${version}.tar`;
    const tarExtractDir = join(ARCHIVES_DIR, "temp", addonName);

    try {
        await pipeAsync(
            createReadStream(join(ARCHIVES_DIR, fileName)),
            tar.extract(tarExtractDir)
        );
        await mkdir(join(ADDONS_DIR, addonName), { recursive: true });

        console.log("mkdir ok");

        const files = await readdir(tarExtractDir);
        // eslint-disable-next-line
        const streamPromises = files.map((file) => {
            return pipeAsync(
                createReadStream(join(tarExtractDir, file)),
                zlib.createBrotliDecompress(),
                createWriteStream(join(ADDONS_DIR, addonName, file))
            );
        });
        await Promise.all(streamPromises);
    }
    finally {
        await premove(tarExtractDir);
    }
}

/**
 * @async
 * @function startBundle
 * @param {*} header
 * @param {!string} fileName
 * @returns {Promise<string>}
 */
async function startBundle(header, fileName) {
    const { name } = parse(fileName);
    const isTAR = isArchiveTAR(name, true);
    if (isTAR === false) {
        throw new Error(`File name ${fileName} is not detected as a .tar archive`);
    }
    const writeStream = createWriteStream(join(ARCHIVES_DIR, fileName));
    const id = uuid();
    const [type, addonName, version] = isTAR;
    STREAM_ID.set(id, { writeStream, name, type, addonName, version });

    return id;
}

/**
 * @async
 * @function sendBundle
 * @param {*} header
 * @param {!string} id
 * @param {!object} chunk
 * @returns {Promise<void>}
 */
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

/**
 * @async
 * @function endBundle
 * @param {*} header
 * @param {!string} id
 * @returns {Promise<boolean>}
 */
async function endBundle(header, id) {
    try {
        const { writeStream, type, addonName, version } = STREAM_ID.get(id);
        writeStream.destroy();
        STREAM_ID.delete(id);

        await addInArchiveJSON(type, addonName, version);

        return true;
    }
    catch (err) {
        console.log(err);

        return false;
    }
}

/**
 * @async
 * @function installArchive
 * @param {*} header
 * @param {!string} name
 * @param {!string} version
 * @param {*} options
 * @returns {Promise<void>}
 */
async function installArchive(header, name, version, options = Object.create(null)) {
    if (typeof name !== "string") {
        throw new TypeError("Name param must be a typeof <string>");
    }
    if (typeof version !== "string") {
        throw new TypeError("Version param must be a typeof <string>");
    }
    const { type = "Addon", force = false } = options;
    if (!ARCHIVE_TYPES.has(type)) {
        throw new Error(`Type ${type} is not repertoried`);
    }
    const JSONType = type === "Addon" ? "addons" : "modules";

    const ver = version;
    if (version === "latest") {
        const archiveFile = await readFile(ARCHIVES_JSON_PATH, { encoding: "utf8" });
        const archiveJSON = JSON.parse(archiveFile);

        const keys = Object.keys(archiveJSON[JSONType]);
        if (!keys.includes(name)) {
            throw new Error(`Name ${name} is not repertoried`);
        }
    }
    await brotliDecompress(type, name, ver, force);

    if (JSONType === "addons") {
        await Prism.sendOne("gate.set_config", [`addons.${name}`, { active: true }]);
    }
}

Prism.registerCallback("start_bundle", startBundle);
Prism.registerCallback("send_bundle", sendBundle);
Prism.registerCallback("end_bundle", endBundle);
Prism.registerCallback("install_archive", installArchive);

module.exports = Prism;
