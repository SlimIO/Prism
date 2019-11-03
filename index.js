// Require Node.js Dependencies
import { join, parse } from "path";
import { createWriteStream, promises as fs } from "fs";
const { mkdir, readFile } = fs;

// Require Third-party Dependencies
import uuid from "uuid";
import tarball from "@slimio/tarball";
import TimeMap from "@slimio/timemap";
import Addon from "@slimio/addon";

// Require Internal Dependencices
import { addInArchiveJSON, createArchiveJSON, isArchiveTAR, constants } from "./src/utils.js";
const { ADDONS_DIR, ARCHIVES_DIR, ARCHIVES_JSON_PATH, ARCHIVE_TYPES } = constants;

/**
 * @typedef {object} BundleStore
 * @property {WriteStream} writeStream
 * @property {string} name
 * @property {string} type
 * @property {string} addonName
 * @property {string} version
 */

/** @type {TimeMap<BundleStore>} */
const STREAM_ID = new TimeMap(10000);

STREAM_ID.on("expiration", async(key, { name, writeStream }) => {
    Prism.logger.writeLine(`STREAM_ID key ${key} has expired!`);
    try {
        writeStream.destroy();
        await unlink(name);
    }
    catch (err) {
        console.error(err);
    }
});

const Prism = new Addon("prism")
    .lockOn("events")
    .lockOn("socket");

Prism.on("start", async() => {
    await mkdir(ARCHIVES_DIR, { recursive: true });
    await createArchiveJSON();
});

Prism.on("awake", async() => {
    await Prism.ready();
});

/**
 * @async
 * @function startBundle
 * @param {!Addon.CallbackHeader} header
 * @param {!string} fileName
 * @returns {Promise<string>}
 *
 * @throws {Error}
 */
async function startBundle(header, fileName) {
    const { name } = parse(fileName);
    const isTAR = isArchiveTAR(name, true);
    if (isTAR === null) {
        throw new Error(`File name ${fileName} is not detected as a .tar archive`);
    }

    const writeStream = createWriteStream(join(ARCHIVES_DIR, fileName));
    const id = uuid.v4();
    const [type, addonName, version] = isTAR;
    STREAM_ID.set(id, { writeStream, name, type, addonName, version });

    return id;
}

/**
 * @async
 * @function sendBundle
 * @param {!Addon.CallbackHeader} header
 * @param {!string} id
 * @param {!Array<number>} chunk
 * @returns {Promise<void>}
 *
 * @throws {Error}
 */
async function sendBundle(header, id, chunk) {
    if (!STREAM_ID.has(id)) {
        throw new Error(`Unknow bundle with id: ${id}`);
    }

    try {
        const { writeStream } = STREAM_ID.get(id, true);
        writeStream.write(Buffer.from(chunk.data));
    }
    catch (err) {
        const { writeStream, name } = STREAM_ID.get(id);
        writeStream.destroy();
        STREAM_ID.delete(id);

        // unsafe ?
        await unlink(name);
        throw err;
    }
}

/**
 * @async
 * @function endBundle
 * @param {!Addon.CallbackHeader} header
 * @param {!string} id
 * @returns {Promise<boolean>}
 *
 * @throws {Error}
 */
async function endBundle(header, id) {
    if (!STREAM_ID.has(id)) {
        throw new Error(`Write stream doesn't exist for id ${id}`);
    }

    try {
        const { writeStream, type, addonName, version } = STREAM_ID.get(id);
        writeStream.destroy();
        STREAM_ID.delete(id);

        await addInArchiveJSON(type, addonName, version);

        return true;
    }
    catch (err) {
        Prism.logger.writeLine(err.message);

        return false;
    }
}

/**
 * @async
 * @function installArchive
 * @param {!Addon.CallbackHeader} header
 * @param {!string} name
 * @param {!string} version
 * @param {object} [options]
 * @param {string} [options.type="Addon"]
 * @param {boolean} [options.force=false]
 * @returns {Promise<void>}
 *
 * @throws {TypeError}
 * @throws {Error}
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

    if (version === "latest") {
        const archiveFile = await readFile(ARCHIVES_JSON_PATH, { encoding: "utf8" });
        const archiveJSON = JSON.parse(archiveFile);

        const keys = Object.keys(archiveJSON[JSONType]);
        if (!keys.includes(name)) {
            throw new Error(`Name ${name} is not repertoried`);
        }
    }

    await tarball.extract(
        join(ARCHIVES_DIR, `${type}-${name}-${version}.tar`),
        join(ADDONS_DIR, name)
    );

    if (JSONType === "addons") {
        await Prism.sendOne("gate.set_config", [`addons.${name}`, { active: true }]);
    }
}

Prism.registerCallback(startBundle);
Prism.registerCallback(sendBundle);
Prism.registerCallback(endBundle);
Prism.registerCallback(installArchive);

export default Prism;
