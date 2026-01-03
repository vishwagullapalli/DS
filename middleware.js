// Code with explanations and Comments

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const mime = require('mime-types');

const app = express();
app.use(cors()); // Enable Cross-Origin Resource Sharing for client-server communication

const port = 3000; // Middleware server port
const CHUNK_SIZE = 1024; // Size of each chunk (1KB for demonstration purposes)

let servers = []; // List of active servers
let fileRecords = {}; // Metadata for files (e.g., chunk count, file name)

// Configure file upload using multer
const upload = multer({ dest: 'uploads/' });

app.use(express.json()); // Middleware to parse JSON request bodies

/**
 * Generates a unique file ID using a random hash.
 * @returns {string} A unique file ID.
 */
const generateFileId = () => {
    return crypto.randomBytes(16).toString('hex');
};

/**
 * Updates the list of active servers with the provided server name and URL.
 * If the server already exists, its URL is updated.
 */
app.post('/update-server-url', (req, res) => {
    const { serverName, serverUrl } = req.body;

    // Validate the request data
    if (!serverName || !serverUrl) {
        return res.status(400).send('Invalid server data');
    }

    // Check if the server is already in the list
    const existingServer = servers.find(server => server.serverName === serverName);

    if (existingServer) {
        // Update the server's URL
        existingServer.serverUrl = serverUrl;
    } else {
        // Add the new server to the list
        servers.push({ serverName, serverUrl });
    }

    console.log(`Server ${serverName} is updated with ${serverUrl}`);
    res.status(200).send(`Server ${serverName} URL updated`);
});

/**
 * Handles file upload and distributes chunks across available servers.
 */
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const fileId = generateFileId(); // Generate a unique file ID
        const filePath = req.file.path; // Path to the uploaded file
        const fileBuffer = fs.readFileSync(filePath); // Read the entire file into memory
        const chunks = []; // Array to store file chunks

        // Split the file into chunks of predefined size
        for (let i = 0; i < fileBuffer.length; i += CHUNK_SIZE) {
            chunks.push(fileBuffer.slice(i, i + CHUNK_SIZE));
        }

        // Save file metadata (chunk count and original name)
        fileRecords[fileId] = { fileName: req.file.originalname, chunkCount: chunks.length };

        // Distribute chunks across servers using round-robin allocation
        const promises = chunks.map((chunk, index) => {
            const serverIndex = index % servers.length;
            const server = servers[serverIndex];
            console.log(`Sending chunk ${index} to server ${server.serverUrl}`);

            // Store the chunk on the assigned server
            return axios.post(`${server.serverUrl}/store-chunk`, {
                chunk: chunk.toString('base64'), // Encode chunk in Base64
                index,
                fileId,
            }).then(() => {
                // Share the chunk with other servers for redundancy
                return Promise.all(servers.map(otherServer => {
                    if (otherServer.serverUrl !== server.serverUrl) {
                        return axios.post(`${otherServer.serverUrl}/share-chunk`, {
                            chunk: chunk.toString('base64'),
                            index,
                            fileId,
                            originServer: server.serverUrl
                        });
                    }
                }));
            });
        });

        // Wait for all chunk distribution promises to complete
        await Promise.all(promises);

        // Clean up the uploaded file after distribution
        fs.unlinkSync(filePath);
        res.status(200).json({ fileId, fileName: req.file.originalname });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).send(`Upload error: ${err.message}`);
    }
});

/**
 * Retrieves a file by its unique file ID and reassembles it from its chunks.
 */
app.get('/retrieve/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params; // Extract the file ID from the request
        const fileRecord = fileRecords[fileId]; // Look up file metadata

        // Check if the file ID exists in the records
        if (!fileRecord) {
            return res.status(404).send('File not found');
        }

        const { chunkCount, fileName } = fileRecord;
        const retrievedChunks = []; // Array to store retrieved chunks

        // Retrieve each chunk from the appropriate server
        const chunkPromises = [];
        for (let i = 0; i < chunkCount; i++) {
            const serverIndex = i % servers.length;
            const server = servers[serverIndex];
            console.log(`Requesting chunk ${i} from server ${server.serverUrl}`);

            // Request the chunk from the server
            chunkPromises.push(axios.get(`${server.serverUrl}/get-chunk/${fileId}/${i}`));
        }

        // Wait for all chunk retrieval promises to complete
        const chunkResponses = await Promise.all(chunkPromises);

        // Decode and store each chunk
        chunkResponses.forEach(response => {
            retrievedChunks.push(Buffer.from(response.data.chunk, 'base64'));
        });

        // Combine all chunks into a single file
        const fileBuffer = Buffer.concat(retrievedChunks);

        // Set appropriate response headers for file download
        const mimeType = getMimeType(fileName);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Send the reconstructed file
        res.send(fileBuffer);
    } catch (err) {
        console.error('Retrieval error:', err);
        res.status(500).send(`Retrieval error: ${err.message}`);
    }
});

/**
 * Helper function to determine the MIME type of a file based on its extension.
 * @param {string} fileName The name of the file.
 * @returns {string} The MIME type.
 */
function getMimeType(fileName) {
    const mimeType = mime.lookup(fileName); // Use mime-types library to get MIME type
    return mimeType || 'application/octet-stream';
}

/**
 * Retrieves the list of active servers and their URLs.
 */
app.get('/server-list', (req, res) => {
    res.json(servers); // Return the list of servers as JSON
});

// Start the middleware server
app.listen(port, () => {
    console.log(`Middleware running on http://localhost:${port}`);
});
