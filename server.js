const express = require('express');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ddoh6pjin',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create temp directory on startup
const tempDir = path.join('/tmp', 'video-processing');
fs.mkdir(tempDir, { recursive: true }).catch(console.error);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'FFmpeg Video API is running!',
    timestamp: new Date().toISOString()
  });
});

// Create video endpoint
app.post('/create-video', async (req, res) => {
  const { audioUrl, imageUrl, duration = 180 } = req.body;
  
  console.log('Received request:', { audioUrl, imageUrl, duration });
  
  if (!audioUrl || !imageUrl) {
    return res.status(400).json({ error: 'audioUrl and imageUrl are required' });
  }

  const uniqueId = Date.now();
  const audioPath = path.join(tempDir, `audio_${uniqueId}.mp3`);
  const imagePath = path.join(tempDir, `image_${uniqueId}.jpg`);
  const outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);

  try {
    console.log('Downloading files...');
    
    // Download audio
    const audioResponse = await axios({
      method: 'GET',
      url: audioUrl,
      responseType: 'stream'
    });
    
    const writer1 = fs.createWriteStream(audioPath);
    audioResponse.data.pipe(writer1);
    await new Promise((resolve, reject) => {
      writer1.on('finish', resolve);
      writer1.on('error', reject);
    });
    
    // Download image
    const imageResponse = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream'
    });
    
    const writer2 = fs.createWriteStream(imagePath);
    imageResponse.data.pipe(writer2);
    await new Promise((resolve, reject) => {
      writer2.on('finish', resolve);
      writer2.on('error', reject);
    });

    console.log('Creating video...');
    
    // Create video
    await new Promise((resolve, reject) => {
      ffmpeg(imagePath)
        .loop(duration)
        .addInput(audioPath)
        .outputOptions([
          '-c:v libx264',
          '-tune stillimage',
          '-c:a aac',
          '-b:a 192k',
          '-pix_fmt yuv420p',
          '-shortest'
        ])
        .on('end', () => {
          console.log('Video created successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .save(outputPath);
    });

    console.log('Uploading to Cloudinary...');
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'linkedin-songs'
    });

    // Clean up temp files
    await fs.unlink(audioPath).catch(console.error);
    await fs.unlink(imagePath).catch(console.error);
    await fs.unlink(outputPath).catch(console.error);

    console.log('Success! Video URL:', result.secure_url);
    
    res.json({
      success: true,
      videoUrl: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Error in create-video:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.toString()
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
