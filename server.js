// Readable codes with comments 

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fsp = require('fs').promises;

const app = express();
const port = 4000;
const CHUNKS_DIR = './chunks/';

// Ensure the chunks directory exists for storing files
if (!fs.existsSync(CHUNKS_DIR)) {
    fs.mkdirSync(CHUNKS_DIR);
    console.log(`Created chunks directory: ${CHUNKS_DIR}`);
}

app.use(express.json()); // Middleware to parse JSON bodies

/**
 * Stores a chunk of a file in the server's local storage.
 */
app.post('/store-chunk', async (req, res) => {
    try {
        const { chunk, index, fileId } = req.body; // Extract chunk details from request
        const fileFolder = path.join(CHUNKS_DIR, fileId);

        // Ensure the file folder exists
        await fsp.mkdir(fileFolder, { recursive: true });
        console.log(`Created file folder: ${fileFolder}`);

        // Write the chunk to a file
        const chunkPath = path.join(fileFolder, `chunk_${index}`);
        await fsp.writeFile(chunkPath, Buffer.from(chunk, 'base64'));
        console.log(`Stored chunk ${index} for file ${fileId}`);

        res.status(200).send('Chunk stored successfully');
    } catch (error) {
        console.error('Error storing chunk:', error);
        res.status(500).send('Error storing chunk');
    }
});

/**
 * Shares a chunk of a file with peer servers for redundancy.
 */
app.post('/share-chunk', async (req, res) => {
    try {
        const { chunk, index, fileId, originServer } = req.body;
        const fileFolder = path.join(CHUNKS_DIR, fileId);

        // Ensure the file folder exists
        await fsp.mkdir(fileFolder, { recursive: true });
        console.log(`Created file folder: ${fileFolder}`);

        // Write the chunk to a file
        const chunkPath = path.join(fileFolder, `chunk_${index}`);
        await fsp.writeFile(chunkPath, Buffer.from(chunk, 'base64'));
        console.log(`Shared chunk ${index} for file ${fileId} from ${originServer}`);

        res.status(200).send('Chunk shared successfully');
    } catch (error) {
        console.error('Error sharing chunk:', error);
        res.status(500).send('Error sharing chunk');
    }
});

/**
 * Retrieves a specific chunk from local storage.
 */
app.get('/get-chunk/:fileId/:index', (req, res) => {
    const { fileId, index } = req.params; // Extract file ID and chunk index
    const fileFolder = path.join(CHUNKS_DIR, fileId);
    const chunkPath = path.join(fileFolder, `chunk_${index}`);

    if (fs.existsSync(chunkPath)) {
        const chunk = fs.readFileSync(chunkPath).toString('base64');
        console.log(`Retrieved chunk ${index} for file ${fileId}`);
        res.json({ chunk });
    } else {
        console.log(`Chunk ${index} for file ${fileId} not found`);
        res.status(404).send('Chunk not found');
    }
});

// Server sends periodic heartbeats to the middleware
// Unique name for the server in Distributed System
// Does not change even if IP changes
const serverName = 'debian-server';
// The URLs does not change even if IP changes (Ngrok or Tunnelmole)
const serverUrl = 'https://example-server-url';
const middlewareURL = 'https://example-middleware-url/update-server-url';

/**
 * Sends a heartbeat to the middleware to indicate server availability.
 */
const sendHeartbeat = async () => {
    try {
        await axios.post(middlewareURL, { serverName, serverUrl });
        console.log(`Heartbeat sent: ${serverName} - ${serverUrl}`);
    } catch (error) {
        console.error('Error sending heartbeat:', error.message);
    }
};

setInterval(sendHeartbeat, 30000); // Send heartbeat every 30 seconds
sendHeartbeat(); // Send an initial heartbeat

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
