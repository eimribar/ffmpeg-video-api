const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(express.json());

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Running!' });
});

// Create video - DEAD SIMPLE
app.post('/create-video', async (req, res) => {
  const { audioUrl, imageUrl } = req.body;
  
  const uniqueId = Date.now();
  const outputPath = `/tmp/output_${uniqueId}.mp4`;

  try {
    // One simple FFmpeg command - that's it!
    const ffmpegCommand = `ffmpeg -i "${imageUrl}" -i "${audioUrl}" -c:v copy -c:a copy -shortest ${outputPath} -y`;
    
    await execPromise(ffmpegCommand);
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'linkedin-songs'
    });

    // Clean up
    fs.unlinkSync(outputPath);
    
    res.json({
      success: true,
      videoUrl: result.secure_url
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 10000);
