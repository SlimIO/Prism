// Require Node.js Dependencies
const zlib = require("zlib");
const {
    createWriteStream,
    createReadStream,
    promises: { access, mkdir, readdir }
} = require("fs");
const { join, parse } = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
// Require Third-party Dependencies
const uuid = require("uuid/v4");
const tar = require("tar-fs");
const premove = require("premove");

// Require SlimIO Dependencies
const TimeMap = require("@slimio/timemap");
const Addon = require("@slimio/addon");

// CONSTANTS
const ARCHIVES_DIR = join(__dirname, "..", "..", "archives");
const STREAM_ID = new TimeMap(30000);

// Vars
const pipeAsync = promisify(pipeline);

const Prism = new Addon("prism")
    .lockOn("events")
    .lockOn("socket");

Prism.on("awake", () => {
    Prism.ready();
});

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
STREAM_ID.on("expiration", (key, value) => {
    console.log(`STREAM_ID key ${key} has expired!`);
});

Prism.on("start", async() => {
    await createArchivesDir();
});

async function brotliDecompress(filename) {
    const { name } = parse(filename);
    const tarExtractDir = join(ARCHIVES_DIR, "temp", name);

    await pipeAsync(
        createReadStream(join(ARCHIVES_DIR, filename)),
        tar.extract(tarExtractDir)
    );

    try {
        await mkdir(join(ARCHIVES_DIR, name));
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
            createWriteStream(join(ARCHIVES_DIR, name, file))
        );
    });
    await Promise.all(streamPromises);

    await premove(tarExtractDir);
}

async function startBundle(header, name) {
    const writeStream = createWriteStream(join(ARCHIVES_DIR, name));
    const id = uuid();
    STREAM_ID.set(id, { writeStream, name });

    return id;
}

async function sendBundle(header, id, chunk) {
    if (!STREAM_ID.has(id)) {
        throw new Error(`Write stream doesn't exist for id ${id}`);
    }
    const { writeStream } = STREAM_ID.get(id);
    writeStream.write(Buffer.from(chunk.data));
}

async function endBundle(header, id) {
    try {
        const { writeStream, name } = STREAM_ID.get(id);
        writeStream.destroy();
        STREAM_ID.delete(id);
        await brotliDecompress(name);

        return true;
    }
    catch (err) {
        console.log(err);

        return false;
    }
}

Prism.registerCallback("start_bundle", startBundle);
Prism.registerCallback("send_bundle", sendBundle);
Prism.registerCallback("end_bundle", endBundle);

module.exports = Prism;
