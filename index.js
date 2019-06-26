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
    addInArchiveJSON,
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

STREAM_ID.on("expiration", (key, value) => {
    console.log(`STREAM_ID key ${key} has expired!`);
});

Prism.on("start", async() => {
    await createArchivesDir();
    await createArchiveJSON();
});

// eslint-disable-next-line max-params
async function brotliDecompress(type, addonName, version, force = false) {
    const fileName = `${type}-${addonName}-${version}.tar`;
    console.log(fileName);
    const tarExtractDir = join(ARCHIVES_DIR, "temp", addonName);
    console.log(`tarExtractDir ${tarExtractDir}`);

    await pipeAsync(
        createReadStream(join(ARCHIVES_DIR, fileName)),
        tar.extract(tarExtractDir)
    );
    console.log("extraction ok");


    try {
        await mkdir(join(ADDONS_DIR, addonName));
    }
    catch (err) {
        // Ignore
    }

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

    await premove(tarExtractDir);
}

// add force option if already exist ?
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

        await addInArchiveJSON(type, addonName, version);

        return true;
    }
    catch (err) {
        console.log(err);

        return false;
    }
}

// eslint-disable-next-line max-params
async function installArchive(header, name, version, options = Object.create(null)) {
    console.log("installArchive");
    if (typeof name !== "string") {
        throw new TypeError("Name param must be a typeof <string>");
    }
    console.log("name typeError passed");
    if (typeof version !== "string") {
        throw new TypeError("Version param must be a typeof <string>");
    }
    console.log("version typeError passed");
    const { type = "Addon", force = false } = options;
    if (!ARCHIVE_TYPES.has(type)) {
        throw new Error(`Type ${type} is not repertoried`);
    }
    const JSONType = type === "Addon" ? "addons" : "modules";
    console.log(JSONType);

    const ver = version;
    if (version === "latest") {
        console.log("latest");
        const archiveFile = await readFile(ARCHIVES_JSON_PATH, { encoding: "utf8" });
        const archiveJSON = JSON.parse(archiveFile);

        const keys = Object.keys(archiveJSON[JSONType]);
        if (!keys.includes(name)) {
            throw new Error(`Name ${name} is not repertoried`);
        }
        const versions = archiveJSON[JSONType][name];
    }
    console.log("find good version");
    await brotliDecompress(type, name, ver, force);

}

Prism.registerCallback("start_bundle", startBundle);
Prism.registerCallback("send_bundle", sendBundle);
Prism.registerCallback("end_bundle", endBundle);
Prism.registerCallback("install_archive", installArchive);

module.exports = Prism;
